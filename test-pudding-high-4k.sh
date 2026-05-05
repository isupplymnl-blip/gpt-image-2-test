#!/bin/bash
KEY="sk-y1xL8d31Fe4fek7qGpoQDCV6kx8SFEKMLZF9EoMcoPeM526U"
URL="https://new.apipudding.com/v1/images/edits"

echo "--- 3 refs, quality=high, size=1536x1024 ---"
time curl -s -w "\nHTTP %{http_code} time=%{time_total}s\n" \
  -X POST "$URL" \
  -H "Authorization: Bearer $KEY" \
  -F "model=gpt-image-2" \
  -F "prompt=a colorful pattern combining red green and blue" \
  -F "size=1536x1024" \
  -F "quality=high" \
  -F "image[]=@/tmp/ref1.png;type=image/png" \
  -F "image[]=@/tmp/ref2.png;type=image/png" \
  -F "image[]=@/tmp/ref3.png;type=image/png" \
  | tail -3
