#!/usr/bin/env python3
"""
Convert a 1-bit PNG tilesheet to Amiga IFF/ILBM format with 1 bitplane.
"""

import struct
import sys
from PIL import Image


def png_to_ilbm(input_path: str, output_path: str) -> None:
    img = Image.open(input_path)

    # Ensure 1-bit mode
    if img.mode != "1":
        img = img.convert("1", dither=Image.NONE)

    width, height = img.size
    # IFF requires even byte width per row
    bytes_per_row = (width + 15) // 16 * 2  # word-aligned

    # Build BMHD chunk (20 bytes, big-endian)
    # struct: w(UWORD) h(UWORD) x(0) y(0) nPlanes(UBYTE) masking(UBYTE)
    #          compression(UBYTE) pad1(UBYTE) transColor(UWORD) xAspect(UBYTE)
    #          yAspect(UBYTE) pageWidth(0) pageHeight(0)
    bmhd = struct.pack(
        ">HHhhBBBBHBBhh",
        width,          # w
        height,         # h
        0, 0,           # x, y
        1,              # nPlanes - single bitplane!
        0,              # masking (0 = none)
        0,              # compression (0 = none)
        0,              # pad1
        0,              # transColor
        44, 52,         # xAspect, yAspect (PAL 320x256 ~ 44:52 pixel aspect)
        320, 256,       # pageWidth, pageHeight
    )

    # CMAP: 2-entry palette (black=0, white=1)
    cmap = bytes([0, 0, 0, 255, 255, 255])

    # BODY: raw interleaved bitmap
    raw_pixels = list(img.getdata())
    body = bytearray()
    for y in range(height):
        row = bytearray(bytes_per_row)
        for x in range(width):
            if raw_pixels[y * width + x]:
                byte_idx = x // 8
                bit_idx = 7 - (x % 8)
                row[byte_idx] |= 1 << bit_idx
        body.extend(row)

    # Wrap chunks in IFF structure
    def make_chunk(chunk_type: str, data: bytes) -> bytes:
        return chunk_type.encode("ascii") + struct.pack(">I", len(data)) + data

    bmhd_chunk = make_chunk("BMHD", bmhd)
    cmap_chunk = make_chunk("CMAP", cmap)
    body_chunk = make_chunk("BODY", bytes(body))

    ilbm_data = bmhd_chunk + cmap_chunk + body_chunk
    form_data = b"ILBM" + ilbm_data

    form = b"FORM" + struct.pack(">I", len(form_data)) + form_data

    with open(output_path, "wb") as f:
        f.write(form)

    print(f"IFF saved: {output_path}")
    print(f"  Size: {width}×{height}, {1} bitplane(s), bytes/row={bytes_per_row}")
    print(f"  File size: {len(form)} bytes")
    print(f"  Colormap: 2 colors (black / white)")


if __name__ == "__main__":
    if len(sys.argv) < 3:
        print(f"Usage: {sys.argv[0]} <input.png> <output.iff>")
        sys.exit(1)
    png_to_ilbm(sys.argv[1], sys.argv[2])