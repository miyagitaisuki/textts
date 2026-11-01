# Đóng gói Python (embeddable) + thư viện + ffmpeg vào gui/python-runtime để electron-builder đưa vào bộ cài.
# Chạy trên Windows: npm run bundle:python  (được gọi tự động bởi npm run dist:win)
# Kết quả:
#   gui/python-runtime/python/   -> python.exe + thư viện (đóng gói vào resources/python)
#   gui/python-runtime/ffmpeg/   -> ffmpeg.exe (đóng gói vào resources/ffmpeg)

$ErrorActionPreference = "Stop"

$PyVersion = "3.12.7"
$PyTag = "312"   # phải khớp với PyVersion (python312._pth)
$FfmpegUrl = "https://www.gyan.dev/ffmpeg/builds/ffmpeg-release-essentials.zip"

$GuiDir = Split-Path -Parent $PSScriptRoot
$RepoDir = Split-Path -Parent $GuiDir
$Work = Join-Path $GuiDir "python-runtime"
$PyDir = Join-Path $Work "python"
$FfDir = Join-Path $Work "ffmpeg"
$Tmp = Join-Path $Work "_tmp"

if (Test-Path $Work) { Remove-Item -Recurse -Force $Work }
New-Item -ItemType Directory -Force -Path $PyDir, $FfDir, $Tmp | Out-Null

# 1. Python embeddable
$PyZip = Join-Path $Tmp "python.zip"
Invoke-WebRequest -Uri "https://www.python.org/ftp/python/$PyVersion/python-$PyVersion-embed-amd64.zip" -OutFile $PyZip
Expand-Archive -Path $PyZip -DestinationPath $PyDir -Force

# 2. Bật site-packages (embeddable mặc định tắt "import site") và thêm thư mục repo vào sys.path
$PthFile = Join-Path $PyDir "python$PyTag._pth"
@(
    "python$PyTag.zip",
    ".",
    "Lib\site-packages",
    "import site"
) | Set-Content -Encoding ASCII $PthFile

# 3. pip cho bản embeddable
$GetPip = Join-Path $Tmp "get-pip.py"
Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $GetPip
& (Join-Path $PyDir "python.exe") $GetPip --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "Cài pip thất bại" }

# 4. Thư viện của dự án
& (Join-Path $PyDir "python.exe") -m pip install --no-warn-script-location -r (Join-Path $RepoDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Cài requirements.txt thất bại" }

# 5. ffmpeg (pydub cần ffmpeg.exe)
$FfZip = Join-Path $Tmp "ffmpeg.zip"
Invoke-WebRequest -Uri $FfmpegUrl -OutFile $FfZip
Expand-Archive -Path $FfZip -DestinationPath (Join-Path $Tmp "ffmpeg") -Force
$FfExe = Get-ChildItem -Path (Join-Path $Tmp "ffmpeg") -Recurse -Filter "ffmpeg.exe" | Select-Object -First 1
if (-not $FfExe) { throw "Không tìm thấy ffmpeg.exe trong gói tải về" }
Copy-Item $FfExe.FullName (Join-Path $FfDir "ffmpeg.exe")

# 6. Kiểm tra nhanh: import được các module chính và ffmpeg chạy được
& (Join-Path $PyDir "python.exe") -c "import yaml, pydantic, pydub, edge_tts, numpy, pyloudnorm, tenacity; print('imports OK')"
if ($LASTEXITCODE -ne 0) { throw "Kiểm tra import thất bại" }
& (Join-Path $FfDir "ffmpeg.exe") -version | Select-Object -First 1
if ($LASTEXITCODE -ne 0) { throw "ffmpeg.exe không chạy được" }

Remove-Item -Recurse -Force $Tmp
Write-Host "Đã đóng gói runtime vào $Work"
