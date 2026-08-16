import os
import shutil
import subprocess

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SRC_LOGOS_DIR = "/home/alejandro/Descargas/Platlia-—-Manual de marca/assets/logos"

# Brand colors:
# --tinta: #171512 (Dark Kitchen background)
# --papel: #EDE7DA (Thermal ticket paper / typography)
# --brasa: #FF4E1F (Flame accent bar / primary accent)
# --acero: #3A3733 (Surface / subtle border)
# --linea: #C9C2AF (Muted / dotted line)

def create_app_icon_svg(maskable=False):
    """
    Creates the official Platlia App & Favicon icon SVG based on Brand Manual v2.
    - Uses exact vector geometry for the 6-peak serrated comanda ticket, P monogram and brasa bar.
    - Background: #171512 (Tinta)
    - Safe area padding for maskable icons (Android PWA spec: inner 60-70% zone).
    """
    scale = 5.2 if maskable else 6.8
    bg_radius = "0" if maskable else "108"
    
    # Center of 512x512 is (256, 256).
    # Ticket bounds in 96x96 space: x in [24, 72] (center 48), y in [16, 72] (center 44).
    # We translate by (-48, -44) to center the ticket at (256, 256).

    return f'''<?xml version="1.0" encoding="UTF-8"?>
<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="fire-glow" cx="50%" cy="30%" r="70%">
      <stop offset="0%" stop-color="#FF4E1F" stop-opacity="0.14"/>
      <stop offset="100%" stop-color="#171512" stop-opacity="0"/>
    </radialGradient>
    <filter id="ticket-shadow" x="-30%" y="-30%" width="160%" height="160%">
      <feGaussianBlur in="SourceAlpha" stdDeviation="12"/>
      <feOffset dx="0" dy="10" result="offsetblur"/>
      <feFlood flood-color="#000000" flood-opacity="0.6"/>
      <feComposite in2="offsetblur" operator="in"/>
      <feMerge>
        <feMergeNode/>
        <feMergeNode in="SourceGraphic"/>
      </feMerge>
    </filter>
  </defs>

  <!-- Background Tinta Dark Kitchen -->
  <rect width="512" height="512" rx="{bg_radius}" fill="#171512"/>
  <rect width="512" height="512" rx="{bg_radius}" fill="url(#fire-glow)"/>
  
  <!-- Subtle border on non-maskable icons -->
  {"<rect x='1' y='1' width='510' height='510' rx='107' fill='none' stroke='#3A3733' stroke-width='2' stroke-opacity='0.4'/>" if not maskable else ""}

  <!-- Centered Official Ticket Isotipo (Brand v2) -->
  <g transform="translate(256, 256) scale({scale}) translate(-48, -44)" filter="url(#ticket-shadow)">
    <!-- Ticket Papel (#EDE7DA) with 6 serrated teeth -->
    <path d="M24 16H72V64L68 72L64 64L60 72L56 64L52 72L48 64L44 72L40 64L36 72L32 64L28 72L24 64Z" fill="#EDE7DA"/>
    <!-- P Monogram (#171512 Tinta) -->
    <path d="M42.2 44V20H47.9Q51.3 20 52.8 21.4Q54.3 22.7 54.4 25.9Q54.4 27.1 54.4 28.2Q54.4 29.3 54.4 30.5Q54.3 33.6 52.8 35Q51.3 36.4 47.9 36.4H46.7V44ZM46.7 32.4H47.9Q48.9 32.4 49.4 32Q49.8 31.6 49.9 30.8Q49.9 30 50 29.1Q50 28.2 50 27.3Q49.9 26.3 49.9 25.6Q49.8 24.8 49.4 24.4Q48.9 24 47.9 24H46.7Z" fill="#171512"/>
    <!-- Brasa Bar (#FF4E1F) -->
    <rect x="36" y="52" width="24" height="5" fill="#FF4E1F"/>
  </g>
</svg>'''

def create_standalone_favicon_svg():
    """
    Creates a standalone SVG favicon with a dark rounded container and crisp ticket.
    """
    return '''<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 96 96" role="img" aria-label="Platlia Favicon">
  <rect width="96" height="96" rx="20" fill="#171512"/>
  <path d="M24 16H72V64L68 72L64 64L60 72L56 64L52 72L48 64L44 72L40 64L36 72L32 64L28 72L24 64Z" fill="#EDE7DA"/>
  <path d="M42.2 44V20H47.9Q51.3 20 52.8 21.4Q54.3 22.7 54.4 25.9Q54.4 27.1 54.4 28.2Q54.4 29.3 54.4 30.5Q54.3 33.6 52.8 35Q51.3 36.4 47.9 36.4H46.7V44ZM46.7 32.4H47.9Q48.9 32.4 49.4 32Q49.8 31.6 49.9 30.8Q49.9 30 50 29.1Q50 28.2 50 27.3Q49.9 26.3 49.9 25.6Q49.8 24.4 49.4 24.4Q48.9 24 47.9 24H46.7Z" fill="#171512"/>
  <rect x="36" y="52" width="24" height="5" fill="#FF4E1F"/>
</svg>'''

def main():
    os.makedirs(os.path.join(BASE_DIR, "public", "icons"), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "public", "marca"), exist_ok=True)

    # 1. Copy all official brand SVG logos to public/marca/
    if os.path.exists(SRC_LOGOS_DIR):
        print("Copying brand SVG files from Manual de Marca...")
        for filename in os.listdir(SRC_LOGOS_DIR):
            if filename.endswith(".svg"):
                src_path = os.path.join(SRC_LOGOS_DIR, filename)
                dst_path = os.path.join(BASE_DIR, "public", "marca", filename)
                shutil.copy2(src_path, dst_path)
                print(f"  Copied {filename} -> public/marca/{filename}")
    else:
        print(f"Warning: Source logos directory not found at {SRC_LOGOS_DIR}")

    # 2. Temporary SVG files for rendering
    standard_svg_path = "/tmp/platlia_brand_icon.svg"
    maskable_svg_path = "/tmp/platlia_maskable_icon.svg"
    
    with open(standard_svg_path, "w", encoding="utf-8") as f:
        f.write(create_app_icon_svg(maskable=False))

    with open(maskable_svg_path, "w", encoding="utf-8") as f:
        f.write(create_app_icon_svg(maskable=True))

    # 3. Write public/favicon.svg
    favicon_svg_path = os.path.join(BASE_DIR, "public", "favicon.svg")
    with open(favicon_svg_path, "w", encoding="utf-8") as f:
        f.write(create_standalone_favicon_svg())
    print(f"Wrote {favicon_svg_path}")

    # 4. Generate PNG targets
    targets = [
        # Source SVG, target relative path, width, height
        (standard_svg_path, "public/icons/icon-512.png", 512, 512),
        (standard_svg_path, "public/icons/icon-192.png", 192, 192),
        (maskable_svg_path, "public/icons/icon-maskable-512.png", 512, 512),
        (standard_svg_path, "app/icon.png", 64, 64),
        (standard_svg_path, "app/apple-icon.png", 180, 180),
    ]

    # Add brand logo raster PNGs in public/marca/
    if os.path.exists(SRC_LOGOS_DIR):
        logo_mark_svg = os.path.join(SRC_LOGOS_DIR, "logo-mark.svg")
        logo_primary_svg = os.path.join(SRC_LOGOS_DIR, "logo-primary.svg")
        logo_primary_tinta_svg = os.path.join(SRC_LOGOS_DIR, "logo-primary-tinta.svg")
        
        targets.extend([
            (logo_mark_svg, "public/marca/platlia-isotipo.png", 512, 512),
            (logo_primary_svg, "public/marca/platlia-logo.png", 675, 312),
            (logo_primary_tinta_svg, "public/marca/platlia-logo-inverso.png", 675, 312),
            (logo_primary_svg, "public/marca/platlia-logotipo.png", 675, 312),
            (logo_primary_tinta_svg, "public/marca/platlia-logotipo-inverso.png", 675, 312),
        ])

    for src, rel_out, w, h in targets:
        out_path = os.path.join(BASE_DIR, rel_out)
        print(f"Generating {rel_out} ({w}x{h})...")
        subprocess.run(
            ["inkscape", src, "-o", out_path, f"--export-width={w}", f"--export-height={h}"],
            check=True
        )

    # 5. Generate multi-resolution favicon.ico via ImageMagick convert
    ico_path = os.path.join(BASE_DIR, "public", "favicon.ico")
    app_ico_path = os.path.join(BASE_DIR, "app", "favicon.ico")
    print("Generating multi-res favicon.ico...")
    subprocess.run(
        ["convert", os.path.join(BASE_DIR, "app/icon.png"), "-define", "icon:auto-resize=64,48,32,16", ico_path],
        check=True
    )
    shutil.copy2(ico_path, app_ico_path)
    print(f"Copied {ico_path} -> {app_ico_path}")

    print("\n All Brand Icons, Favicons, PWA Assets, and Brand Logos successfully updated!")

if __name__ == "__main__":
    main()
