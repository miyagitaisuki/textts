// Đặt tên thư mục dự án: tên từ kịch bản, bỏ ký tự không hợp lệ cho đường dẫn, không trùng tên có sẵn.

const MAX_LEN = 80;

function sanitizeName(raw) {
  const cleaned = String(raw ?? "")
    .replace(/[<>:"/\\|?*\x00-\x1f]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^[.\- ]+|[.\- ]+$/g, "")
    .slice(0, MAX_LEN)
    .trim();
  return cleaned || "kich-ban";
}

/** Tên mặc định cho kịch bản dán vào: bai-moi-YYYYMMDD-HHMMSS theo giờ địa phương. */
function timestampName(date = new Date()) {
  const p = (n) => String(n).padStart(2, "0");
  const day = `${date.getFullYear()}${p(date.getMonth() + 1)}${p(date.getDate())}`;
  const time = `${p(date.getHours())}${p(date.getMinutes())}${p(date.getSeconds())}`;
  return `bai-moi-${day}-${time}`;
}

/** Trả về `base`, hoặc `base-2`, `base-3`... nếu đã có. `exists(name)` kiểm tra tên đã dùng. */
function uniqueName(base, exists) {
  if (!exists(base)) return base;
  for (let i = 2; ; i += 1) {
    const candidate = `${base}-${i}`;
    if (!exists(candidate)) return candidate;
  }
}

module.exports = { sanitizeName, timestampName, uniqueName };
