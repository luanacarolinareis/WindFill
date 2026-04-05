from pathlib import Path

from PIL import Image, ImageDraw, ImageFilter


ROOT = Path(__file__).resolve().parent.parent
ICON_DIR = ROOT / "icons"
SIZES = (16, 32, 48, 128, 256)


def lerp_channel(start: int, end: int, t: float) -> int:
    return round(start + (end - start) * t)


def lerp_color(left: tuple[int, int, int], right: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(lerp_channel(a, b, t) for a, b in zip(left, right))


def build_background(size: int) -> Image.Image:
    top = (248, 226, 196)
    bottom = (163, 74, 31)
    side = (56, 32, 17)

    image = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    pixels = image.load()

    for y in range(size):
        vertical_t = y / max(size - 1, 1)
        row_blend = lerp_color(top, bottom, vertical_t)
        for x in range(size):
            horizontal_t = x / max(size - 1, 1)
            blend_t = min(1.0, (vertical_t * 0.74) + (horizontal_t * 0.26))
            color = lerp_color(row_blend, side, blend_t * 0.28)
            pixels[x, y] = (*color, 255)

    mask = Image.new("L", (size, size), 0)
    mask_draw = ImageDraw.Draw(mask)
    inset = round(size * 0.04)
    radius = round(size * 0.24)
    mask_draw.rounded_rectangle((inset, inset, size - inset, size - inset), radius=radius, fill=255)

    shaped = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shaped.paste(image, mask=mask)
    return shaped


def add_glow(base: Image.Image, size: int) -> Image.Image:
    glow_layer = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    glow_draw = ImageDraw.Draw(glow_layer)
    glow_draw.ellipse(
        (
            round(size * -0.08),
            round(size * -0.04),
            round(size * 0.68),
            round(size * 0.56),
        ),
        fill=(255, 248, 237, 150),
    )
    glow_draw.ellipse(
        (
            round(size * 0.18),
            round(size * 0.56),
            round(size * 1.04),
            round(size * 1.12),
        ),
        fill=(115, 47, 14, 110),
    )
    glow_layer = glow_layer.filter(ImageFilter.GaussianBlur(radius=max(2, size // 18)))
    return Image.alpha_composite(base, glow_layer)


def add_c_mark(base: Image.Image, size: int) -> Image.Image:
    mask = Image.new("L", (size, size), 0)
    draw = ImageDraw.Draw(mask)

    outer = (
        round(size * 0.16),
        round(size * 0.16),
        round(size * 0.84),
        round(size * 0.84),
    )
    inner = (
        round(size * 0.31),
        round(size * 0.31),
        round(size * 0.69),
        round(size * 0.69),
    )

    draw.ellipse(outer, fill=255)
    draw.ellipse(inner, fill=0)
    draw.rounded_rectangle(
        (
            round(size * 0.58),
            round(size * 0.18),
            round(size * 0.92),
            round(size * 0.82),
        ),
        radius=round(size * 0.08),
        fill=0,
    )

    mark = Image.new("RGBA", (size, size), (255, 248, 237, 0))
    mark_draw = ImageDraw.Draw(mark)
    mark_draw.rectangle((0, 0, size, size), fill=(255, 248, 237, 245))

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.ellipse(
        (
            round(size * 0.18),
            round(size * 0.20),
            round(size * 0.84),
            round(size * 0.86),
        ),
        outline=(72, 39, 18, 75),
        width=max(2, round(size * 0.055)),
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1, size // 40)))

    base = Image.alpha_composite(base, Image.composite(mark, Image.new("RGBA", (size, size), (0, 0, 0, 0)), mask))
    return Image.alpha_composite(base, shadow)


def add_bolt(base: Image.Image, size: int) -> Image.Image:
    points = [
        (0.56, 0.18),
        (0.42, 0.48),
        (0.57, 0.48),
        (0.43, 0.82),
        (0.76, 0.42),
        (0.61, 0.42),
        (0.74, 0.18),
    ]
    scaled = [(round(size * x), round(size * y)) for x, y in points]

    shadow = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    shadow_draw = ImageDraw.Draw(shadow)
    shadow_draw.polygon([(x + round(size * 0.015), y + round(size * 0.02)) for x, y in scaled], fill=(67, 31, 10, 88))
    shadow = shadow.filter(ImageFilter.GaussianBlur(radius=max(1, size // 32)))

    bolt = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    bolt_draw = ImageDraw.Draw(bolt)
    bolt_draw.polygon(scaled, fill=(255, 176, 78, 255))
    bolt_draw.line(
        [
            (round(size * 0.60), round(size * 0.20)),
            (round(size * 0.49), round(size * 0.45)),
            (round(size * 0.62), round(size * 0.45)),
        ],
        fill=(255, 221, 164, 235),
        width=max(1, round(size * 0.02)),
    )

    base = Image.alpha_composite(base, shadow)
    return Image.alpha_composite(base, bolt)


def draw_logo(size: int) -> Image.Image:
    image = build_background(size)
    image = add_glow(image, size)
    image = add_c_mark(image, size)
    image = add_bolt(image, size)
    return image


def save_icons() -> None:
    ICON_DIR.mkdir(exist_ok=True)
    master = draw_logo(256)
    master.save(ICON_DIR / "icon256.png")

    for size in SIZES[:-1]:
        icon = master.resize((size, size), Image.Resampling.LANCZOS)
        icon.save(ICON_DIR / f"icon{size}.png")


if __name__ == "__main__":
    save_icons()
