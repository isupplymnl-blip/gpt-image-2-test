#!/bin/bash
KEY="sk-y1xL8d31Fe4fek7qGpoQDCV6kx8SFEKMLZF9EoMcoPeM526U"
URL="https://new.apipudding.com/v1/images/edits"

# Create 3 test PNG files
python3 - <<'PYEOF'
import struct, zlib

def make_png(r, g, b, path):
    w, h = 512, 512
    ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
    raw = b''.join(b'\x00' + bytes([r, g, b]) * w for _ in range(h))
    chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
    data = b'\x89PNG\r\n\x1a\n' + chunk(b'IHDR', ihdr) + chunk(b'IDAT', zlib.compress(raw)) + chunk(b'IEND', b'')
    open(path, 'wb').write(data)
    print(f'created {path}')

make_png(255, 0, 0, '/tmp/ref1.png')
make_png(0, 255, 0, '/tmp/ref2.png')
make_png(0, 0, 255, '/tmp/ref3.png')
PYEOF

echo "--- 3 ref images, medium quality, 1024x1024 ---"
time curl -s -w "\nHTTP %{http_code} time=%{time_total}s\n" \
  -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -F "model=gpt-image-2" \
  -F "prompt=a colorful pattern combining red green and blue" \
  -F "size=1024x1024" \
  -F "quality=medium" \
  -F "image[]=@/tmp/ref1.png;type=image/png" \
  -F "image[]=@/tmp/ref2.png;type=image/png" \
  -F "image[]=@/tmp/ref3.png;type=image/png" \
  | tail -3
