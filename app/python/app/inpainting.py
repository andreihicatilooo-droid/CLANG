"""Seamless translation overlay using OpenCV inpainting."""
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

from .overlay_adaptive import adaptive_text_style, sample_region_stats


def draw_translated_seamless(pil_image, lines_data, translated_text):
    """
    pil_image: original PIL image
    lines_data: list of dicts {'text', 'x', 'y', 'w', 'h'}
    translated_text: Full translated text, potentially with newlines.
                     If it's multi-line, we try to map lines.
    """
    open_cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)

    mask = np.zeros(open_cv_image.shape[:2], dtype=np.uint8)
    for line in lines_data:
        x, y, w, h = line['x'], line['y'], line['w'], line['h']
        padding = 4
        x1 = max(0, x - padding)
        y1 = max(0, y - padding)
        x2 = min(mask.shape[1], x + w + padding)
        y2 = min(mask.shape[0], y + h + padding)
        cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)

    inpainted = cv2.inpaint(open_cv_image, mask, 3, cv2.INPAINT_TELEA)
    inpainted_pil = Image.fromarray(cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB))

    if not translated_text.strip() or not lines_data:
        return inpainted_pil

    draw = ImageDraw.Draw(inpainted_pil)

    try:
        font_path = 'segoeui.ttf'
        ImageFont.truetype(font_path, 10)
    except Exception:
        try:
            font_path = 'arial.ttf'
            ImageFont.truetype(font_path, 10)
        except Exception:
            font_path = None

    trans_lines = [line.strip() for line in translated_text.split('\n')]

    one_to_one = len(trans_lines) == len(lines_data)
    if one_to_one:
        draw_mapping = list(zip(lines_data, trans_lines))
    else:
        x_min = min(l['x'] for l in lines_data)
        y_min = min(l['y'] for l in lines_data)
        x_max = max(l['x'] + l['w'] for l in lines_data)
        y_max = max(l['y'] + l['h'] for l in lines_data)
        big_box = {'x': x_min, 'y': y_min, 'w': x_max - x_min, 'h': y_max - y_min}
        draw_mapping = [(big_box, translated_text)]

    for box, text in draw_mapping:
        if not text:
            continue

        x, y, w, h = box['x'], box['y'], box['w'], box['h']
        stats = sample_region_stats(inpainted_pil, x, y, w, h)
        style = adaptive_text_style(stats, w, h, text, ocr_height_px=h)

        font_size = style['font_size']
        font = None

        if font_path:
            for fs in range(font_size, max(8, font_size - 8), -1):
                try:
                    font = ImageFont.truetype(font_path, fs)
                except Exception:
                    font = ImageFont.load_default()
                    break

                lines = text.split('\n')
                max_w = 0
                tot_h = 0
                for ln in lines:
                    bbox = draw.textbbox((0, 0), ln, font=font)
                    max_w = max(max_w, bbox[2] - bbox[0])
                    tot_h += (bbox[3] - bbox[1]) + 2

                if max_w <= w and tot_h <= h:
                    font_size = fs
                    break

        if font is None:
            font = ImageFont.load_default()

        fill = style['fill']
        stroke_fill = style['stroke_fill']
        stroke_width = style['stroke_width']

        lines = text.split('\n')
        current_y = y
        for ln in lines:
            bbox = draw.textbbox((0, 0), ln, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            tx = x + (w - tw) // 2

            draw.text(
                (tx, current_y),
                ln,
                font=font,
                fill=fill,
                stroke_width=stroke_width,
                stroke_fill=stroke_fill if stroke_width else None,
            )
            current_y += th + 2

    return inpainted_pil
