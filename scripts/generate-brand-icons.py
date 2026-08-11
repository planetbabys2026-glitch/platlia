import subprocess
import os

# Brand manual colors:
# --tinta: #171512
# --papel: #EDE7DA
# --brasa: #FF4E1F
# --acero: #3A3733
# --linea: #C9C2AF

BASE_DIR = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 1. Standard App Icon & Favicon SVG (Square / Rounded)
def create_app_icon_svg(maskable=False):
    # Geometry of the 22-peak thermal ticket with P and Brasa bar
    padding_scale = 0.7 if maskable else 0.85
    bg_radius = "0" if maskable else "108"
    
    return f'''<svg width="512" height="512" viewBox="0 0 512 512" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <radialGradient id="fire-glow" cx="50%" cy="30%" r="65%">
      <stop offset="0%" stop-color="#FF4E1F" stop-opacity="0.18"/>
      <stop offset="100%" stop-color="#171512" stop-opacity="0"/>
    </radialGradient>
    <filter id="ticket-shadow" x="-10%" y="-10%" width="120%" height="130%">
      <feDropShadow dx="0" dy="16" stdDeviation="20" flood-color="#000000" flood-opacity="0.6"/>
    </filter>
  </defs>

  <!-- Background Tinta Dark Kitchen -->
  <rect width="512" height="512" rx="{bg_radius}" fill="#171512"/>
  <rect width="512" height="512" rx="{bg_radius}" fill="url(#fire-glow)"/>
  
  <!-- Subtle border on non-maskable -->
  {"<rect x='1' y='1' width='510' height='510' rx='107' fill='none' stroke='#3A3733' stroke-width='2' stroke-opacity='0.6'/>" if not maskable else ""}

  <!-- Center Ticket Isotipo -->
  <g transform="translate(256, 256) scale({7.2 * padding_scale}) translate(-24, -28)" filter="url(#ticket-shadow)">
    <!-- 22-peak Thermal Ticket contour -->
    <path
      d="M0 6 L4 2 L8 6 L12 2 L16 6 L20 2 L24 6 L28 2 L32 6 L36 2 L40 6 L44 2 L48 6 L48 50 L44 54 L40 50 L36 54 L32 50 L28 54 L24 50 L20 54 L16 50 L12 54 L8 50 L4 54 L0 50 Z"
      fill="#1c1916"
      stroke="#EDE7DA"
      stroke-width="2.6"
      stroke-linejoin="round"
    />
    
    <!-- Monogram P (Solid vector geometry in Papel) -->
    <path
      d="M17 15 H27 C31.2 15 33.8 17.5 33.8 21.5 C33.8 25.5 31.2 28 27 28 H22.6 V35 H17 Z M22.6 20.2 V22.8 H26.6 C28 22.8 28.7 22.2 28.7 21.5 C28.7 20.7 28 20.2 26.6 20.2 Z"
      fill="#EDE7DA"
    />
    
    <!-- Signature Bar in Brasa #FF4E1F -->
    <rect x="13" y="39" width="22" height="4.5" rx="1.2" fill="#FF4E1F" />
  </g>
</svg>'''

# 2. Transparent Isotipo Asset
def create_transparent_isotipo_svg():
    return '''<svg width="512" height="512" viewBox="0 0 48 56" xmlns="http://www.w3.org/2000/svg">
  <path
    d="M0 6 L4 2 L8 6 L12 2 L16 6 L20 2 L24 6 L28 2 L32 6 L36 2 L40 6 L44 2 L48 6 L48 50 L44 54 L40 50 L36 54 L32 50 L28 54 L24 50 L20 54 L16 50 L12 54 L8 50 L4 54 L0 50 Z"
    fill="#171512"
    stroke="#EDE7DA"
    stroke-width="2.5"
    stroke-linejoin="round"
  />
  <path
    d="M17 15 H27 C31.2 15 33.8 17.5 33.8 21.5 C33.8 25.5 31.2 28 27 28 H22.6 V35 H17 Z M22.6 20.2 V22.8 H26.6 C28 22.8 28.7 22.2 28.7 21.5 C28.7 20.7 28 20.2 26.6 20.2 Z"
    fill="#EDE7DA"
  />
  <rect x="13" y="39" width="22" height="4.5" rx="1.2" fill="#FF4E1F" />
</svg>'''

def main():
    os.makedirs(os.path.join(BASE_DIR, "public", "icons"), exist_ok=True)
    os.makedirs(os.path.join(BASE_DIR, "public", "marca"), exist_ok=True)

    # Temporary files
    standard_svg_path = "/tmp/platlia_brand_icon.svg"
    maskable_svg_path = "/tmp/platlia_maskable_icon.svg"
    transparent_svg_path = "/tmp/platlia_transparent_isotipo.svg"

    with open(standard_svg_path, "w") as f:
        f.write(create_app_icon_svg(maskable=False))

    with open(maskable_svg_path, "w") as f:
        f.write(create_app_icon_svg(maskable=True))

    with open(transparent_svg_path, "w") as f:
        f.write(create_transparent_isotipo_svg())

    # Write public/favicon.svg
    with open(os.path.join(BASE_DIR, "public", "favicon.svg"), "w") as f:
        f.write(create_app_icon_svg(maskable=False))

    targets = [
        # (source_svg, output_rel_path, width, height)
        (standard_svg_path, "public/icons/icon-512.png", 512, 512),
        (standard_svg_path, "public/icons/icon-192.png", 192, 192),
        (maskable_svg_path, "public/icons/icon-maskable-512.png", 512, 512),
        (standard_svg_path, "app/icon.png", 64, 64),
        (standard_svg_path, "app/apple-icon.png", 180, 180),
        (transparent_svg_path, "public/marca/platlia-isotipo.png", 512, 512),
    ]

    for src, rel_out, w, h in targets:
        out_path = os.path.join(BASE_DIR, rel_out)
        print(f"Generating {rel_out} ({w}x{h})...")
        subprocess.run(["inkscape", src, "-o", out_path, f"--export-width={w}", f"--export-height={h}"], check=True)

    # Generate multi-res favicon.ico via convert
    ico_path = os.path.join(BASE_DIR, "public", "favicon.ico")
    app_ico_path = os.path.join(BASE_DIR, "app", "favicon.ico")
    print("Generating favicon.ico...")
    subprocess.run(["convert", os.path.join(BASE_DIR, "app/icon.png"), "-define", "icon:auto-resize=64,48,32,16", ico_path], check=True)
    subprocess.run(["cp", ico_path, app_ico_path], check=True)

    print("All Brand Manual Icons successfully created!")

if __name__ == "__main__":
    main()
