#!/usr/bin/env python3
"""Generates assets/images/soft-bottom-fade.png.

A white-to-transparent vertical ramp, stretched over the bottom of the
technician illustration so its flat cut-out edge dissolves into the page
instead of ending in a hard line.

    python3 soft-bottom-fade.py
"""

import struct
import zlib

WIDTH, HEIGHT = 16, 256
WHITE = (255, 255, 255)


def chunk(kind: bytes, payload: bytes) -> bytes:
    body = kind + payload
    return struct.pack('>I', len(payload)) + body + struct.pack('>I', zlib.crc32(body) & 0xFFFFFFFF)


def pixel_row(y: float) -> bytes:
    """Opaque-white row with alpha ramping 0 -> 255 top to bottom."""
    alpha = round(255 * (y / (HEIGHT - 1)) ** 1.6)
    return bytes([*WHITE, alpha]) * WIDTH


raw = b''.join(b'\x00' + pixel_row(float(y)) for y in range(HEIGHT))

png = (
    b'\x89PNG\r\n\x1a\n'
    + chunk(b'IHDR', struct.pack('>IIBBBBB', WIDTH, HEIGHT, 8, 6, 0, 0, 0))
    + chunk(b'IDAT', zlib.compress(raw, 9))
    + chunk(b'IEND', b'')
)

with open('../images/soft-bottom-fade.png', 'wb') as handle:
    handle.write(png)
print('wrote ../images/soft-bottom-fade.png')
