; Thay thế bước kiểm tra "app đang chạy" mặc định của electron-builder.
; Mặc định, bộ cài coi BẤT KỲ tiến trình nào chạy từ thư mục cài đặt là "textts đang chạy"
; (vd. python.exe / ffmpeg.exe / VOICEVOX còn sót lại sau khi app thoát) và chỉ báo
; "textts cannot be closed" mà không tự đóng được. Ở đây ta buộc đóng hết rồi cài tiếp.
!macro customCheckAppRunning
  ${If} ${FileExists} "$INSTDIR\${APP_EXECUTABLE_FILENAME}"
    ; 1) Đóng textts.exe cùng toàn bộ cây tiến trình con.
    nsExec::Exec `"$SYSDIR\taskkill.exe" /F /T /IM "${APP_EXECUTABLE_FILENAME}"`
    Pop $0
    ; 2) Đóng mọi tiến trình còn lại có file chạy nằm trong thư mục cài đặt.
    nsExec::Exec `"$SYSDIR\WindowsPowerShell\v1.0\powershell.exe" -NoProfile -NonInteractive -ExecutionPolicy Bypass -Command "$$d = '$INSTDIR\'; Get-CimInstance Win32_Process | Where-Object { $$_.ExecutablePath -and $$_.ExecutablePath.StartsWith($$d, [System.StringComparison]::OrdinalIgnoreCase) } | ForEach-Object { Stop-Process -Id $$_.ProcessId -Force -ErrorAction SilentlyContinue }"`
    Pop $0
    ; Chờ Windows nhả khóa file.
    Sleep 1500
  ${EndIf}
!macroend
