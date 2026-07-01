# Whisper Checklist: Local First, Production Later

This checklist is designed for your current plan:
- Web/API currently run local
- First milestone: make Whisper ASR work locally
- Next milestone: production deploy (Railway web + home AI runtime)

## 1) Local First: Make Whisper Work End-to-End

### 1.1 Runtime and Dependencies
- [ ] Choose ASR runtime (`faster-whisper` recommended for quality/speed balance).
- [ ] Install Python 3.10+ on local machine.
- [ ] Install FFmpeg and verify `ffmpeg -version` works in terminal.
- [ ] Create Python environment for ASR service.
- [ ] Install ASR packages (for example `faster-whisper`, `fastapi`, `uvicorn`, `python-multipart`).
- [ ] Decide model size for Thai quality target (`small`, `medium`, or `large-v3`).

### 1.2 Local ASR Service
- [ ] Create local ASR HTTP service (example endpoint: `POST /transcribe`).
- [ ] Accept uploaded audio file (wav/webm/m4a).
- [ ] Return JSON with transcript and segments (start/end/text).
- [ ] Add health check endpoint (`GET /health`).
- [ ] Add configurable defaults via env:
- [ ] `ASR_BASE_URL`
- [ ] `ASR_MODEL`
- [ ] `ASR_LANGUAGE=th`
- [ ] `ASR_COMPUTE_TYPE` (for example `int8`, `float16`)

### 1.3 Backend Integration (Node API)
- [ ] Add API route to call local ASR service (for example `POST /ai/playground/transcribe`).
- [ ] Add timeout and clear error mapping (gateway timeout, connection refused, invalid audio).
- [ ] Add file size limit and accepted mime types.
- [ ] Add logging with request id and duration.
- [ ] Keep current browser transcript flow as fallback when ASR service is unavailable.

### 1.4 Frontend Integration
- [ ] On stop recording, upload recorded audio to backend transcribe endpoint.
- [ ] Show progress state: `Uploading`, `Transcribing`, `Done`, `Failed`.
- [ ] Render transcript from Whisper result into editable transcript area.
- [ ] Keep manual edit support before analyze step.
- [ ] Show fallback message if ASR fails and keep existing record/analyze usability.

### 1.5 Local Validation (Definition of Done)
- [ ] Thai speech transcript accuracy is acceptable on at least 10 test clips.
- [ ] End-to-end flow works: Record -> Upload -> Transcribe -> Analyze.
- [ ] p95 transcribe latency is measured and documented (for 30s and 2m clips).
- [ ] Failure scenarios tested:
- [ ] ASR service down
- [ ] Audio too large
- [ ] Unsupported format
- [ ] Timeout

## 2) Production Readiness (Railway Web/API + Home AI)

### 2.1 Architecture and Connectivity
- [ ] Finalize architecture: Railway API -> secure tunnel -> home AI gateway -> Whisper/Ollama.
- [ ] Expose home AI gateway with secure private tunnel (Cloudflare Tunnel or Tailscale).
- [ ] Do not rely on localhost from Railway.
- [ ] Verify stable public/private endpoint for Railway egress.

### 2.2 Security
- [ ] Require API key or signed token from Railway to home AI gateway.
- [ ] Add IP allowlist/rate limits where possible.
- [ ] Enforce HTTPS/TLS end-to-end.
- [ ] Add request body size limits to protect upload endpoint.
- [ ] Remove any debug endpoints from public access.

### 2.3 Reliability and Operations
- [ ] Add health checks and alerting for AI gateway.
- [ ] Add timeout/retry policy in Railway API for AI calls.
- [ ] Add fallback behavior when home AI is offline.
- [ ] Add queue for long transcription jobs if needed.
- [ ] Add log correlation id across web/api/ai gateway.

### 2.4 Performance and Capacity
- [ ] Benchmark home machine for concurrent requests.
- [ ] Set max concurrent transcriptions.
- [ ] Decide model size by latency budget vs quality target.
- [ ] Add autoswitch policy (for example medium model default, large for critical jobs).

### 2.5 Data and Compliance
- [ ] Define retention policy for uploaded audio files.
- [ ] Define retention policy for transcripts.
- [ ] Mask sensitive info in logs.
- [ ] Add deletion workflow for user-requested data removal.

### 2.6 Production Launch Gate
- [ ] Staging test passed with Railway -> home AI path.
- [ ] Runbook documented for restart/recovery.
- [ ] Incident checklist prepared (home internet down, power outage, tunnel down).
- [ ] Rollback plan prepared (fallback to browser STT or external API).

## 3) Suggested Milestones

### Milestone A (Now)
- [ ] Complete section 1.1 to 1.4
- [ ] Demo local end-to-end transcription in dashboard

### Milestone B
- [ ] Complete section 1.5 with benchmark and error tests

### Milestone C (Before Production)
- [ ] Complete all items in section 2

---

If needed, create a second document with exact commands for your chosen runtime (`faster-whisper` service template + Node integration snippets).
