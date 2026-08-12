#!/usr/bin/env python3
"""Generate the app icon set from code so the binaries stay reproducible.

Run: python3 scripts/generate-icons.py
Outputs into public/: apple-touch-icon.png.
"""

import os
import struct
import zlib

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
PUBLIC = os.path.join(ROOT, "public")

ACCENT_TOP = (0x30, 0x80, 0xFF)      # --accent-500
ACCENT_BOTTOM = (0x14, 0x47, 0xE6)   # --accent-700
WHITE = (0xFF, 0xFF, 0xFF)

SUPERSAMPLE = 3


def mix(a, b, t):
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))


def inside_rounded_square(x, y, size, radius):
    """Point-in-rounded-square test, coordinates in the same unit as size."""
    if radius <= 0:
        return 0.0 <= x <= size and 0.0 <= y <= size
    cx = min(max(x, radius), size - radius)
    cy = min(max(y, radius), size - radius)
    dx = x - cx
    dy = y - cy
    return dx * dx + dy * dy <= radius * radius


def inside_glyph(x, y, size, scale):
    """The Hermes "H": two stems plus a crossbar, centred on the canvas."""
    half_w = size * 0.215 * scale
    half_h = size * 0.265 * scale
    stem = size * 0.072 * scale
    bar = size * 0.058 * scale
    left = size / 2 - half_w
    right = size / 2 + half_w
    top = size / 2 - half_h
    bottom = size / 2 + half_h
    if y < top or y > bottom:
        return False
    if x < left or x > right:
        return False
    if x <= left + stem * 2 or x >= right - stem * 2:
        return True
    return abs(y - size / 2) <= bar


def render(size, radius_ratio, glyph_scale, transparent):
    scale = SUPERSAMPLE
    canvas = size * scale
    radius = canvas * radius_ratio
    rows = []
    channels = 4 if transparent else 3
    samples = scale * scale
    for py in range(size):
        row = bytearray()
        for px in range(size):
            r_acc = g_acc = b_acc = a_acc = 0
            for sy in range(scale):
                y = py * scale + sy + 0.5
                for sx in range(scale):
                    x = px * scale + sx + 0.5
                    if not inside_rounded_square(x, y, canvas, radius):
                        if not transparent:
                            r_acc += ACCENT_BOTTOM[0]
                            g_acc += ACCENT_BOTTOM[1]
                            b_acc += ACCENT_BOTTOM[2]
                            a_acc += 255
                        continue
                    if inside_glyph(x, y, canvas, glyph_scale):
                        colour = WHITE
                    else:
                        colour = mix(ACCENT_TOP, ACCENT_BOTTOM, y / canvas)
                    r_acc += colour[0]
                    g_acc += colour[1]
                    b_acc += colour[2]
                    a_acc += 255
            row.append(r_acc // samples)
            row.append(g_acc // samples)
            row.append(b_acc // samples)
            if channels == 4:
                row.append(a_acc // samples)
        rows.append(bytes(row))
    return rows, channels


def write_png(path, size, rows, channels):
    colour_type = 6 if channels == 4 else 2
    raw = b"".join(b"\x00" + row for row in rows)

    def chunk(tag, payload):
        data = tag + payload
        return struct.pack(">I", len(payload)) + data + struct.pack(">I", zlib.crc32(data) & 0xFFFFFFFF)

    header = struct.pack(">IIBBBBB", size, size, 8, colour_type, 0, 0, 0)
    png = b"\x89PNG\r\n\x1a\n"
    png += chunk(b"IHDR", header)
    png += chunk(b"IDAT", zlib.compress(raw, 9))
    png += chunk(b"IEND", b"")
    with open(path, "wb") as handle:
        handle.write(png)
    return len(png)


def main():
    os.makedirs(PUBLIC, exist_ok=True)
    targets = [
        # name, size, corner radius ratio, glyph scale, transparent corners
        ("apple-touch-icon.png", 180, 0.0, 0.86, False),
    ]
    for name, size, radius, glyph, transparent in targets:
        rows, channels = render(size, radius, glyph, transparent)
        written = write_png(os.path.join(PUBLIC, name), size, rows, channels)
        print(f"{name}: {size}x{size}, {written} bytes")


if __name__ == "__main__":
    main()
