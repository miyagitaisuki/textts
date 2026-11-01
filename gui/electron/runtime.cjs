// Chọn Python và PATH cho tiến trình con (hàm thuần, dễ kiểm thử).
// Thứ tự ưu tiên khi chọn Python:
//   1. TEXTTS_PYTHON (người phát triển tự chỉ định)
//   2. Python đóng gói sẵn trong bộ cài: resources/python/python.exe (Windows, bản đã đóng gói)
//   3. Lệnh hệ thống: "python" trên Windows, "python3" các hệ khác

const path = require("path");

function resolvePython({ env, isPackaged, resourcesPath, platform, exists }) {
  if (env.TEXTTS_PYTHON) return env.TEXTTS_PYTHON;
  if (isPackaged && platform === "win32") {
    const bundled = path.join(resourcesPath, "python", "python.exe");
    if (exists(bundled)) return bundled;
  }
  return platform === "win32" ? "python" : "python3";
}

// Thêm thư mục ffmpeg đi kèm (nếu có) lên đầu PATH để pydub tìm thấy ffmpeg.
function buildChildEnv({ env, isPackaged, resourcesPath, platform, exists }) {
  const next = { ...env };
  if (isPackaged && platform === "win32") {
    const ffmpegDir = path.join(resourcesPath, "ffmpeg");
    if (exists(path.join(ffmpegDir, "ffmpeg.exe"))) {
      const sep = platform === "win32" ? ";" : ":";
      next.PATH = ffmpegDir + sep + (env.PATH ?? env.Path ?? "");
    }
  }
  return next;
}

module.exports = { resolvePython, buildChildEnv };
