"""Generate Zoey app icons (apple-touch-icon, favicon SVG fallback, PWA sizes).

Run: .venv/bin/python scripts/make_icons.py
Outputs to frontend/public/.
"""

from pathlib import Path

from PIL import Image, ImageDraw, ImageFont

ROOT = Path(__file__).resolve().parent.parent
OUT_DIR = ROOT / "frontend" / "public"
OUT_DIR.mkdir(parents=True, exist_ok=True)

BG = (15, 17, 21, 255)        # #0f1115 — matches body
FG = (244, 175, 195, 255)     # ~ pink-300, matches the app's accent

FONT_CANDIDATES = [
    "/System/Library/Fonts/Supplemental/Arial Black.ttf",
    "/System/Library/Fonts/Helvetica.ttc",
    "/System/Library/Fonts/HelveticaNeue.ttc",
    "/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf",
]


def pick_font(size: int) -> ImageFont.FreeTypeFont:
    for path in FONT_CANDIDATES:
        if Path(path).exists():
            try:
                return ImageFont.truetype(path, size)
            except OSError:
                continue
    return ImageFont.load_default()


def render(size: int, rounded: bool = False) -> Image.Image:
    img = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    draw = ImageDraw.Draw(img)
    if rounded:
        radius = int(size * 0.22)
        draw.rounded_rectangle((0, 0, size - 1, size - 1), radius=radius, fill=BG)
    else:
        draw.rectangle((0, 0, size, size), fill=BG)

    font_size = int(size * 0.78)
    font = pick_font(font_size)
    text = "Z"
    bbox = draw.textbbox((0, 0), text, font=font)
    tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
    x = (size - tw) // 2 - bbox[0]
    y = (size - th) // 2 - bbox[1] - int(size * 0.02)
    draw.text((x, y), text, fill=FG, font=font)
    return img


def main() -> None:
    # Apple touch icon — iOS auto-rounds, so submit a flat square
    apple = render(180)
    apple.save(OUT_DIR / "apple-touch-icon.png")

    # Generic favicon PNG
    fav = render(192)
    fav.save(OUT_DIR / "icon-192.png")
    fav512 = render(512)
    fav512.save(OUT_DIR / "icon-512.png")

    # 32x32 favicon for browser tabs
    small = render(32)
    small.save(OUT_DIR / "favicon-32.png")

    # SVG favicon for crisp browser tab rendering
    svg = """<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100">
  <rect width="100" height="100" rx="22" fill="#0f1115"/>
  <text x="50" y="58" font-family="Arial Black, Helvetica, sans-serif"
        font-weight="900" font-size="78" fill="#f4afc3"
        text-anchor="middle" dominant-baseline="middle">Z</text>
</svg>
"""
    (OUT_DIR / "favicon.svg").write_text(svg)
    print("wrote icons to", OUT_DIR)


if __name__ == "__main__":
    main()
