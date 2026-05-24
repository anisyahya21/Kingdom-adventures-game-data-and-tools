from typing import Dict, List

from PIL import Image, ImageDraw


def add_review_header(image: Image.Image, title: str, lines: List[str], header_height: int = 54) -> Image.Image:
    header_height = max(40, header_height)
    canvas = Image.new("RGBA", (image.width, image.height + header_height), (10, 13, 20, 255))
    draw = ImageDraw.Draw(canvas)
    draw.text((10, 6), title, fill=(236, 236, 236, 255))
    if lines:
        draw.text((10, 26), " | ".join(lines), fill=(186, 196, 214, 255))
    canvas.paste(image, (0, header_height), image)
    return canvas


def compose_compare_panel(
    left_image: Image.Image,
    right_image: Image.Image,
    *,
    left_title: str,
    right_title: str,
    summary_line: str,
    gutter: int = 20,
    header_height: int = 56,
) -> Image.Image:
    width = left_image.width + right_image.width + gutter
    height = max(left_image.height, right_image.height) + header_height
    canvas = Image.new("RGBA", (width, height), (11, 14, 22, 255))
    draw = ImageDraw.Draw(canvas)
    draw.text((10, 6), left_title, fill=(236, 236, 236, 255))
    draw.text((left_image.width + gutter + 10, 6), right_title, fill=(236, 236, 236, 255))
    draw.text((10, 28), summary_line, fill=(180, 196, 214, 255))
    canvas.paste(left_image, (0, header_height), left_image)
    canvas.paste(right_image, (left_image.width + gutter, header_height), right_image)
    return canvas


def render_cross_region_metric_review(title: str, subtitle: str, rows: List[Dict], width: int = 1240) -> Image.Image:
    row_h = 36
    header_h = 84
    height = header_h + (max(1, len(rows)) * row_h) + 20
    canvas = Image.new("RGBA", (width, height), (12, 16, 26, 255))
    draw = ImageDraw.Draw(canvas)

    draw.text((14, 10), title, fill=(236, 236, 236, 255))
    draw.text((14, 34), subtitle, fill=(178, 194, 214, 255))

    bar_left = 360
    bar_right = width - 16
    bar_w = max(80, bar_right - bar_left)

    for idx, row in enumerate(rows):
        y = header_h + (idx * row_h)
        label = str(row.get("label", f"row-{idx + 1}"))
        value = max(0.0, min(1.0, float(row.get("value", 0.0))))
        meta = str(row.get("meta", ""))
        color = tuple(row.get("color", (90, 164, 214, 230)))

        draw.text((14, y + 8), label, fill=(220, 224, 236, 255))
        if meta:
            draw.text((170, y + 8), meta, fill=(158, 174, 194, 255))

        draw.rectangle([(bar_left, y + 10), (bar_right, y + 24)], fill=(28, 34, 48, 255), outline=(48, 58, 78, 255), width=1)
        fill_w = int(round(bar_w * value))
        if fill_w > 0:
            draw.rectangle([(bar_left + 1, y + 11), (bar_left + fill_w, y + 23)], fill=color)
        draw.text((bar_right - 70, y + 7), f"{value:.3f}", fill=(224, 234, 248, 255))

    return canvas