import os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

def create_transparent_icon(src_path):
    im = Image.open(src_path).convert('RGBA')
    arr = np.array(im)
    
    # We can detect the background pixels (near-white / light grey background)
    # The background is very uniform: R > 240, G > 240, B > 240
    # Let's create an exact mask using a high-res rounded rectangle matching the squircle
    
    # The box is [85, 85, 939, 939] in 1024x1024
    # Let's create a 4x supersampled mask for ultra-smooth anti-aliasing
    scale = 4
    mask_size = (1024 * scale, 1024 * scale)
    mask = Image.new('L', mask_size, 0)
    draw = ImageDraw.Draw(mask)
    
    # Rounded rect coordinates scaled
    x0, y0 = 85 * scale, 85 * scale
    x1, y1 = 939 * scale, 939 * scale
    radius = 188 * scale  # standard iOS / modern squircle proportion ~ 22%
    
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=255)
    
    # Downsample with high quality Lanczos to get smooth anti-aliased alpha
    alpha_mask = mask.resize((1024, 1024), Image.Resampling.LANCZOS)
    
    # Combine original RGB with alpha mask
    r, g, b, _ = im.split()
    transparent_im = Image.merge('RGBA', (r, g, b, alpha_mask))
    
    return transparent_im

if __name__ == '__main__':
    os.makedirs('scratch', exist_ok=True)
    clean_icon = create_transparent_icon('public/icon-512.png')
    clean_icon.save('scratch/test_icon_1024.png', 'PNG')
    print('Saved scratch/test_icon_1024.png')
