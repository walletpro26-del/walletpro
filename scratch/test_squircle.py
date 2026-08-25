from PIL import Image, ImageDraw, ImageFilter
import numpy as np

def generate_clean_icon(src_path):
    im = Image.open(src_path).convert('RGBA')
    w, h = im.size # 1024, 1024
    
    # Supersampling factor for edge smoothing
    scale = 4
    mask_w, mask_h = w * scale, h * scale
    mask = Image.new('L', (mask_w, mask_h), 0)
    draw = ImageDraw.Draw(mask)
    
    # Outer squircle bounds in scaled coordinates
    x0, y0 = 85 * scale, 85 * scale
    x1, y1 = 939 * scale, 939 * scale
    radius = 186 * scale
    
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=255)
    
    # Downsample using high quality Lanczos for sub-pixel anti-aliased alpha
    alpha_channel = mask.resize((w, h), Image.Resampling.LANCZOS)
    
    # Combine RGB with this alpha channel
    r, g, b, _ = im.split()
    clean_icon = Image.merge('RGBA', (r, g, b, alpha_channel))
    return clean_icon

if __name__ == '__main__':
    icon = generate_clean_icon('public/icon-512.png')
    icon.save('scratch/clean_icon_proper.png', 'PNG')
    
    # Test on dark background
    bg = Image.new('RGBA', (1024, 1024), (15, 23, 42, 255)) # #0f172a
    bg.paste(icon, (0, 0), icon)
    bg.save('scratch/test_dark_proper.png', 'PNG')
    print('Generated clean icon and dark test')
