#!/usr/bin/env python3
"""Generates the SAMONA customer welcome background.

Source of truth for assets/images/welcome-background.jpg. From this folder:

    python3 welcome-background.py

    "/Applications/Google Chrome.app/Contents/MacOS/Google Chrome" \
      --headless=new --hide-scrollbars --force-device-scale-factor=1 \
      --window-size=1080,2400 --screenshot=/tmp/welcome-background.png \
      "file://$PWD/welcome-background.svg"

    sips -s format jpeg -s formatOptions 90 /tmp/welcome-background.png \
      --out ../images/welcome-background.jpg

The design: a bright blue sky gradient up top, a faint city map through the
middle, and a smooth fade to white at the bottom so the screen copy and the
buttons sit on clean white.
"""

import random

W, H = 1080, 2400
random.seed(7)


TOP_BLUE = '#2A5FE0'
SKY_BLUE = '#A9D3FF'
MAP_TOP = 880
MAP_BOTTOM = 1900


def blocks():
    """Pale city blocks between scattered roads."""
    out = []
    x = -40
    while x < W + 40:
        w = random.randint(90, 170)
        y = MAP_TOP + random.randint(-30, 60)
        while y < MAP_BOTTOM:
            h = random.randint(90, 190)
            r = random.choice([6, 10, 14])
            out.append(
                f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{r}" '
                f'fill="#E3EDFF" opacity="{random.uniform(0.45, 0.8):.2f}"/>'
            )
            y += h + random.randint(50, 110)
        x += w + random.randint(55, 120)
    return out


def minor_roads():
    out = []
    for _ in range(34):
        x1 = random.randint(-80, W)
        y1 = random.randint(MAP_TOP - 20, MAP_BOTTOM)
        x2 = x1 + random.randint(-260, 260)
        y2 = y1 + random.randint(120, 460)
        out.append(
            f'<path d="M{x1} {y1} L{x2} {y2}" stroke="#D8E6FB" '
            f'stroke-width="{random.choice([5, 7, 9])}" stroke-linecap="round"/>'
        )
    return out


def shopping_streets():
    """Wide white avenues with a pale blue centreline."""
    out = []
    routes = [
        (f'M-60 {MAP_TOP + 120} L520 {MAP_TOP + 520} L1140 {MAP_TOP + 300}'),
        (f'M-60 {MAP_TOP + 780} L420 {MAP_TOP + 660} L1140 {MAP_TOP + 980}'),
        (f'M300 {MAP_TOP - 40} L360 {MAP_TOP + 560} L240 {MAP_BOTTOM}'),
        (f'M760 {MAP_TOP - 40} L700 {MAP_TOP + 700} L820 {MAP_BOTTOM}'),
        (f'M-40 {MAP_TOP + 380} L1140 {MAP_TOP + 620}'),
    ]
    for d in routes:
        out.append(f'<path d="{d}" stroke="#FFFFFF" stroke-width="26" fill="none"/>')
        out.append(
            f'<path d="{d}" stroke="#CFE2FB" stroke-width="4" '
            f'stroke-dasharray="26 22" fill="none" opacity="0.85"/>'
        )
    return out


def labels():
    entries = [
        ('JUBILEE HILLS', 96, MAP_TOP + 210, -6, 26),
        ('ROAD NO. 12', 640, MAP_TOP + 300, 4, 22),
        ('BANJARA HILLS', 120, MAP_TOP + 640, 0, 25),
        ('FILM NAGAR', 690, MAP_TOP + 700, -5, 22),
        ('100 FT ROAD', 380, MAP_TOP + 470, 3, 20),
        ('JUBILEE CHECK POST', 60, MAP_TOP + 930, 0, 24),
        ('MADHAPUR', 720, MAP_TOP + 1010, -3, 22),
        ('TOLICHOWKI', 250, MAP_TOP + 1120, 0, 20),
    ]
    out = []
    for text, x, y, rot, size in entries:
        out.append(
            f'<text x="{x}" y="{y}" font-family="Helvetica, Arial, sans-serif" '
            f'font-size="{size}" letter-spacing="3" fill="#9FB6DA" opacity="0.75" '
            f'transform="rotate({rot} {x} {y})">{text}</text>'
        )
    return out


def pins():
    out = []
    for x, y in [(300, MAP_TOP + 400), (700, MAP_TOP + 540), (520, MAP_TOP + 900)]:
        out.append(f'<circle cx="{x}" cy="{y}" r="26" fill="#4C86EE" opacity="0.16"/>')
        out.append(f'<circle cx="{x}" cy="{y}" r="11" fill="#FFFFFF"/>')
        out.append(f'<circle cx="{x}" cy="{y}" r="6" fill="#3F7BE8"/>')
    return out


svg = f'''<svg xmlns="http://www.w3.org/2000/svg" width="{W}" height="{H}" viewBox="0 0 {W} {H}">
  <defs>
    <linearGradient id="sky" x1="0" y1="0" x2="0" y2="1">
      <stop offset="0" stop-color="{TOP_BLUE}"/>
      <stop offset="0.30" stop-color="#4F86EC"/>
      <stop offset="0.58" stop-color="#86B8FA"/>
      <stop offset="0.84" stop-color="#B7DAFF"/>
      <stop offset="1" stop-color="{SKY_BLUE}"/>
    </linearGradient>

    <linearGradient id="mapReveal" x1="0" y1="{MAP_TOP}" x2="0" y2="{MAP_TOP + 300}" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#000000"/>
      <stop offset="1" stop-color="#FFFFFF"/>
    </linearGradient>

    <mask id="mapMask">
      <rect x="0" y="{MAP_TOP}" width="{W}" height="{MAP_BOTTOM - MAP_TOP}" fill="url(#mapReveal)"/>
    </mask>

    <linearGradient id="toWhite" x1="0" y1="900" x2="0" y2="1240" gradientUnits="userSpaceOnUse">
      <stop offset="0" stop-color="#FFFFFF" stop-opacity="0"/>
      <stop offset="0.55" stop-color="#FFFFFF" stop-opacity="0.6"/>
      <stop offset="1" stop-color="#FFFFFF" stop-opacity="1"/>
    </linearGradient>

    <filter id="soft" x="-10%" y="-10%" width="120%" height="120%">
      <feGaussianBlur stdDeviation="3.2"/>
    </filter>
  </defs>

  <rect width="{W}" height="{H}" fill="url(#sky)"/>

  <g mask="url(#mapMask)">
    <g filter="url(#soft)">
      <rect x="0" y="{MAP_TOP}" width="{W}" height="{MAP_BOTTOM - MAP_TOP}" fill="#F4F9FF" opacity="0.6"/>
      {''.join(blocks())}
      {''.join(minor_roads())}
      {''.join(shopping_streets())}
      {''.join(labels())}
      {''.join(pins())}
    </g>
  </g>

  <rect width="{W}" height="{H}" fill="url(#toWhite)"/>
  <rect x="0" y="1300" width="{W}" height="{H - 1300}" fill="#FFFFFF"/>
  <rect width="{W}" height="{H}" fill="#FFFFFF" opacity="0.1"/>
</svg>
'''

with open('welcome-background.svg', 'w') as handle:
    handle.write(svg)
print('wrote welcome-background.svg')
