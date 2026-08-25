import os
from PIL import Image, ImageDraw, ImageFilter
import numpy as np

def extract_clean_master_icon():
    # Source is the original 1024x1024 icon
    im = Image.open('public/icon-512.png').convert('RGBA')
    w, h = im.size # 1024, 1024
    
    # Precise high-res rounded rectangle mask using 4x supersampling
    scale = 4
    mask_w, mask_h = w * scale, h * scale
    mask = Image.new('L', (mask_w, mask_h), 0)
    draw = ImageDraw.Draw(mask)
    
    # Outer squircle bounds: [85, 85, 939, 939]
    x0, y0 = 85 * scale, 85 * scale
    x1, y1 = 939 * scale, 939 * scale
    radius = 186 * scale
    
    draw.rounded_rectangle([x0, y0, x1, y1], radius=radius, fill=255)
    
    # Downsample with Lanczos for smooth subpixel anti-aliasing
    alpha_channel = mask.resize((w, h), Image.Resampling.LANCZOS)
    
    r, g, b, _ = im.split()
    clean_icon_1024 = Image.merge('RGBA', (r, g, b, alpha_channel))
    return clean_icon_1024

def make_maskable_icon(master_icon, size):
    # Maskable icon needs the app background color (#0f172a) filling the entire canvas
    # and the logo positioned inside the standard 80% safe zone
    bg = Image.new('RGBA', (size, size), (15, 23, 42, 255))
    
    # Scale master icon to fit 80% safe zone
    target_icon_size = int(size * 0.85)
    scaled_icon = master_icon.resize((target_icon_size, target_icon_size), Image.Resampling.LANCZOS)
    
    offset = (size - target_icon_size) // 2
    bg.paste(scaled_icon, (offset, offset), scaled_icon)
    return bg

def main():
    print("Generating clean master icon...")
    master = extract_clean_master_icon()
    
    # 1. Update public/ icons
    print("Saving public/ icons...")
    # icon-512.png
    master.resize((512, 512), Image.Resampling.LANCZOS).save('public/icon-512.png', 'PNG')
    # icon-192.png
    master.resize((192, 192), Image.Resampling.LANCZOS).save('public/icon-192.png', 'PNG')
    # icon-maskable-512.png
    make_maskable_icon(master, 512).save('public/icon-maskable-512.png', 'PNG')
    # icon-maskable-192.png
    make_maskable_icon(master, 192).save('public/icon-maskable-192.png', 'PNG')
    
    # 2. Android drawable splash images (Splash Screen)
    splash_targets = [
        ('app/src/main/res/drawable-mdpi/splash.png', 300),
        ('app/src/main/res/drawable-hdpi/splash.png', 450),
        ('app/src/main/res/drawable-xhdpi/splash.png', 600),
        ('app/src/main/res/drawable-xxhdpi/splash.png', 900),
        ('app/src/main/res/drawable-xxxhdpi/splash.png', 1200),
    ]
    
    for path, size in splash_targets:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        # Splash should have transparent background around the logo
        splash_img = master.resize((size, size), Image.Resampling.LANCZOS)
        splash_img.save(path, 'PNG')
        print(f"Saved splash: {path} ({size}x{size})")
        
    # 3. Android mipmap launcher and maskable icons
    mipmap_targets = [
        ('app/src/main/res/mipmap-mdpi/ic_launcher.png', 48, 'launcher'),
        ('app/src/main/res/mipmap-mdpi/ic_maskable.png', 82, 'maskable'),
        ('app/src/main/res/mipmap-hdpi/ic_launcher.png', 72, 'launcher'),
        ('app/src/main/res/mipmap-hdpi/ic_maskable.png', 123, 'maskable'),
        ('app/src/main/res/mipmap-xhdpi/ic_launcher.png', 96, 'launcher'),
        ('app/src/main/res/mipmap-xhdpi/ic_maskable.png', 164, 'maskable'),
        ('app/src/main/res/mipmap-xxhdpi/ic_launcher.png', 144, 'launcher'),
        ('app/src/main/res/mipmap-xxhdpi/ic_maskable.png', 246, 'maskable'),
        ('app/src/main/res/mipmap-xxxhdpi/ic_launcher.png', 192, 'launcher'),
        ('app/src/main/res/mipmap-xxxhdpi/ic_maskable.png', 328, 'maskable'),
    ]
    
    for path, size, kind in mipmap_targets:
        os.makedirs(os.path.dirname(path), exist_ok=True)
        if kind == 'launcher':
            img = master.resize((size, size), Image.Resampling.LANCZOS)
        else:
            img = make_maskable_icon(master, size)
        img.save(path, 'PNG')
        print(f"Saved mipmap: {path} ({size}x{size})")
        
    print("All assets successfully generated!")

if __name__ == '__main__':
    main()
