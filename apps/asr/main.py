import os
import tempfile
from contextlib import asynccontextmanager
from pathlib import Path
from threading import Lock

from fastapi import FastAPI, File, Form, Header, HTTPException, UploadFile
from faster_whisper import WhisperModel

API_KEY = os.getenv("ASR_API_KEY", "").strip()
DEFAULT_MODEL = os.getenv("ASR_MODEL", "small").strip() or "small"
DEFAULT_LANGUAGE = os.getenv("ASR_LANGUAGE", "th").strip() or "th"
DEFAULT_COMPUTE_TYPE = os.getenv("ASR_COMPUTE_TYPE", "int8").strip() or "int8"
DEFAULT_DEVICE = os.getenv("ASR_DEVICE", "cpu").strip() or "cpu"
MAX_UPLOAD_BYTES = int(os.getenv("ASR_MAX_UPLOAD_BYTES", str(500 * 1024 * 1024)))

_model_cache: dict[str, WhisperModel] = {}
_model_lock = Lock()


def get_model(model_name: str) -> WhisperModel:
    normalized = model_name.strip() or DEFAULT_MODEL
    with _model_lock:
        cached = _model_cache.get(normalized)
        if cached is not None:
            return cached

        loaded = WhisperModel(
            normalized,
            device=DEFAULT_DEVICE,
            compute_type=DEFAULT_COMPUTE_TYPE,
        )
        _model_cache[normalized] = loaded
        return loaded


def require_auth(authorization: str | None) -> None:
    if not API_KEY:
        return

    expected = f"Bearer {API_KEY}"
    if authorization != expected:
        raise HTTPException(status_code=401, detail="Unauthorized")


def build_transcript(segments: list[dict[str, float | str]]) -> str:
    lines: list[str] = []
    for segment in segments:
        start = float(segment["start"])
        end = float(segment["end"])
        text = str(segment["text"]).strip()
        if not text:
            continue
        lines.append(f"[{start:.2f}s - {end:.2f}s] Speaker A: {text}")
    return "\n".join(lines).strip()


@asynccontextmanager
async def lifespan(_: FastAPI):
    # Warm the default model during startup so the first request is faster.
    get_model(DEFAULT_MODEL)
    yield


app = FastAPI(title="AICentralize ASR", version="1.0.0", lifespan=lifespan)


@app.get("/health")
def health() -> dict[str, str]:
    return {
        "status": "ok",
        "model": DEFAULT_MODEL,
        "device": DEFAULT_DEVICE,
        "computeType": DEFAULT_COMPUTE_TYPE,
    }


@app.post("/transcribe")
async def transcribe(
    audio: UploadFile = File(...),
    model: str = Form(DEFAULT_MODEL),
    language: str = Form(DEFAULT_LANGUAGE),
    authorization: str | None = Header(default=None),
) -> dict[str, object]:
    require_auth(authorization)

    if not audio.filename:
        raise HTTPException(status_code=400, detail="Missing audio file")

    raw = await audio.read()
    if not raw:
        raise HTTPException(status_code=400, detail="Empty audio file")
    if len(raw) > MAX_UPLOAD_BYTES:
        raise HTTPException(status_code=413, detail="Audio file is too large")

    suffix = Path(audio.filename).suffix or ".m4a"
    tmp_path = ""
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp.write(raw)
            tmp_path = tmp.name

        whisper_model = get_model(model)
        segments_iter, info = whisper_model.transcribe(
            tmp_path,
            language=language or DEFAULT_LANGUAGE,
            vad_filter=True,
            beam_size=1,
            best_of=1,
            temperature=0,
        )

        segments: list[dict[str, float | str]] = []
        for segment in segments_iter:
            text = (segment.text or "").strip()
            if not text:
                continue
            segments.append({
                "start": round(float(segment.start), 2),
                "end": round(float(segment.end), 2),
                "text": text,
            })

        transcript = build_transcript(segments)
        selected_model = model.strip() or DEFAULT_MODEL

        return {
            "model": selected_model,
            "language": info.language,
            "language_probability": info.language_probability,
            "segments": segments,
            "transcript": transcript,
            "segment_count": len(segments),
        }
    finally:
        if tmp_path and os.path.exists(tmp_path):
            os.unlink(tmp_path)
