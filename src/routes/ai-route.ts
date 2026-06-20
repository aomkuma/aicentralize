import { Router } from "express";
import fs from "node:fs";
import path from "node:path";
import multer from "multer";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { askMinutes } from "../services/aiService";

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
    const ollamaRes = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: parsed.data.model,
        prompt: parsed.data.prompt,
        stream: false
      })
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      return res.status(502).json({ message: "Ollama request failed", detail: text });
    }

    const data = await ollamaRes.json() as { response?: string };
    return res.json({
      model: parsed.data.model,
      output: data.response ?? ""
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

  const merged: Array<{ speaker: "A" | "B" | "C"; text: string }> = [];
  for (const seg of parsed.data.segments) {
    const last = merged[merged.length - 1];
    if (last && last.speaker === seg.speaker) {
      last.text = `${last.text} ${seg.text}`.trim();
    } else {
      merged.push({ speaker: seg.speaker, text: seg.text.trim() });
    }
  }

  const transcript = merged.map((s) => `Speaker ${s.speaker}: ${s.text}`).join("\n");
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
    const ollamaRes = await fetch("http://127.0.0.1:11434/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model: parsed.data.model,
        prompt,
        stream: false
      })
    });

    if (!ollamaRes.ok) {
      const text = await ollamaRes.text();
      return res.status(502).json({ message: "Ollama request failed", detail: text, transcript });
    }

    const data = await ollamaRes.json() as { response?: string };
    return res.json({
      transcript,
      summary: data.response ?? ""
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
  res.type("application/javascript").send(`const modelEl = document.getElementById("model");
const promptEl = document.getElementById("prompt");
const resultEl = document.getElementById("result");
const statusEl = document.getElementById("status");
const sendBtn = document.getElementById("send");
const clearBtn = document.getElementById("clear");
const startRecBtn = document.getElementById("startRec");
const stopRecBtn = document.getElementById("stopRec");
const recStatusEl = document.getElementById("recordingStatus");
const transcriptEl = document.getElementById("speakerTranscript");
const audioInfoEl = document.getElementById("audioInfo");
const speakerBtns = Array.from(document.querySelectorAll("[data-speaker]"));

let statusTimer = null;
let typingTimer = null;
let mediaRecorder = null;
let mediaStream = null;
let recognition = null;
let isRecording = false;
let currentSpeaker = "A";
let audioChunks = [];
let segments = [];
let recordingStart = 0;

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

function setSpeaker(speaker) {
  currentSpeaker = speaker;
  speakerBtns.forEach((btn) => {
    btn.classList.toggle("active", btn.dataset.speaker === speaker);
  });
}

function renderSegments() {
  if (!segments.length) {
    transcriptEl.textContent = "No speech segments yet.";
    return;
  }
  transcriptEl.textContent = segments.map((s) => "Speaker " + s.speaker + ": " + s.text).join("\\n");
}

function addSegment(text) {
  const trimmed = (text || "").trim();
  if (!trimmed) {
    return;
  }
  const now = Date.now();
  const startMs = Math.max(0, now - recordingStart - 800);
  const endMs = Math.max(startMs, now - recordingStart);
  segments.push({ speaker: currentSpeaker, text: trimmed, startMs, endMs });
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
  const model = modelEl.value.trim() || "qwen2.5:7b";
  const response = await fetch("/ai/playground/diarize-analyze", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ model, segments, language: "Thai" })
  });
  const data = await response.json();
  if (!response.ok) {
    throw new Error(data.detail || data.message || "Analyze failed");
  }
  return data;
}

async function startRecording() {
  if (isRecording) return;
  try {
    mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
    mediaRecorder = new MediaRecorder(mediaStream);
    audioChunks = [];
    segments = [];
    renderSegments();
    recordingStart = Date.now();

    mediaRecorder.ondataavailable = (event) => {
      if (event.data && event.data.size > 0) {
        audioChunks.push(event.data);
      }
    };

    mediaRecorder.start(300);
    isRecording = true;
    startRecBtn.disabled = true;
    stopRecBtn.disabled = false;
    recStatusEl.textContent = "Recording... select active speaker A/B/C while speaking.";
    setSpeaker("A");
    startSpeechRecognition();
  } catch (error) {
    recStatusEl.textContent = error instanceof Error ? error.message : "Cannot start recording";
  }
}

async function stopRecording() {
  if (!isRecording || !mediaRecorder) return;

  isRecording = false;
  stopRecBtn.disabled = true;
  startRecBtn.disabled = false;
  recStatusEl.textContent = "Stopping...";
  cleanupRecognition();

  await new Promise((resolve) => {
    mediaRecorder.onstop = resolve;
    mediaRecorder.stop();
  });

  mediaStream.getTracks().forEach((t) => t.stop());
  const audioBlob = new Blob(audioChunks, { type: "audio/webm" });

  try {
    const uploaded = await uploadAudio(audioBlob);
    audioInfoEl.textContent = "Saved: " + uploaded.fileName + " (" + Math.round(uploaded.size / 1024) + " KB)";
    recStatusEl.textContent = "Analyzing speaker transcript with Qwen...";
    const analyzed = await analyzeSegments();
    promptEl.value = analyzed.transcript || "";
    stopTyping();
    typewrite(analyzed.summary || "", () => setStatus("Done"));
    recStatusEl.textContent = "Recording completed and analyzed.";
  } catch (error) {
    recStatusEl.textContent = error instanceof Error ? error.message : "Failed to process recording";
  }
}

async function generate() {
  const prompt = promptEl.value.trim();
  const model = modelEl.value.trim() || "qwen2.5:7b";
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

speakerBtns.forEach((btn) => {
  btn.addEventListener("click", () => setSpeaker(btn.dataset.speaker || "A"));
});

startRecBtn.addEventListener("click", startRecording);
stopRecBtn.addEventListener("click", stopRecording);
sendBtn.addEventListener("click", generate);
clearBtn.addEventListener("click", () => {
  stopTyping();
  stopStatusPulse("");
  promptEl.value = "";
  resultEl.textContent = "Ready.";
  segments = [];
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

setSpeaker("A");
renderSegments();
`);
});

aiRouter.get("/playground/page", (_req, res) => {
  res.type("html").send(`<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>AI Prompt Playground</title>
  <style>
    :root {
      --bg: #eff8f5;
      --panel: #ffffff;
      --ink: #16242d;
      --muted: #5a6d74;
      --accent: #0f766e;
      --accent2: #1f8e84;
      --line: #cfe3de;
      --code: #0f172a;
      --code-bg: #f2f6f7;
    }
    * { box-sizing: border-box; }
    body {
      margin: 0;
      min-height: 100vh;
      font-family: "Segoe UI", Tahoma, Geneva, Verdana, sans-serif;
      color: var(--ink);
      background:
        radial-gradient(70vw 50vh at 0% 0%, #cdeee7 0%, transparent 70%),
        radial-gradient(60vw 40vh at 100% 0%, #dff4ef 0%, transparent 70%),
        linear-gradient(145deg, #e9f7f3, #f7fcfb);
      padding: 22px;
      display: grid;
      place-items: center;
    }
    .shell {
      width: min(1080px, 100%);
      background: var(--panel);
      border: 1px solid var(--line);
      border-radius: 16px;
      box-shadow: 0 20px 38px rgba(19, 52, 48, 0.13);
      overflow: hidden;
    }
    .top {
      padding: 22px 22px 12px;
      border-bottom: 1px solid var(--line);
      background: linear-gradient(180deg, #ffffff, #f8fcfb);
    }
    h1 {
      margin: 0;
      font-size: clamp(1.3rem, 2.8vw, 1.9rem);
    }
    .sub {
      margin: 7px 0 0;
      color: var(--muted);
    }
    .grid {
      display: grid;
      grid-template-columns: 1fr 1fr;
      gap: 14px;
      padding: 16px;
    }
    @media (max-width: 900px) {
      .grid { grid-template-columns: 1fr; }
    }
    .card {
      border: 1px solid var(--line);
      border-radius: 12px;
      background: #fff;
      padding: 12px;
    }
    label {
      display: block;
      font-weight: 700;
      font-size: 0.92rem;
      margin: 0 0 6px;
    }
    input, textarea {
      width: 100%;
      border: 1px solid var(--line);
      border-radius: 10px;
      padding: 10px;
      font: inherit;
      background: #fff;
    }
    textarea {
      min-height: 210px;
      resize: vertical;
      line-height: 1.45;
    }
    .actions {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    .speaker-row {
      display: flex;
      gap: 8px;
      margin-top: 10px;
      flex-wrap: wrap;
    }
    button {
      border: 0;
      border-radius: 10px;
      padding: 10px 14px;
      font-weight: 700;
      cursor: pointer;
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #fff;
    }
    .ghost {
      background: #fff;
      color: var(--accent);
      border: 1px solid var(--line);
    }
    .speaker-btn {
      background: #fff;
      color: var(--accent2);
      border: 1px solid var(--line);
    }
    .speaker-btn.active {
      background: linear-gradient(135deg, var(--accent), var(--accent2));
      color: #fff;
      border-color: transparent;
    }
    .warn {
      background: #b5462a;
      color: #fff;
    }
    .result {
      min-height: 280px;
      max-height: 62vh;
      overflow: auto;
      border-radius: 10px;
      border: 1px solid var(--line);
      background: var(--code-bg);
      padding: 12px;
      white-space: pre-wrap;
      line-height: 1.48;
      color: var(--code);
      font-family: Consolas, "Courier New", monospace;
      font-size: 0.94rem;
      transition: background 180ms ease, border-color 180ms ease;
    }
    .result.loading {
      border-color: #9ccfc4;
      background:
        linear-gradient(110deg, #eef5f6 8%, #ddebed 18%, #eef5f6 33%);
      background-size: 200% 100%;
      animation: shimmer 1.2s linear infinite;
    }
    .status {
      margin-top: 8px;
      min-height: 1.2em;
      color: var(--muted);
      font-size: 0.9rem;
    }
    .status.busy {
      color: var(--accent);
      font-weight: 600;
    }
    .mini {
      margin-top: 8px;
      min-height: 1.2em;
      color: var(--muted);
      font-size: 0.86rem;
    }
    .transcript {
      margin-top: 10px;
      min-height: 110px;
      max-height: 220px;
      overflow: auto;
      border: 1px solid var(--line);
      border-radius: 10px;
      background: #f8fbfb;
      padding: 10px;
      white-space: pre-wrap;
      font-family: Consolas, "Courier New", monospace;
      font-size: 0.88rem;
      line-height: 1.42;
      color: #18303a;
    }
    @keyframes shimmer {
      to {
        background-position-x: -200%;
      }
    }
  </style>
</head>
<body>
  <main class="shell">
    <section class="top">
      <h1>AI Prompt Playground</h1>
      <p class="sub">Type a prompt, send it to local Ollama model, and get dynamic output instantly.</p>
    </section>

    <section class="grid">
      <div class="card">
        <label for="model">Model</label>
        <input id="model" type="text" value="qwen2.5:7b" />

        <label for="prompt" style="margin-top:10px;">Prompt</label>
        <textarea id="prompt" placeholder="Ask anything..."></textarea>

        <div class="actions">
          <button id="startRec" type="button">Start Recording</button>
          <button id="stopRec" type="button" class="warn" disabled>Stop Recording</button>
        </div>

        <div class="speaker-row">
          <button type="button" class="speaker-btn" data-speaker="A">Speaker A</button>
          <button type="button" class="speaker-btn" data-speaker="B">Speaker B</button>
          <button type="button" class="speaker-btn" data-speaker="C">Speaker C</button>
        </div>

        <div id="recordingStatus" class="mini"></div>
        <div id="audioInfo" class="mini"></div>
        <div id="speakerTranscript" class="transcript">No speech segments yet.</div>

        <div class="actions">
          <button id="send">Generate</button>
          <button id="clear" class="ghost">Clear</button>
        </div>
      </div>

      <div class="card">
        <label>Result</label>
        <div id="result" class="result">Ready.</div>
        <div id="status" class="status"></div>
      </div>
    </section>
  </main>

  <script src="/ai/playground/page.js" defer></script>
</body>
</html>`);
});
