import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { askMinutes, generateWithLocalModel } from "../services/aiService";

export const aiRouter = Router();

const askSchema = z.object({
  question: z.string().min(3)
});

const promptPlaygroundSchema = z.object({
  prompt: z.string().min(1).max(4000),
  model: z.string().min(1).default("qwen2.5:7b")
});

const speakerSegmentSchema = z.object({
  speaker: z.enum(["A", "B", "C"]),
  text: z.string().min(1),
  startMs: z.number().int().nonnegative().optional(),
  endMs: z.number().int().nonnegative().optional()
});

const analyzeSpeakerSchema = z.object({
  model: z.string().min(1).default("qwen2.5:7b"),
  language: z.string().optional(),
  segments: z.array(speakerSegmentSchema).default([])
});

const recordingDir = path.join(process.cwd(), "uploads", "recordings");
fs.mkdirSync(recordingDir, { recursive: true });

const upload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, cb) => cb(null, recordingDir),
    filename: (_req, file, cb) => {
      const safeExt = path.extname(file.originalname || "").slice(0, 10) || ".webm";
      const random = Math.random().toString(36).slice(2, 10);
      cb(null, `${Date.now()}-${random}${safeExt}`);
    }
  }),
  limits: {
    fileSize: 100 * 1024 * 1024
  }
});

aiRouter.post("/ask", requireAuth, async (req, res) => {
  const parsed = askSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const result = await askMinutes(parsed.data.question);
  res.json(result);
});

aiRouter.post("/playground/generate", async (req, res) => {
  const parsed = promptPlaygroundSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  try {
    const data = await generateWithLocalModel({
      model: parsed.data.model,
      prompt: parsed.data.prompt
    });

    return res.json({
      model: data.model,
      output: data.output
    });
  } catch (error) {
    return res.status(502).json({
      message: "Cannot connect to local Ollama server",
      detail: error instanceof Error ? error.message : "unknown error"
    });
  }
});

aiRouter.post("/playground/record/upload", upload.single("audio"), async (req, res) => {
  if (!req.file) {
    return res.status(400).json({ message: "Missing audio file" });
  }

  return res.status(201).json({
    fileName: req.file.filename,
    originalName: req.file.originalname,
    mimeType: req.file.mimetype,
    size: req.file.size,
    fileUrl: `/ai/playground/recordings/${encodeURIComponent(req.file.filename)}`
  });
});

aiRouter.get("/playground/recordings/:fileName", async (req, res) => {
  const fileName = path.basename(req.params.fileName);
  const fullPath = path.join(recordingDir, fileName);
  if (!fs.existsSync(fullPath)) {
    return res.status(404).json({ message: "Recording not found" });
  }

  return res.sendFile(fullPath);
});

aiRouter.post("/playground/diarize-analyze", async (req, res) => {
  const parsed = analyzeSpeakerSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ message: "Invalid payload", errors: parsed.error.flatten() });
  }

  const merged: Array<{
    speaker: "A" | "B" | "C";
    text: string;
    startMs?: number;
    endMs?: number;
  }> = [];
  const maxTurnGapMs = 2600;
  for (const seg of parsed.data.segments) {
    const segStart = typeof seg.startMs === "number" ? seg.startMs : undefined;
    const segEnd = typeof seg.endMs === "number" ? seg.endMs : segStart;
    const last = merged[merged.length - 1];
    const canMergeByGap =
      typeof segStart !== "number" ||
      typeof last?.endMs !== "number" ||
      segStart - last.endMs <= maxTurnGapMs;

    if (last && last.speaker === seg.speaker && canMergeByGap) {
      last.text = `${last.text} ${seg.text}`.trim();
      if (typeof segEnd === "number") {
        last.endMs = typeof last.endMs === "number" ? Math.max(last.endMs, segEnd) : segEnd;
      }
    } else {
      merged.push({
        speaker: seg.speaker,
        text: seg.text.trim(),
        startMs: segStart,
        endMs: segEnd
      });
    }
  }

  const formatOffset = (ms?: number): string => {
    if (typeof ms !== "number" || ms < 0) {
      return "--:--:--";
    }
    const totalSeconds = Math.floor(ms / 1000);
    const hh = String(Math.floor(totalSeconds / 3600)).padStart(2, "0");
    const mm = String(Math.floor((totalSeconds % 3600) / 60)).padStart(2, "0");
    const ss = String(totalSeconds % 60).padStart(2, "0");
    return `${hh}:${mm}:${ss}`;
  };

  const transcript = merged
    .map((s) => {
      const from = formatOffset(s.startMs);
      const to = formatOffset(s.endMs);
      return `[${from} - ${to}] Speaker ${s.speaker}: ${s.text}`;
    })
    .join("\n");
  if (!transcript) {
    return res.json({
      transcript: "",
      summary: "No speech segments captured yet."
    });
  }

  const prompt = [
    "You are a meeting assistant.",
    "Given transcript with Speaker A/B/C, provide:",
    "1) concise summary",
    "2) key decisions",
    "3) action items with owner speaker labels",
    "Answer in Thai.",
    parsed.data.language ? `Language hint: ${parsed.data.language}` : "",
    "",
    transcript
  ].filter(Boolean).join("\n");

  try {
    const data = await generateWithLocalModel({
      model: parsed.data.model,
      prompt
    });

    return res.json({
      transcript,
      summary: data.output
    });
  } catch (error) {
    return res.status(502).json({
      message: "Cannot connect to local Ollama server",
      detail: error instanceof Error ? error.message : "unknown error",
      transcript
    });
  }
});

aiRouter.get("/playground/page.js", (_req, res) => {
  res.type("application/javascript").send(`const promptEl = document.getElementById("prompt");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const sendBtn = document.getElementById("send");
const clearBtn = document.getElementById("clear");
const startRecBtn = document.getElementById("startRec");
const stopRecBtn = document.getElementById("stopRec");
const analyzeRecBtn = document.getElementById("analyzeRec");
const recStatusEl = document.getElementById("recordingStatus");
const transcriptEl = document.getElementById("speakerTranscript");
const audioInfoEl = document.getElementById("audioInfo");
const promptScreenEl = document.getElementById("promptScreen");
const recordScreenEl = document.getElementById("recordScreen");
const screenTabs = Array.from(document.querySelectorAll("[data-screen-tab]"));
const menuToggleEl = document.getElementById("menuToggle");
const mobileMenuEl = document.getElementById("mobileMenu");
const menuIconOpenEl = document.getElementById("menuIconOpen");
const menuIconCloseEl = document.getElementById("menuIconClose");
const DEFAULT_MODEL = "qwen2.5:7b";

let statusTimer = null;
let typingTimer = null;
let mediaRecorder = null;
let mediaStream = null;
let recognition = null;
let isRecording = false;
let audioChunks = [];
let segments = [];
let recordingStart = 0;
let recordingWallStart = 0;
let audioContext = null;
let micSource = null;
let analyserNode = null;
let analysisTimer = null;
let timeDomainData = null;
let freqData = null;
let voiceFrames = [];
let speakerProfiles = {};
let autoSpeakerIndex = 0;
let lastSegmentAt = 0;
let lastAssignedSpeaker = null;
let lastSpeakerSwitchAt = 0;
const sameSpeakerHoldMs = 7000;
const switchCooldownMs = 10000;
const strongSwitchDist = 0.4;
const strongSwitchMargin = 0.28;

function setStatus(text) {
  statusEl.textContent = text || "";
}

function setBusy(isBusy) {
  sendBtn.disabled = isBusy;
  sendBtn.textContent = isBusy ? "Generating..." : "Generate";
  if (isBusy) {
    resultEl.classList.add("loading");
    statusEl.classList.add("busy");
  } else {
    resultEl.classList.remove("loading");
    statusEl.classList.remove("busy");
  }
}

function setRecordingControls(recording) {
  if (recording) {
    startRecBtn.classList.add("hidden");
    stopRecBtn.classList.remove("hidden");
  } else {
    stopRecBtn.classList.add("hidden");
    startRecBtn.classList.remove("hidden");
  }
}

function setActiveScreen(screen) {
  const showPrompt = screen === "prompt";
  promptScreenEl.classList.toggle("hidden", !showPrompt);
  recordScreenEl.classList.toggle("hidden", showPrompt);

  screenTabs.forEach((btn) => {
    const active = btn.dataset.screenTab === screen;
    btn.classList.toggle("bg-blue-600", active);
    btn.classList.toggle("text-white", active);
    btn.classList.toggle("border-blue-600", active);
    btn.classList.toggle("bg-white", !active);
    btn.classList.toggle("text-slate-600", !active);
  });
}

function setupMobileMenu() {
  if (!menuToggleEl || !mobileMenuEl || !menuIconOpenEl || !menuIconCloseEl) {
    return;
  }

  const setOpen = (open) => {
    mobileMenuEl.classList.toggle("hidden", !open);
    menuIconOpenEl.classList.toggle("hidden", open);
    menuIconCloseEl.classList.toggle("hidden", !open);
    menuToggleEl.setAttribute("aria-expanded", String(open));
  };

  setOpen(false);
  menuToggleEl.addEventListener("click", () => {
    const isOpen = !mobileMenuEl.classList.contains("hidden");
    setOpen(!isOpen);
  });
}

function startStatusPulse() {
  const frames = ["Generating", "Generating.", "Generating..", "Generating..."];
  let idx = 0;
  setStatus(frames[idx]);
  statusTimer = setInterval(() => {
    idx = (idx + 1) % frames.length;
    setStatus(frames[idx]);
  }, 260);
}

function stopStatusPulse(finalText) {
  if (statusTimer) {
    clearInterval(statusTimer);
    statusTimer = null;
  }
  setStatus(finalText || "");
}

function stopTyping() {
  if (typingTimer) {
    clearInterval(typingTimer);
    typingTimer = null;
  }
}

function typewrite(text, onDone) {
  stopTyping();
  resultEl.textContent = "";
  const chars = Array.from(text || "");
  if (!chars.length) {
    onDone();
    return;
  }

  const step = Math.max(1, Math.floor(chars.length / 220));
  let i = 0;
  typingTimer = setInterval(() => {
    i += step;
    resultEl.textContent = chars.slice(0, i).join("");
    if (i >= chars.length) {
      stopTyping();
      onDone();
    }
  }, 12);
}

function calculateRms(samples) {
  if (!samples || !samples.length) {
    return 0;
  }
  let sum = 0;
  for (let i = 0; i < samples.length; i += 1) {
    const v = samples[i] || 0;
    sum += v * v;
  }
  return Math.sqrt(sum / samples.length);
}

function calculateSpectralCentroid(freq, sampleRate) {
  if (!freq || !freq.length) {
    return 0;
  }
  let weighted = 0;
  let total = 0;
  const binHz = sampleRate / 2 / freq.length;
  for (let i = 0; i < freq.length; i += 1) {
    const mag = freq[i] || 0;
    total += mag;
    weighted += mag * i * binHz;
  }
  if (!total) {
    return 0;
  }
  return weighted / total;
}

function startVoiceAnalysis(stream) {
  try {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) {
      return;
    }

    audioContext = new Ctx();
    micSource = audioContext.createMediaStreamSource(stream);
    analyserNode = audioContext.createAnalyser();
    analyserNode.fftSize = 2048;
    analyserNode.smoothingTimeConstant = 0.75;
    micSource.connect(analyserNode);

    timeDomainData = new Float32Array(analyserNode.fftSize);
    freqData = new Uint8Array(analyserNode.frequencyBinCount);

    analysisTimer = setInterval(() => {
      if (!analyserNode || !timeDomainData || !freqData) {
        return;
      }
      analyserNode.getFloatTimeDomainData(timeDomainData);
      analyserNode.getByteFrequencyData(freqData);

      const energy = calculateRms(timeDomainData);
      if (energy < 0.012) {
        return;
      }

      const centroid = calculateSpectralCentroid(freqData, audioContext.sampleRate || 48000);
      voiceFrames.push({ ts: Date.now(), energy, centroid });
      if (voiceFrames.length > 160) {
        voiceFrames = voiceFrames.slice(-160);
      }
    }, 120);
  } catch {
    // Keep recorder functional even if voice feature extraction is unavailable.
  }
}

function stopVoiceAnalysis() {
  if (analysisTimer) {
    clearInterval(analysisTimer);
    analysisTimer = null;
  }
  if (micSource) {
    try { micSource.disconnect(); } catch {}
  }
  if (analyserNode) {
    try { analyserNode.disconnect(); } catch {}
  }
  micSource = null;
  analyserNode = null;
  timeDomainData = null;
  freqData = null;
  if (audioContext) {
    try { audioContext.close(); } catch {}
    audioContext = null;
  }
}

function getRecentVoiceFeature(nowMs) {
  const windowMs = 1400;
  const recent = voiceFrames.filter((f) => nowMs - f.ts <= windowMs);
  if (!recent.length) {
    return null;
  }
  let energy = 0;
  let centroid = 0;
  for (const r of recent) {
    energy += r.energy;
    centroid += r.centroid;
  }
  return {
    energy: energy / recent.length,
    centroid: centroid / recent.length
  };
}

function updateSpeakerProfile(speaker, feature, nowMs) {
  const prev = speakerProfiles[speaker];
  if (!prev) {
    speakerProfiles[speaker] = {
      energy: feature.energy,
      centroid: feature.centroid,
      count: 1,
      lastSeen: nowMs
    };
    return;
  }
  const n = Math.min(prev.count + 1, 12);
  speakerProfiles[speaker] = {
    energy: (prev.energy * (n - 1) + feature.energy) / n,
    centroid: (prev.centroid * (n - 1) + feature.centroid) / n,
    count: n,
    lastSeen: nowMs
  };
}

function assignSpeaker(speaker, feature, nowMs) {
  if (feature) {
    updateSpeakerProfile(speaker, feature, nowMs);
  }
  if (lastAssignedSpeaker !== speaker) {
    lastSpeakerSwitchAt = nowMs;
  }
  lastAssignedSpeaker = speaker;
  lastSegmentAt = nowMs;
  return speaker;
}

function chooseSpeakerByVoice(nowMs) {
  const feature = getRecentVoiceFeature(nowMs);
  if (!feature) {
    if (lastAssignedSpeaker && nowMs - lastSegmentAt <= sameSpeakerHoldMs) {
      return assignSpeaker(lastAssignedSpeaker, null, nowMs);
    }
    return assignSpeaker(nextAutoSpeaker(nowMs), null, nowMs);
  }

  const labels = ["A", "B", "C"];
  let bestSpeaker = null;
  let bestDist = Number.POSITIVE_INFINITY;
  const distances = {};
  const centroidScale = 2400;
  const energyScale = 0.12;

  for (const label of labels) {
    const p = speakerProfiles[label];
    if (!p) {
      continue;
    }
    const dCentroid = Math.abs(feature.centroid - p.centroid) / centroidScale;
    const dEnergy = Math.abs(feature.energy - p.energy) / energyScale;
    const dist = dCentroid + dEnergy;
    distances[label] = dist;
    if (dist < bestDist) {
      bestDist = dist;
      bestSpeaker = label;
    }
  }

  const threshold = 0.78;
  if (bestSpeaker && bestDist <= threshold) {
    if (lastAssignedSpeaker && bestSpeaker !== lastAssignedSpeaker) {
      const sinceSwitch = nowMs - lastSpeakerSwitchAt;
      const currentDist = distances[lastAssignedSpeaker];
      const isStrongSwitch =
        bestDist <= strongSwitchDist &&
        (typeof currentDist !== "number" || currentDist - bestDist >= strongSwitchMargin);

      if (sinceSwitch < switchCooldownMs && !isStrongSwitch) {
        return assignSpeaker(lastAssignedSpeaker, feature, nowMs);
      }
    }
    return assignSpeaker(bestSpeaker, feature, nowMs);
  }

  for (const label of labels) {
    if (!speakerProfiles[label]) {
      return assignSpeaker(label, feature, nowMs);
    }
  }

  if (lastAssignedSpeaker && nowMs - lastSegmentAt <= sameSpeakerHoldMs) {
    return assignSpeaker(lastAssignedSpeaker, feature, nowMs);
  }

  const fallback = bestSpeaker || nextAutoSpeaker(nowMs);
  return assignSpeaker(fallback, feature, nowMs);
}

function nextAutoSpeaker(nowMs) {
  if (!lastSegmentAt) {
    lastSegmentAt = nowMs;
    return ["A", "B", "C"][autoSpeakerIndex];
  }

  const gap = nowMs - lastSegmentAt;
  // Rotate assumed speaker when there is a longer pause between utterances.
  if (gap > 4200) {
    autoSpeakerIndex = (autoSpeakerIndex + 1) % 3;
  }
  lastSegmentAt = nowMs;
  return ["A", "B", "C"][autoSpeakerIndex];
}

function renderSegments() {
  if (!segments.length) {
    transcriptEl.value = "";
    return;
  }

  const turns = buildTurns(segments);
  transcriptEl.value = turns
    .map((t) => {
      const from = formatWallClock(t.startMs);
      const to = formatWallClock(t.endMs);
      const durationSec = Math.max(0, (t.endMs - t.startMs) / 1000);
      return from + " - " + to + " | Speaker " + t.speaker + " (" + durationSec.toFixed(1) + "s): " + t.text;
    })
    .join("\\n");
}

function parseEditedTranscript() {
  const raw = (transcriptEl.value || "").trim();
  if (!raw) {
    return [];
  }

  const lines = raw.split(/\\r?\\n/).map((line) => line.trim()).filter(Boolean);
  const parsed = [];
  const speakerLinePattern = new RegExp("^(?:\\\\d{2}:\\\\d{2}:\\\\d{2}\\\\s*-\\\\s*\\\\d{2}:\\\\d{2}:\\\\d{2}\\\\s*\\\\|\\\\s*)?Speaker\\\\s*([ABC])(?:\\\\s*\\\\([^)]*\\\\))?\\\\s*:\\\\s*(.+)$", "i");
  for (const line of lines) {
    const m = line.match(speakerLinePattern);
    if (m) {
      parsed.push({
        speaker: m[1].toUpperCase(),
        text: (m[2] || "").trim()
      });
      continue;
    }

    // Fallback: assume untagged line belongs to current inferred speaker.
    parsed.push({
      speaker: "A",
      text: line
    });
  }

  return parsed.filter((item) => item.text);
}

function formatWallClock(offsetMs) {
  if (!recordingWallStart) {
    return "--:--:--";
  }
  const dt = new Date(recordingWallStart + Math.max(0, offsetMs || 0));
  return dt.toTimeString().slice(0, 8);
}

function buildTurns(items) {
  const turns = [];
  const maxTurnGapMs = 2600;
  for (const seg of items) {
    const startMs = typeof seg.startMs === "number" ? seg.startMs : 0;
    const endMs = typeof seg.endMs === "number" ? seg.endMs : startMs;
    const last = turns[turns.length - 1];
    const isContinuous =
      last &&
      last.speaker === seg.speaker &&
      startMs - last.endMs <= maxTurnGapMs;

    if (isContinuous) {
      last.endMs = Math.max(last.endMs, endMs);
      last.text = (last.text + " " + seg.text).trim();
      continue;
    }

    turns.push({
      speaker: seg.speaker,
      text: seg.text,
      startMs,
      endMs
    });
  }
  return turns;
}

function addSegment(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return;
  }
  const now = Date.now();
  const startMs = Math.max(0, now - recordingStart - 800);
  const endMs = Math.max(startMs, now - recordingStart);
  const speaker = chooseSpeakerByVoice(now);
  segments.push({ speaker, text: trimmed, startMs, endMs });
  renderSegments();
}

function cleanupRecognition() {
  if (recognition) {
    try { recognition.stop(); } catch {}
    recognition = null;
  }
}

function startSpeechRecognition() {
  const SR = window.SpeechRecognition || window.webkitSpeechRecognition;
  if (!SR) {
    recStatusEl.textContent = "Recording audio only (browser has no speech recognition API).";
    return;
  }

  recognition = new SR();
  recognition.lang = "th-TH";
  recognition.continuous = true;
  recognition.interimResults = false;

  recognition.onresult = (event) => {
    for (let i = event.resultIndex; i < event.results.length; i += 1) {
      const r = event.results[i];
      if (!r.isFinal) continue;
      const text = r[0] && r[0].transcript ? r[0].transcript : "";
      addSegment(text);
    }
  };

  recognition.onerror = (event) => {
    recStatusEl.textContent = "Speech recognition warning: " + event.error;
  };

  recognition.onend = () => {
    if (isRecording) {
      try { recognition.start(); } catch {}
    }
  };

  try {
    recognition.start();
  } catch {}
}

async function uploadAudio(blob) {
  const fd = new FormData();
  fd.append("audio", blob, "meeting-" + Date.now() + ".webm");
  const response = await fetch("/ai/playground/record/upload", {
    method: "POST",
    body: fd
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.message || "Audio upload failed");
  }
  return data;
}

async function analyzeSegments() {
  const model = DEFAULT_MODEL;
  const turns = buildTurns(segments);
  const response = await fetch("/ai/playground/diarize-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, segments: turns, language: "Thai" })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || data.message || "Analyze failed");
  }
  return data;
}

async function startRecording() {
  if (isRecording) return;
  setRecordingControls(true);
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(mediaStream);
    audioChunks = [];
    segments = [];
    voiceFrames = [];
    speakerProfiles = {};
    autoSpeakerIndex = 0;
    lastSegmentAt = 0;
    lastAssignedSpeaker = null;
    lastSpeakerSwitchAt = 0;
    renderSegments();
    recordingStart = Date.now();
    recordingWallStart = recordingStart;
    startVoiceAnalysis(mediaStream);

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start(300);
    isRecording = true;
    recStatusEl.textContent = "Recording... auto speaker grouping is running.";
    startSpeechRecognition();
  } catch (error) {
    setRecordingControls(false);
    recStatusEl.textContent = error instanceof Error ? error.message : "Cannot start recording";
  }
}

async function stopRecording() {
  if (!isRecording || !mediaRecorder) return;

  isRecording = false;
  setRecordingControls(false);
  recStatusEl.textContent = "Stopping...";
  cleanupRecognition();
  stopVoiceAnalysis();

  await new Promise((resolve) => {
    mediaRecorder.onstop = resolve;
    mediaRecorder.stop();
  });

  mediaStream.getTracks().forEach((t) => t.stop());
  const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

  try {
    const uploaded = await uploadAudio(audioBlob);
    audioInfoEl.textContent = "Saved: " + uploaded.fileName + " (" + Math.round(uploaded.size / 1024) + " KB)";
    recStatusEl.textContent = "Recording completed. Edit transcript if needed, then click Analyze Transcript.";
  } catch (error) {
    recStatusEl.textContent = error instanceof Error ? error.message : "Failed to process recording";
  }
}

async function analyzeRecordingTranscript() {
  try {
    const edited = parseEditedTranscript();
    if (!edited.length) {
      throw new Error("Please add transcript lines before analyze");
    }

    recStatusEl.textContent = "Analyzing transcript with Qwen...";
    segments = edited.map((item) => ({
      speaker: item.speaker,
      text: item.text
    }));

    const analyzed = await analyzeSegments();
    promptEl.value = analyzed.transcript || "";
    setActiveScreen("prompt");
    stopTyping();
    typewrite(analyzed.summary || "", () => setStatus("Done"));
    recStatusEl.textContent = "Transcript analyzed.";
  } catch (error) {
    recStatusEl.textContent = error instanceof Error ? error.message : "Analyze failed";
  }
}

async function generate() {
  const prompt = promptEl.value.trim();
  const model = DEFAULT_MODEL;
  if (!prompt) {
    setStatus("Please enter a prompt first.");
    return;
  }

  stopTyping();
  setBusy(true);
  startStatusPulse();
  resultEl.textContent = "";

  try {
    const response = await fetch("/ai/playground/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt, model })
    });

    const data = await response.json();
    if (!response.ok) {
      throw new Error(data.detail || data.message || "Request failed");
    }

    const text = data.output || "(no output)";
    typewrite(text, () => stopStatusPulse("Done"));
  } catch (error) {
    resultEl.textContent = "";
    stopStatusPulse(error instanceof Error ? error.message : "Failed to generate response");
  } finally {
    setBusy(false);
  }
}

startRecBtn.addEventListener("click", startRecording);
stopRecBtn.addEventListener("click", stopRecording);
analyzeRecBtn.addEventListener("click", analyzeRecordingTranscript);
sendBtn.addEventListener("click", generate);
clearBtn.addEventListener("click", () => {
  stopTyping();
  stopStatusPulse("");
  promptEl.value = "";
  resultEl.textContent = "Ready.";
  segments = [];
  recordingWallStart = 0;
  voiceFrames = [];
  speakerProfiles = {};
  autoSpeakerIndex = 0;
  lastSegmentAt = 0;
  lastAssignedSpeaker = null;
  lastSpeakerSwitchAt = 0;
  setRecordingControls(false);
  renderSegments();
  recStatusEl.textContent = "";
  audioInfoEl.textContent = "";
  setBusy(false);
  promptEl.focus();
});

promptEl.addEventListener("keydown", (event) => {
  if ((event.ctrlKey || event.metaKey) && event.key === "Enter") {
    generate();
  }
});

screenTabs.forEach((btn) => {
  btn.addEventListener("click", () => {
    setActiveScreen(btn.dataset.screenTab || "prompt");
  });
});

setRecordingControls(false);
renderSegments();
setActiveScreen("prompt");
setupMobileMenu();
`);
});

aiRouter.get("/playground/page", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Prompt Playground</title>
  <link rel="preconnect" href="https://fonts.googleapis.com" />
  <link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
  <link href="https://fonts.googleapis.com/css2?family=Plus+Jakarta+Sans:wght@400;500;600;700;800&family=Sora:wght@600;700;800&display=swap" rel="stylesheet" />
  <script src="https://cdn.tailwindcss.com"></script>
  <script>
    tailwind.config = {
      theme: {
        extend: {
          fontFamily: {
            sans: ["Plus Jakarta Sans", "ui-sans-serif", "sans-serif"],
            display: ["Sora", "Plus Jakarta Sans", "ui-sans-serif", "sans-serif"]
          },
          colors: {
            deep: "#13233f",
            mint: "#14a37f"
          },
          boxShadow: {
            panel: "0 30px 80px rgba(19, 35, 63, 0.12)",
            card: "0 16px 35px rgba(19, 35, 63, 0.10)"
          }
        }
      }
    };
  </script>
  <style>
    body {
      background:
        radial-gradient(70vw 50vh at -10% 20%, rgba(136, 219, 180, 0.36), transparent 65%),
        radial-gradient(60vw 40vh at 108% 18%, rgba(147, 191, 255, 0.30), transparent 65%),
        linear-gradient(180deg, #f9fcff 0%, #f4f9ff 42%, #eef6f8 100%);
    }
    .glass {
      background: rgba(255, 255, 255, 0.86);
      backdrop-filter: blur(8px);
    }
    .result.loading {
      background: linear-gradient(110deg, #eef5f6 8%, #ddebed 18%, #eef5f6 33%);
      background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite;
    }
    @keyframes shimmer {
      to {
        background-position-x: -200%;
      }
    }
  </style>
</head>
<body class="font-sans text-deep antialiased">
  <div class="absolute inset-0 -z-10 overflow-hidden">
    <div class="absolute -left-8 top-24 h-44 w-44 rounded-full bg-green-200/55 blur-2xl"></div>
    <div class="absolute -right-6 top-40 h-56 w-56 rounded-full bg-blue-200/55 blur-3xl"></div>
  </div>

  <main class="mx-auto w-full max-w-[1180px] px-4 pb-12 pt-6 sm:px-6 lg:px-8">
    <header class="glass rounded-2xl border border-white/70 px-5 py-3 shadow-card sm:px-7">
      <div class="flex items-center justify-between gap-3">
        <a href="/" class="flex items-center gap-3">
          <div class="grid h-9 w-9 place-items-center rounded-xl bg-gradient-to-br from-blue-500 to-emerald-400 text-lg font-extrabold text-white">A</div>
          <div>
            <p class="font-display text-lg font-bold tracking-tight">AI Centralize</p>
            <p class="text-xs text-slate-500">AI workspace for modern teams</p>
          </div>
        </a>

        <nav class="hidden items-center gap-6 text-sm font-semibold text-slate-600 md:flex">
          <a href="/#features" class="transition hover:text-blue-600">Features</a>
          <a href="/#workflow" class="transition hover:text-blue-600">Workflow</a>
          <a href="/docs" class="transition hover:text-blue-600">API Docs</a>
          <a href="/health" class="transition hover:text-blue-600">Health</a>
        </nav>

        <div class="flex items-center gap-2 sm:gap-3">
          <a href="/auth/login" class="hidden rounded-xl px-3 py-2 text-sm font-semibold text-slate-600 transition hover:bg-slate-100 sm:inline">Log in</a>
          <a href="/ai/playground/page" class="hidden rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-semibold text-white shadow-sm transition hover:scale-[1.02] sm:inline-block">Get Started</a>
          <button id="menuToggle" type="button" class="grid h-10 w-10 place-items-center rounded-xl border border-slate-200 bg-white text-slate-700 transition hover:bg-slate-50 md:hidden" aria-controls="mobileMenu" aria-expanded="false" aria-label="Open navigation menu">
            <svg id="menuIconOpen" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            </svg>
            <svg id="menuIconClose" xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" class="hidden h-5 w-5">
              <path stroke-linecap="round" stroke-linejoin="round" d="M6 6l12 12M18 6L6 18" />
            </svg>
          </button>
        </div>
      </div>

      <div id="mobileMenu" class="mt-3 hidden rounded-xl border border-slate-200 bg-white p-3 md:hidden">
        <nav class="grid gap-2 text-sm font-semibold text-slate-700">
          <a href="/#features" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Features</a>
          <a href="/#workflow" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Workflow</a>
          <a href="/docs" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">API Docs</a>
          <a href="/health" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Health</a>
          <a href="/auth/login" class="rounded-lg px-3 py-2 transition hover:bg-blue-50 hover:text-blue-700">Log in</a>
          <a href="/ai/playground/page" class="rounded-lg bg-gradient-to-r from-blue-600 to-blue-500 px-3 py-2 text-center text-white">Get Started</a>
        </nav>
      </div>
    </header>

    <section class="mt-4">
      <h1 class="font-display text-2xl font-extrabold text-deep">AI Prompt Playground</h1>
      <p class="mt-1 text-sm text-slate-500">Record, diarize, and generate with local models</p>
    </section>

    <section class="mt-4 flex flex-wrap gap-2">
      <button type="button" data-screen-tab="prompt" class="rounded-xl border border-blue-600 bg-blue-600 px-4 py-2 text-sm font-bold text-white">Text Prompt</button>
      <button type="button" data-screen-tab="record" class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600">Record & Transcript</button>
    </section>

    <section id="promptScreen" class="mt-6 grid gap-4 lg:grid-cols-2">
      <div class="glass rounded-2xl border border-white/80 p-4 shadow-panel sm:p-5">
        <label class="mb-2 block text-sm font-semibold text-slate-600" for="prompt">Prompt</label>
        <textarea id="prompt" placeholder="Ask anything..." class="min-h-[260px] w-full resize-y rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm leading-relaxed outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100"></textarea>

        <div class="mt-3 flex flex-wrap gap-2">
          <button id="send" class="rounded-xl bg-gradient-to-r from-blue-600 to-blue-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Generate</button>
          <button id="clear" class="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-bold text-slate-600 transition hover:bg-slate-50">Clear</button>
        </div>
      </div>

      <div class="glass rounded-2xl border border-white/80 p-4 shadow-panel sm:p-5">
        <label class="mb-2 block text-sm font-semibold text-slate-600">Result</label>
        <div id="result" class="result max-h-[62vh] min-h-[360px] overflow-auto rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-sm leading-relaxed text-slate-800">Ready.</div>
        <div id="status" class="mt-2 min-h-[1.2em] text-sm text-slate-500"></div>
      </div>
    </section>

    <section id="recordScreen" class="mt-6 hidden">
      <div class="glass rounded-2xl border border-white/80 p-4 shadow-panel sm:p-5">
        <label class="mb-2 block text-sm font-semibold text-slate-600">Record Meeting</label>
        <p class="text-xs text-slate-500">Record first, then edit transcript lines if speech or translation is incorrect.</p>

        <div class="mt-3 flex flex-wrap gap-2">
          <button id="startRec" type="button" class="rounded-xl bg-gradient-to-r from-emerald-600 to-emerald-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Start Recording</button>
          <button id="stopRec" type="button" class="hidden rounded-xl bg-gradient-to-r from-rose-600 to-orange-500 px-4 py-2 text-sm font-bold text-white shadow-sm transition hover:scale-[1.02]">Stop Recording</button>
          <button id="analyzeRec" type="button" class="rounded-xl border border-blue-200 bg-white px-4 py-2 text-sm font-bold text-blue-700 transition hover:bg-blue-50">Analyze Transcript</button>
        </div>

        <div id="recordingStatus" class="mt-3 min-h-[1.2em] text-xs text-slate-500"></div>
        <div id="audioInfo" class="mt-2 min-h-[1.2em] text-xs text-slate-500"></div>
        <textarea id="speakerTranscript" class="mt-3 min-h-[220px] w-full resize-y rounded-xl border border-slate-200 bg-slate-50 p-3 font-mono text-xs leading-relaxed text-slate-700 outline-none transition focus:border-blue-400 focus:ring-2 focus:ring-blue-100" placeholder="Speaker A: ...&#10;Speaker B: ..."></textarea>
      </div>
    </section>
  </main>

  <script src="/ai/playground/page.js" defer></script>
</body>
</html>`);
});
