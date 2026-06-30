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
ASR_BASE_URL=http://asr.railway.internal:8090
ASR_API_KEY=your-long-random-secret
ASR_REQUEST_TIMEOUT_MS=600000
```

Notes:
- Replace `asr` with your actual Railway ASR service name if different.
- If private networking is unavailable, use the ASR public URL instead:
  `ASR_BASE_URL=https://asr-production-xxxx.up.railway.app`
- `ASR_API_KEY` must match on both services.

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
| `401 Unauthorized` | API key mismatch | Match `ASR_API_KEY` on both services |
| `413` on upload | File too large | Increase nginx/web limit and `ASR_MAX_UPLOAD_BYTES` |
| Very slow transcription | CPU-only `small`/`medium` model | Keep clips shorter or upgrade Railway plan/resources |
| First deploy is slow | Model download/warmup | Normal; service preloads `small` during Docker build |
