#!/bin/bash
# Stop: chạy pytest và npm test (gui/) trước khi kết thúc lượt; đỏ thì chặn và trả lỗi cho Claude.
# Bỏ qua khi code không đổi so với lần chạy xanh gần nhất, để lượt chỉ trò chuyện không phải chờ.
set -uo pipefail
input="$(cat)"
cd "${CLAUDE_PROJECT_DIR:-.}"

# Đang ở vòng tiếp theo do chính hook này chặn: không chặn lại nữa, tránh lặp vô hạn
if printf '%s' "$input" | grep -q '"stop_hook_active"[[:space:]]*:[[:space:]]*true'; then
  exit 0
fi

state="$(git rev-parse --git-dir)/textts-stop-tests.pass"
sig="$( { git rev-parse HEAD; git diff HEAD; git ls-files --others --exclude-standard | xargs -r sha256sum; } 2>/dev/null | sha256sum | cut -d' ' -f1)"
if [ -f "$state" ] && [ "$(cat "$state")" = "$sig" ]; then
  exit 0
fi

log="$(mktemp)"
if ! python3 -m pytest -q tests >"$log" 2>&1; then
  { echo "pytest đỏ, sửa trước khi kết thúc:"; tail -n 30 "$log"; } >&2
  rm -f "$log"
  exit 2
fi
if ! (cd gui && npm test --silent) >"$log" 2>&1; then
  { echo "npm test (gui) đỏ, sửa trước khi kết thúc:"; tail -n 40 "$log"; } >&2
  rm -f "$log"
  exit 2
fi
rm -f "$log"
echo "$sig" > "$state"
exit 0
