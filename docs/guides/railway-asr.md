# Railway ASR / Whisper Service

This repo includes a standalone ASR service at `apps/asr` for Railway deployment.

Architecture:

```text
Web (Railway) -> API (Railway) -> ASR service (Railway)
```

The API forwards uploaded audio to `POST /transcribe` when `ASR_BASE_URL` is set.

## 1) Create the ASR service on Railway

1. Open the same Railway project as API/Web.
2. Click **New Service** -> **GitHub Repo** -> select this repository.
3. Set **Root Directory** to `apps/asr`.
4. Railway will detect `apps/asr/Dockerfile` automatically.
5. Recommended resources:
   - Memory: at least **2 GB** (`small` model), **4 GB** if you switch to `medium`
   - CPU is enough for first rollout; GPU is optional and not required by this Dockerfile

## 2) ASR service variables

Set these on the **ASR service**:

```env
ASR_API_KEY=your-long-random-secret
ASR_MODEL=small
ASR_LANGUAGE=th
ASR_COMPUTE_TYPE=int8
ASR_DEVICE=cpu
ASR_MAX_UPLOAD_BYTES=104857600
```

Railway sets `PORT` automatically. Do not hardcode it.

## 3) API service variables

Set these on the **API service**:

```env
ASR_BASE_URL=https://YOUR-ASR-PUBLIC-URL.up.railway.app
ASR_API_KEY=your-long-random-secret
ASR_REQUEST_TIMEOUT_MS=3600000
```

Important:
- Use **`ASR_REQUEST_TIMEOUT_MS`** for remote Whisper/ASR calls. `AI_REQUEST_TIMEOUT_MS` only affects LLM (Ollama/Gemini) requests, not transcription.
- Unit is **milliseconds**: `3600000` = **1 hour**.
- The **web** service nginx proxy allows ~1 hour on `/ai/` (`3700s` read timeout). Redeploy **web** after changing `docker/nginx-web.conf.template`.
- If transcription still fails around 5–10 minutes, Railway's edge proxy may be limiting the public HTTP request; split long audio or use shorter clips.

**Recommended:** start with the ASR **public URL** (Settings → Networking → Generate Domain on the ASR service). Private networking is optional and easier to misconfigure.

Private networking alternative (only if both services are in the same Railway project):

```env
ASR_BASE_URL=http://YOUR-ASR-SERVICE-NAME.railway.internal:8090
```

For private networking to work reliably:

1. On the **ASR service**, set `PORT=8090` in Variables so the internal port is predictable.
2. Replace `YOUR-ASR-SERVICE-NAME` with the exact Railway service name (not the repo name).
3. Redeploy both ASR and API after changing variables.

Notes:
- `ASR_API_KEY` must match on both services.
- If API returns `fetch failed`, the API cannot reach `ASR_BASE_URL`. Use the ASR public URL first.

## 4) Enable Whisper in app settings

In AICentralize system settings (super admin):

- `integrations.whisperEnabled = true`
- `ai.whisper.enabled = true`
- `ai.asrMode` should be `whisper` or `hybrid`

## 5) Smoke test

After deploy:

```bash
curl https://YOUR-ASR-URL/health
```

Expected:

```json
{"status":"ok","model":"small","device":"cpu","computeType":"int8"}
```

Transcribe test:

```bash
curl -X POST https://YOUR-ASR-URL/transcribe \
  -H "Authorization: Bearer your-long-random-secret" \
  -F "audio=@sample.m4a" \
  -F "model=small" \
  -F "language=th"
```

Then test Meeting Studio upload on production.

## 6) Local run (optional)

```bash
cd apps/asr
python -m venv .venv
.venv\Scripts\activate
pip install -r requirements.txt
set ASR_API_KEY=dev-secret
uvicorn main:app --host 0.0.0.0 --port 8090
```

Point local API to it:

```env
ASR_BASE_URL=http://127.0.0.1:8090
ASR_API_KEY=dev-secret
```

## Troubleshooting

| Symptom | Likely cause | Fix |
|--------|---------------|-----|
| `Whisper runtime is not available` on API | `ASR_BASE_URL` missing on API | Set env and redeploy API |
| `fetch failed` on `/ai/playground/transcribe` | API cannot reach `ASR_BASE_URL` | Use ASR public URL; verify ASR `/health`; match `ASR_API_KEY`; redeploy API |
| `413` on upload | File too large | Increase nginx/web limit and `ASR_MAX_UPLOAD_BYTES` |
| Very slow transcription | CPU-only `small`/`medium` model | Keep clips shorter or upgrade Railway plan/resources |
| First deploy is slow | Model download/warmup | Normal; service preloads `small` during Docker build |
