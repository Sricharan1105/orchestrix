#!/bin/bash
rm -f /Users/sricharan/Downloads/orchestrix.zip
rm -f /Users/sricharan/Downloads/orchestrix_full.zip
cd /Users/sricharan/.gemini/antigravity/scratch
zip -r /Users/sricharan/Downloads/orchestrix.zip orchestrix \
  -x "orchestrix/**/node_modules/*" \
  -x "orchestrix/**/venv/*" \
  -x "orchestrix/**/.git/*" \
  -x "orchestrix/**/.pytest_cache/*" \
  -x "orchestrix/**/__pycache__/*" \
  -x "orchestrix/**/dist/*" \
  -x "orchestrix/backend/*.db"
echo "Clean ZIP generated successfully at /Users/sricharan/Downloads/orchestrix.zip"
