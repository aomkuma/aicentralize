"""Extract Kora brand assets from the master icon sheet (1024x682, 4-column layout)."""
from __future__ import annotations

import json
from pathlib import Path

from PIL import Image

SOURCE = Path(
    r"C:\Users\korap\.cursor\projects\c-Users-korap-AICentralize\assets"
    r"\c__Users_korap_AppData_Roaming_Cursor_User_workspaceStorage_203a334851813f4b8d78ae25888156f5_images"
    r"_6b5e0f64-e03a-49f1-a96c-cd1f4aad78d1-471c9c6e-ede4-4b2a-81dc-3c312d7393a0.png"
)
OUT = Path(__file__).resolve().parents[1] / "apps" / "web" / "public" / "brand"
PUBLIC = OUT.parent

COL_W = 256
COLS = {
    "windows": 0,
    "macos": 1,
    "android": 2,
    "browser": 3,
}

LOCKUP_BOX = (118, 44, 640, 228)
PRIMARY_TOP = 322
PRIMARY_SIZE = 132

PLATFORM_SIZES = {
    "windows": [512, 256, 128, 64],
    "macos": [512, 256, 128, 64],
    "android": [512, 192, 144, 96, 72, 48],
    "browser": [512, 256, 128, 64, 32, 16],
}


def crop(img: Image.Image, box: tuple[int, int, int, int]) -> Image.Image:
    x1, y1, x2, y2 = box
    w, h = img.size
    return img.crop((max(0, x1), max(0, y1), min(w, x2), min(h, y2)))


def save(img: Image.Image, path: Path) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    if img.width == 0 or img.height == 0:
        raise ValueError(f"Empty crop for {path}")
    img.save(path, "PNG")
    print(f"  {path.relative_to(PUBLIC)}")


def resize_square(img: Image.Image, size: int) -> Image.Image:
    return img.resize((size, size), Image.Resampling.LANCZOS)


def primary_box(col: int) -> tuple[int, int, int, int]:
    cx = col * COL_W + COL_W // 2
    half = PRIMARY_SIZE // 2
    return (cx - half, PRIMARY_TOP, cx + half, PRIMARY_TOP + PRIMARY_SIZE)



def trim_content(img: Image.Image, threshold: int = 12) -> Image.Image:
    """Trim near-uniform light background from logo crops."""
    rgb = img.convert("RGB")
    bg = rgb.getpixel((0, 0))
    mask = Image.new("L", rgb.size, 0)
    px = rgb.load()
    m = mask.load()
    w, h = rgb.size
    for y in range(h):
        for x in range(w):
            p = px[x, y]
            if sum(abs(p[i] - bg[i]) for i in range(3)) > threshold:
                m[x, y] = 255
    bbox = mask.getbbox()
    return img.crop(bbox) if bbox else img


def split_lockup(lockup: Image.Image) -> tuple[Image.Image, Image.Image]:
    """Split trimmed lockup into K mark and KORA wordmark."""
    rgb = lockup.convert("RGB")
    w, h = lockup.size
    # Find where dark wordmark text begins (scan middle band)
    y0, y1 = int(h * 0.15), int(h * 0.55)
    split_x = w // 2
    for x in range(int(w * 0.2), int(w * 0.75)):
        dark = 0
        for y in range(y0, y1):
            r, g, b = rgb.getpixel((x, y))
            if r < 80 and g < 80 and b < 90:
                dark += 1
        if dark >= 4:
            split_x = x - 6
            break

    mark = trim_content(lockup.crop((0, 0, split_x, h)), threshold=6)
    wordmark = trim_content(lockup.crop((split_x, 0, w, h)), threshold=6)
    return mark, wordmark


def main() -> None:
    img = Image.open(SOURCE).convert("RGBA")
    w, h = img.size
    print(f"Source {SOURCE.name}: {w}x{h}")
    OUT.mkdir(parents=True, exist_ok=True)

    save(img, OUT / "kora-icon-sheet-source.png")

    print("\nLogos:")
    lockup = trim_content(crop(img, LOCKUP_BOX), threshold=10)
    save(lockup, OUT / "logo/kora-lockup.png")
    mark, wordmark = split_lockup(lockup)
    save(mark, OUT / "logo/kora-mark.png")
    save(wordmark, OUT / "logo/kora-wordmark.png")

    print("\nPlatform icons:")
    extracted: dict[str, dict[str, list[int]]] = {}
    browser_primary: Image.Image | None = None

    for platform, col in COLS.items():
        extracted[platform] = {"sizes": PLATFORM_SIZES[platform]}
        primary = crop(img, primary_box(col))
        if platform == "browser":
            browser_primary = primary

        for target_size in PLATFORM_SIZES[platform]:
            save(resize_square(primary, target_size), OUT / platform / f"icon-{target_size}.png")

    assert browser_primary is not None

    pwa_sizes = [16, 32, 64, 128, 192, 256, 512]
    print("\nSite / PWA icons:")
    for size in pwa_sizes:
        browser_path = OUT / "browser" / f"icon-{size}.png"
        if browser_path.exists():
            icon = Image.open(browser_path)
        else:
            icon = resize_square(browser_primary, size)
        save(icon, OUT / f"icon-{size}x{size}.png")

    for size in [192, 512]:
        src = OUT / f"icon-{size}x{size}.png"
        save(Image.open(src), OUT / f"icon-{size}x{size}-maskable.png")
        save(Image.open(src), PUBLIC / f"icon-{size}x{size}.png")
        save(Image.open(OUT / f"icon-{size}x{size}-maskable.png"), PUBLIC / f"icon-{size}x{size}-maskable.png")

    save(resize_square(browser_primary, 180), OUT / "apple-touch-icon.png")
    save(Image.open(OUT / "apple-touch-icon.png"), PUBLIC / "apple-touch-icon.png")

    save(Image.open(OUT / "icon-32x32.png"), PUBLIC / "favicon-32x32.png")
    save(Image.open(OUT / "icon-16x16.png"), PUBLIC / "favicon-16x16.png")

    banner_src = OUT / "kora-banner.png"
    if banner_src.exists():
        banner = Image.open(banner_src)
        bw, bh = banner.size
        top = int(bh * 0.32)
        save(banner.crop((0, top, bw, bh)), OUT / "kora-banner-hero.png")
        left = int(bw * 0.44)
        save(banner.crop((left, top, bw, bh)), OUT / "kora-banner-visual.png")

    meta = {
        "source": SOURCE.name,
        "layout": "4-column: windows | macos | android | browser",
        "logos": [
            "logo/kora-lockup.png",
            "logo/kora-mark.png",
            "logo/kora-wordmark.png",
        ],
        "platforms": extracted,
        "pwa_sizes": pwa_sizes,
    }
    (OUT / "manifest-assets.json").write_text(json.dumps(meta, indent=2), encoding="utf-8")
    print("\nDone.")


if __name__ == "__main__":
    main()
