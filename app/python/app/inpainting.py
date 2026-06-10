"""Seamless translation overlay using OpenCV inpainting."""
import cv2
import numpy as np
from PIL import Image, ImageDraw, ImageFont

def draw_translated_seamless(pil_image, lines_data, translated_text):
    """
    pil_image: original PIL image
    lines_data: list of dicts {'text', 'x', 'y', 'w', 'h'}
    translated_text: Full translated text, potentially with newlines.
                     If it's multi-line, we try to map lines.
    """
    # Convert PIL image to OpenCV format (BGR)
    open_cv_image = cv2.cvtColor(np.array(pil_image), cv2.COLOR_RGB2BGR)
    
    # 1. Generate mask for inpainting
    mask = np.zeros(open_cv_image.shape[:2], dtype=np.uint8)
    for line in lines_data:
        x, y, w, h = line['x'], line['y'], line['w'], line['h']
        # Expand mask slightly to cover artifacts
        padding = 4
        x1 = max(0, x - padding)
        y1 = max(0, y - padding)
        x2 = min(mask.shape[1], x + w + padding)
        y2 = min(mask.shape[0], y + h + padding)
        cv2.rectangle(mask, (x1, y1), (x2, y2), 255, -1)
        
    # 2. Inpaint image
    inpainted = cv2.inpaint(open_cv_image, mask, 3, cv2.INPAINT_TELEA)
    
    # Convert back to PIL
    inpainted_pil = Image.fromarray(cv2.cvtColor(inpainted, cv2.COLOR_BGR2RGB))
    
    if not translated_text.strip() or not lines_data:
        return inpainted_pil

    # 3. Draw translated text
    draw = ImageDraw.Draw(inpainted_pil)
    
    # Try to find a system font
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
    
    # If translation preserved line count, map 1:1. Otherwise just draw in the big bounding box of all lines.
    if len(trans_lines) == len(lines_data):
        draw_mapping = zip(lines_data, trans_lines)
    else:
        # Group everything into one big box
        x_min = min(l['x'] for l in lines_data)
        y_min = min(l['y'] for l in lines_data)
        x_max = max(l['x'] + l['w'] for l in lines_data)
        y_max = max(l['y'] + l['h'] for l in lines_data)
        big_box = {'x': x_min, 'y': y_min, 'w': x_max - x_min, 'h': y_max - y_min}
        # Just join the translation
        draw_mapping = [(big_box, translated_text)]

    for box, text in draw_mapping:
        if not text:
            continue
            
        x, y, w, h = box['x'], box['y'], box['w'], box['h']
        
        # Fit font size
        max_font_size = h if len(draw_mapping) == len(lines_data) else int(h / max(1, len(text.split('\n'))))
        font_size = max(10, max_font_size)
        font = None
        
        if font_path:
            for fs in range(font_size, 6, -1):
                try:
                    font = ImageFont.truetype(font_path, fs)
                except Exception:
                    font = ImageFont.load_default()
                    break
                
                # Check bounding box
                # If multi-line, check max width and total height
                lines = text.split('\n')
                max_w = 0
                tot_h = 0
                for l in lines:
                    bbox = draw.textbbox((0, 0), l, font=font)
                    max_w = max(max_w, bbox[2] - bbox[0])
                    tot_h += (bbox[3] - bbox[1]) + 2 # Add line spacing
                    
                if max_w <= w and tot_h <= h:
                    break
        
        if font is None:
            font = ImageFont.load_default()
            
        # Draw centered
        lines = text.split('\n')
        current_y = y
        for l in lines:
            bbox = draw.textbbox((0, 0), l, font=font)
            tw, th = bbox[2] - bbox[0], bbox[3] - bbox[1]
            tx = x + (w - tw) // 2
            
            # Draw with outline for better visibility against arbitrary backgrounds
            draw.text((tx, current_y), l, font=font, fill=(0, 0, 0), stroke_width=2, stroke_fill=(255, 255, 255))
            current_y += th + 2
            
    return inpainted_pil
