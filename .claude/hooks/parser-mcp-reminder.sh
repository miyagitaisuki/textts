#!/bin/bash
# PostToolUse: sửa core/parser.py thì nhắc kiểm tra hướng dẫn cú pháp trong ai_tools/mcp_server.py,
# vì AI qua MCP chỉ biết các thuộc tính kịch bản được ghi trong đó.
input="$(cat)"
file="$(printf '%s' "$input" | python3 -c 'import json,sys; print(json.load(sys.stdin).get("tool_input",{}).get("file_path",""))' 2>/dev/null || true)"
case "$file" in
  */core/parser.py|core/parser.py)
    cat <<'JSON'
{"hookSpecificOutput": {"hookEventName": "PostToolUse", "additionalContext": "Vừa sửa core/parser.py. Nếu cú pháp kịch bản thay đổi (thuộc tính mới, đổi khoảng giá trị), cập nhật mục 'Đạo diễn' trong INSTRUCTIONS của ai_tools/mcp_server.py, và README nếu cần, để AI qua MCP biết cách dùng."}}
JSON
    ;;
esac
exit 0
