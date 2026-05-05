#!/bin/bash
KEY="sk-y1xL8d31Fe4fek7qGpoQDCV6kx8SFEKMLZF9EoMcoPeM526U"
URL="https://new.apipudding.com/v1/images/edits"

# Create a minimal valid PNG if not already present
python3 -c "
import struct, zlib
w, h = 512, 512
ihdr = struct.pack('>IIBBBBB', w, h, 8, 2, 0, 0, 0)
raw = b''.join(b'\x00' + b'\xff' * w * 3 for _ in range(h))
chunk = lambda t, d: struct.pack('>I', len(d)) + t + d + struct.pack('>I', zlib.crc32(t + d) & 0xffffffff)
open('/tmp/test-ref.png', 'wb').write(
    b'\x89PNG\r\n\x1a\n' +
    chunk(b'IHDR', ihdr) +
    chunk(b'IDAT', zlib.compress(raw)) +
    chunk(b'IEND', b'')
)
print('PNG created at /tmp/test-ref.png')
" && ls -lh /tmp/test-ref.png || echo "python3 failed"

ls -lh /tmp/test-ref.png

echo "--- 1 ref image, medium quality, 1024x1024 ---"
time curl -s -w "\nHTTP %{http_code} time=%{time_total}s\n" \
  -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -F "model=gpt-image-2" \
  -F "prompt=a red dot on white background" \
  -F "size=1024x1024" \
  -F "quality=medium" \
  -F "image=@/tmp/test-ref.png;type=image/png" \
  | tail -3
