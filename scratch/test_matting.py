from PIL import Image, ImageFilter
import numpy as np

def clean_icon_matting(src_path):
    im = Image.open(src_path).convert('RGB')
    arr = np.array(im, dtype=np.float64)
    
    # Distance from background color
    # Sample background color from corners
    bg_color = np.array([251.0, 251.0, 251.0])
    
    # Distance from background color
    diff = arr - bg_color
    dist = np.sqrt(np.sum(diff**2, axis=-1))
    
    # Smooth transition from background to icon
    # At dist <= 8, alpha = 0
    # At dist >= 32, alpha = 1
    alpha = np.clip((dist - 8.0) / (32.0 - 8.0), 0.0, 1.0)
    
    # Color decontamination for edge pixels (where 0 < alpha < 1):
    # original_color = alpha * foreground + (1 - alpha) * background
    # foreground = (original_color - (1 - alpha) * background) / alpha
    foreground = np.zeros_like(arr)
    for c in range(3):
        # for pixels with alpha > 0.05
        mask = alpha > 0.05
        fg_channel = (arr[:, :, c] - (1.0 - alpha) * bg_color[c]) / np.maximum(alpha, 0.05)
        foreground[:, :, c] = np.clip(fg_channel, 0.0, 255.0)
    
    rgba = np.dstack((foreground, alpha * 255.0)).astype(np.uint8)
    return Image.fromarray(rgba, 'RGBA')

if __name__ == '__main__':
    result = clean_icon_matting('public/icon-512.png')
    result.save('scratch/matted_icon.png', 'PNG')
    print('Saved scratch/matted_icon.png')
