"""Ingest manually-cut KORA icon section PNGs from kora-pack/."""
from __future__ import annotations

import json
import shutil
from pathlib import Path

from PIL import Image

PACK = Path(__file__).resolve().parents[1] / "apps" / "web" / "public" / "brand" / "kora-pack"
OUT = PACK.parent
PUBLIC = OUT.parent

# Manual crops tuned to KORA_icon_sections.zip layout (title band + primary + size row)
SHEETS: dict[str, dict[int, tuple[int, int, int, int]]] = {
    "windows.png": {
        512: (28, 78, 312, 362),
        256: (16, 412, 116, 512),
        128: (118, 422, 208, 512),
        64: (220, 432, 280, 512),
    },
    "macos.png": {
        512: (28, 78, 312, 362),
        256: (16, 412, 116, 512),
        128: (118, 422, 208, 512),
        64: (220, 432, 280, 512),
    },
    "android.png": {
        512: (38, 78, 322, 362),
        192: (10, 412, 90, 512),
        144: (72, 418, 132, 512),
        96: (134, 424, 194, 512),
        72: (196, 430, 256, 512),
        48: (258, 436, 318, 512),
    },
    "browser.png": {
        512: (98, 78, 378, 332),
        256: (14, 408, 94, 488),
        128: (98, 414, 158, 488),
        64: (168, 420, 228, 488),
        32: (238, 424, 278, 488),
        16: (298, 428, 338, 488),
    },
}


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    img.save(path, "PNG", optimize=True)
    print(f"  {path.relative_to(PUBLIC)}")


def resize_square(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def trim_alpha(img: Image.Image, pad: int = 4) -> Image.Image:
    rgba = img.convert("RGBA")
    bbox = rgba.split()[-1].getbbox()
    if not bbox:
        return rgba
    x1, y1, x2, y2 = bbox
    return rgba.crop((max(0, x1 - pad), max(0, y1 - pad), min(rgba.width, x2 + pad), min(rgba.height, y2 + pad)))


def strip_dimension_label(tile: Image.Image) -> Image.Image:
    """Remove '512x512' style labels under icon tiles."""
    rgba = tile.convert("RGBA")
    w, h = rgba.size
    pixels = rgba.load()
    cut = h
    for y in range(h - 1, int(h * 0.55), -1):
        dark = sum(1 for x in range(w) if sum(pixels[x, y][:3]) < 120)
        if dark > max(8, w * 0.04):
            cut = y - 2
    if cut < h:
        rgba = rgba.crop((0, 0, w, max(1, cut)))
    return rgba


def crop_box(img: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    w, h = img.size
    x1, y1, x2, y2 = box
    return img.crop((max(0, x1), max(0, y1), min(w, x2), min(h, y2)))


def split_lockup(lockup: Image.Image) -> tuple[Image.Image, Image.Image]:
    rgb = lockup.convert("RGB")
    w, h = lockup.size
    split_x = int(w * 0.34)
    for x in range(int(w * 0.22), int(w * 0.55)):
        dark = sum(1 for y in range(int(h * 0.12), int(h * 0.55)) if sum(rgb.getpixel((x, y))) < 220)
        if dark >= 8:
            split_x = x - 6
            break
    return trim_alpha(lockup.crop((0, 0, split_x, h))), trim_alpha(lockup.crop((split_x, 0, w, h)))


def ingest_platform(sheet_name: str, platform: str) -> None:
    specs = SHEETS[sheet_name]
    img = Image.open(PACK / sheet_name).convert("RGBA")
    primary_size = max(specs)
    primary = strip_dimension_label(trim_alpha(crop_box(img, specs[primary_size])))

    for target, box in specs.items():
        if target == primary_size or (platform == "browser" and target <= 32):
            tile = primary
        else:
            tile = strip_dimension_label(trim_alpha(crop_box(img, box)))
        save(resize_square(tile, target), OUT / platform / f"icon-{target}.png")


def main() -> None:
    if not PACK.exists():
        raise SystemExit(f"Missing pack folder: {PACK}")

    print("Logo:")
    lockup = trim_alpha(Image.open(PACK / "logo.png").convert("RGBA"))
    save(lockup, OUT / "logo" / "kora-lockup.png")
    mark, wordmark = split_lockup(lockup)
    save(mark, OUT / "logo" / "kora-mark.png")
    save(wordmark, OUT / "logo" / "kora-wordmark.png")

    print("\nPlatform sheets:")
    ingest_platform("windows.png", "windows")
    ingest_platform("macos.png", "macos")
    ingest_platform("android.png", "android")
    ingest_platform("browser.png", "browser")

    browser_512 = Image.open(OUT / "browser" / "icon-512.png")
    print("\nPWA / favicon:")
    for size in [16, 32, 64, 128, 192, 256, 512]:
        src = OUT / "browser" / f"icon-{size}.png"
        icon = Image.open(src) if src.exists() else resize_square(browser_512, size)
        save(icon, OUT / f"icon-{size}x{size}.png")

    for size in [192, 512]:
        src = OUT / f"icon-{size}x{size}.png"
        save(Image.open(src), OUT / f"icon-{size}x{size}-maskable.png")
        save(Image.open(src), PUBLIC / f"icon-{size}x{size}.png")
        save(Image.open(OUT / f"icon-{size}x{size}-maskable.png"), PUBLIC / f"icon-{size}x{size}-maskable.png")

    save(resize_square(browser_512, 180), OUT / "apple-touch-icon.png")
    save(Image.open(OUT / "apple-touch-icon.png"), PUBLIC / "apple-touch-icon.png")
    save(Image.open(OUT / "icon-32x32.png"), PUBLIC / "favicon-32x32.png")
    save(Image.open(OUT / "icon-16x16.png"), PUBLIC / "favicon-16x16.png")

    shutil.copy2(PACK / "logo.png", OUT / "kora-pack-source-logo.png")

    (OUT / "manifest-assets.json").write_text(
        json.dumps({"source": "kora-pack/", "files": sorted(SHEETS)}, indent=2),
        encoding="utf-8",
    )
    print("\nDone.")


if __name__ == "__main__":
    main()
