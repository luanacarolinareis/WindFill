from __future__ import annotations

from pathlib import Path
from PIL import Image


ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "icons"
SOURCE_ICON = ICON_DIR / "WindFillFav.png"
SIZES = (16, 32, 48, 128, 256)


def save_icons() -> None:
    if not SOURCE_ICON.exists():
        raise FileNotFoundError(f"Source icon not found: {SOURCE_ICON}")

    ICON_DIR.mkdir(exist_ok=True)

    with Image.open(SOURCE_ICON) as source:
        master = source.convert("RGBA")

        for size in SIZES:
            icon = master.resize((size, size), Image.Resampling.LANCZOS)
            icon.save(ICON_DIR / f"icon{size}.png")


if __name__ == "__main__":
    save_icons()
