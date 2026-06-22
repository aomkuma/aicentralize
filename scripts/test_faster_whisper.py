from pathlib import Path
import sys
from faster_whisper import WhisperModel


def main() -> int:
    if len(sys.argv) < 2:
        print("Usage: py scripts/test_faster_whisper.py <audio_path> [model]")
        return 1

    audio_path = Path(sys.argv[1]).resolve()
    model_name = sys.argv[2] if len(sys.argv) > 2 else "small"

    if not audio_path.exists():
        print(f"Audio file not found: {audio_path}")
        return 2

    print(f"Loading model: {model_name}")
    model = WhisperModel(model_name, device="cpu", compute_type="int8")

    print(f"Transcribing: {audio_path}")
    segments, info = model.transcribe(
        str(audio_path),
        language="th",
        vad_filter=True,
        beam_size=5,
    )

    text_chunks = []
    count = 0
    for seg in segments:
        count += 1
        text_chunks.append(seg.text.strip())
        if count <= 5:
            print(f"[{seg.start:.2f}s -> {seg.end:.2f}s] {seg.text.strip()}")

    full_text = " ".join(chunk for chunk in text_chunks if chunk).strip()

    print("--- META ---")
    print(f"language: {info.language}")
    print(f"language_probability: {info.language_probability}")
    print(f"segments: {count}")
    print("--- FULL TEXT (trimmed 500 chars) ---")
    print(full_text[:500])
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
