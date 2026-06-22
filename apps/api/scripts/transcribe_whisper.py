import json
import sys
from pathlib import Path

from faster_whisper import WhisperModel


if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8")
if hasattr(sys.stderr, "reconfigure"):
    sys.stderr.reconfigure(encoding="utf-8")


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: transcribe_whisper.py <audio_path> [model] [language]", file=sys.stderr)
        return 1

    audio_path = Path(sys.argv[1]).resolve()
    model_name = sys.argv[2] if len(sys.argv) > 2 and sys.argv[2].strip() else "tiny"
    language = sys.argv[3] if len(sys.argv) > 3 and sys.argv[3].strip() else "th"

    if not audio_path.exists():
        print(f"Audio file not found: {audio_path}", file=sys.stderr)
        return 2

    model = WhisperModel(model_name, device="cpu", compute_type="int8")
    segments_iter, info = model.transcribe(
        str(audio_path),
        language=language,
        vad_filter=True,
        beam_size=1,
        best_of=1,
        temperature=0,
    )

    segments = []
    transcript_lines = []
    for segment in segments_iter:
        text = (segment.text or "").strip()
        if not text:
            continue

        segments.append({
            "start": round(float(segment.start), 2),
            "end": round(float(segment.end), 2),
            "text": text,
        })
        transcript_lines.append(f"[{segment.start:.2f}s - {segment.end:.2f}s] Speaker A: {text}")

    payload = {
        "model": model_name,
        "language": info.language,
        "language_probability": info.language_probability,
        "segments": segments,
        "transcript": "\n".join(transcript_lines).strip(),
        "segment_count": len(segments),
    }

    print(json.dumps(payload, ensure_ascii=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
