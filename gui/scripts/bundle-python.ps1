# Đóng gói Python (embeddable) + thư viện + ffmpeg vào gui/python-runtime để electron-builder đưa vào bộ cài.
# Chạy trên Windows: npm run bundle:python  (được gọi tự động bởi npm run dist:win)
# Kết quả:
#   gui/python-runtime/python/   -> python.exe + thư viện (đóng gói vào resources/python)
#   gui/python-runtime/ffmpeg/   -> ffmpeg.exe, ffprobe.exe (đóng gói vào resources/ffmpeg)

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

# 2. Bật site-packages (embeddable mặc định tắt "import site") và thêm resources\engine (..\engine, tính từ thư mục python) vào sys.path:
#    bản embeddable có ._pth nên không tự thêm thư mục của script, thiếu dòng này sẽ lỗi "No module named 'core'"
$PthFile = Join-Path $PyDir "python$PyTag._pth"
@(
    "python$PyTag.zip",
    ".",
    "..\engine",
    "Lib\site-packages",
    "import site"
) | Set-Content -Encoding ASCII $PthFile

# 3. pip cho bản embeddable
$GetPip = Join-Path $Tmp "get-pip.py"
Invoke-WebRequest -Uri "https://bootstrap.pypa.io/get-pip.py" -OutFile $GetPip
& (Join-Path $PyDir "python.exe") $GetPip --no-warn-script-location
if ($LASTEXITCODE -ne 0) { throw "Cài pip thất bại" }

# 4. Thư viện của dự án
# pyopenjtalk chỉ có bản sdist (phải biên dịch C++/Cython, cần Python.h + setuptools + cmake).
# Python embeddable không có include/libs và bỏ qua PYTHONPATH nên không build được -> build wheel
# bằng Python đầy đủ (cùng phiên bản 3.12, ví dụ từ actions/setup-python) rồi cài wheel vào bản embeddable.
$HostPy = (Get-Command python -ErrorAction SilentlyContinue)
if (-not $HostPy) { throw "Cần Python $PyVersion đầy đủ trong PATH để build wheel (pyopenjtalk)" }
$HostVer = & $HostPy.Source -c "import sys; print('%d%d' % sys.version_info[:2])"
if ($HostVer -ne $PyTag) { throw "Python trong PATH là $HostVer, cần $PyTag để wheel khớp với bản embeddable" }
$Wheels = Join-Path $Tmp "wheels"
& $HostPy.Source -m pip install --upgrade pip setuptools wheel
if ($LASTEXITCODE -ne 0) { throw "Cài công cụ build thất bại" }
& $HostPy.Source -m pip wheel --wheel-dir $Wheels -r (Join-Path $RepoDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Build wheel cho requirements.txt thất bại" }
& (Join-Path $PyDir "python.exe") -m pip install --no-warn-script-location --no-index --find-links $Wheels -r (Join-Path $RepoDir "requirements.txt")
if ($LASTEXITCODE -ne 0) { throw "Cài requirements.txt thất bại" }

# 5. ffmpeg + ffprobe (pydub dùng ffmpeg.exe để chuyển đổi và ffprobe.exe để đọc file âm thanh)
$FfZip = Join-Path $Tmp "ffmpeg.zip"
Invoke-WebRequest -Uri $FfmpegUrl -OutFile $FfZip
Expand-Archive -Path $FfZip -DestinationPath (Join-Path $Tmp "ffmpeg") -Force
foreach ($Name in @("ffmpeg.exe", "ffprobe.exe")) {
    $Exe = Get-ChildItem -Path (Join-Path $Tmp "ffmpeg") -Recurse -Filter $Name | Select-Object -First 1
    if (-not $Exe) { throw "Không tìm thấy $Name trong gói tải về" }
    Copy-Item $Exe.FullName (Join-Path $FfDir $Name)
}

# 5b. 7-Zip (7za.exe) để app giải nén engine tải theo yêu cầu (VOICEVOX, AivisSpeech).
# Lấy từ bản chính thức trên GitHub của ip7z/7zip; SHA256 của file nén được ghim cứng.
$SzVersion = "26.06"
$SzSha256 = "396c180f12d2247c24b0b1fcd482c6fc2a2700f61211ffede1061dd971f5e104"
$SzUrl = "https://github.com/ip7z/7zip/releases/download/$SzVersion/7z2606-extra.7z"
$SzArchive = Join-Path $Tmp "7z-extra.7z"
$SzDir = Join-Path $Tmp "7zip"
$SzOut = Join-Path $Work "7z"

$ProgressPreference = "SilentlyContinue"
& curl.exe -fL --retry 3 -o $SzArchive $SzUrl
if ($LASTEXITCODE -ne 0) { throw "Tải 7-Zip $SzVersion thất bại" }
$SzStream = [System.IO.File]::OpenRead($SzArchive)
try {
    $Sha = [System.Security.Cryptography.SHA256]::Create()
    try {
        $SzHash = ([System.BitConverter]::ToString($Sha.ComputeHash($SzStream)) -replace "-", "").ToLower()
    } finally { $Sha.Dispose() }
} finally { $SzStream.Dispose() }
if ($SzHash -ne $SzSha256) { throw "SHA256 7-Zip không khớp (nhận $SzHash, cần $SzSha256)" }

# Runner Windows có sẵn 7-Zip trong PATH; dùng nó để lấy x64\7za.exe ra khỏi gói extra.
if (-not (Get-Command 7z -ErrorAction SilentlyContinue)) { throw "Cần 7z trong PATH để giải nén 7-Zip" }
& 7z x $SzArchive "-o$SzDir" -y "x64/7za.exe" | Out-Null
if ($LASTEXITCODE -ne 0) { throw "Giải nén 7za.exe thất bại" }
New-Item -ItemType Directory -Force -Path $SzOut | Out-Null
Copy-Item (Join-Path $SzDir "x64\7za.exe") (Join-Path $SzOut "7za.exe")
if (-not (Test-Path (Join-Path $SzOut "7za.exe"))) { throw "Thiếu 7za.exe sau khi giải nén" }

# 6. Kiểm tra nhanh: import được các module chính và ffmpeg chạy được
& (Join-Path $PyDir "python.exe") -c "import yaml, pydantic, pydub, edge_tts, numpy, pyloudnorm, tenacity, pyopenjtalk, aiohttp, fastapi, uvicorn; print('imports OK')"
if ($LASTEXITCODE -ne 0) { throw "Kiểm tra import thất bại" }
& (Join-Path $FfDir "ffmpeg.exe") -version | Select-Object -First 1
if ($LASTEXITCODE -ne 0) { throw "ffmpeg.exe không chạy được" }
& (Join-Path $FfDir "ffprobe.exe") -version | Select-Object -First 1
if ($LASTEXITCODE -ne 0) { throw "ffprobe.exe không chạy được" }

Remove-Item -Recurse -Force $Tmp
Write-Host "Đã đóng gói runtime vào $Work"
