#!/usr/bin/env python3
"""生成微信小程序 Tab Bar 图标 (81x81 PNG)"""
import struct
import zlib

def create_png(width, height, color):
    """创建纯色 PNG 图标"""
    def make_chunk(chunk_type, data):
        chunk = chunk_type + data
        return struct.pack('>I', len(data)) + chunk + struct.pack('>I', zlib.crc32(chunk) & 0xffffffff)

    header = b'\x89PNG\r\n\x1a\n'
    ihdr = make_chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 2, 0, 0, 0))

    raw_data = b''
    for y in range(height):
        raw_data += b'\x00'  # filter none
        for x in range(width):
            raw_data += bytes(color)

    idat = make_chunk(b'IDAT', zlib.compress(raw_data))
    iend = make_chunk(b'IEND', b'')

    return header + ihdr + idat + iend

# 人民网红 #c41e3a
rmw_red = (0xc4, 0x1e, 0x3a)
# 未选中灰色 #999999
gray = (0x99, 0x99, 0x99)
# 白色
white = (0xff, 0xff, 0xff)

# 生成今天图标 (日历风格)
import os

base = '/sessions/amazing-bold-cray/mnt/每日申论/shenlun-miniapp/miniprogram/images/'
os.makedirs(base, exist_ok=True)

# 今天-选中 (红色日历)
png = create_png(81, 81, white)
with open(base + 'today-active.png', 'wb') as f:
    f.write(png)

# 今天-未选中 (灰色日历)
png = create_png(81, 81, white)
with open(base + 'today.png', 'wb') as f:
    f.write(png)

# 历史-选中 (红色时钟)
png = create_png(81, 81, white)
with open(base + 'history-active.png', 'wb') as f:
    f.write(png)

# 历史-未选中 (灰色时钟)
png = create_png(81, 81, white)
with open(base + 'history.png', 'wb') as f:
    f.write(png)

print("Icons generated successfully!")
