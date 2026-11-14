#!/bin/bash
# Cài dependency cho phiên Claude Code trên cloud để pytest và npm test (gui/) chạy được ngay.
set -euo pipefail

if [ "${CLAUDE_CODE_REMOTE:-}" != "true" ]; then
  exit 0
fi

cd "${CLAUDE_PROJECT_DIR:-.}"

# ffmpeg: pydub cần để đọc/ghi âm thanh (giống CI)
if ! command -v ffmpeg >/dev/null; then
  apt-get update
  apt-get install -y --no-install-recommends ffmpeg
fi

# Python: cài vào Python hệ thống; file hash nằm trong thư mục package của chính Python đó
pyhashes="$(python3 -I -c 'import sysconfig; print(sysconfig.get_path("purelib"))')/.session-start.sha256"
if ! sha256sum --check --status "$pyhashes" 2>/dev/null; then
  rm -f "$pyhashes"
  python3 -m pip install -q -r requirements.txt
  sha256sum .claude/hooks/session-start.sh requirements.txt > "$pyhashes" || rm -f "$pyhashes"
fi

# GUI (Electron + React): test không cần file chạy Electron, bỏ tải cho nhanh (giống CI)
hashes=gui/node_modules/.session-start.sha256
if ! sha256sum --check --status "$hashes" 2>/dev/null; then
  rm -f "$hashes"
  (cd gui && ELECTRON_SKIP_BINARY_DOWNLOAD=1 npm install --no-audit --no-fund)
  sha256sum .claude/hooks/session-start.sh gui/package.json gui/package-lock.json > "$hashes" || rm -f "$hashes"
fi
