// Tham số chỉnh theo từng câu (ghi vào attrs của câu, khớp cú pháp {tempo=..., vol=..., pre=..., post=...}).
// engines: các engine hỗ trợ; null = mọi engine (xử lý khi ghép âm thanh, không phụ thuộc engine).

export const LINE_PARAMS = [
  {
    key: "tempo", label: "Nhịp điệu (tempo)", min: 0.5, max: 2, step: 0.05, def: 1, unit: "×", digits: 2,
    engines: ["aivis"],
    help: "Độ nhanh chậm có nhấn nhá trong câu (tempoDynamicsScale). 1 = bình thường. Chỉ AivisSpeech.",
  },
  {
    key: "vol", label: "Âm lượng", min: -20, max: 12, step: 0.5, def: 0, unit: "dB", digits: 1,
    engines: null,
    help: "To/nhỏ hơn so với vai, tính bằng dB. 0 = giữ nguyên.",
  },
  {
    key: "pre", label: "Lặng trước câu", min: 0, max: 3000, step: 50, def: 0, unit: "ms", digits: 0,
    engines: null,
    help: "Thêm khoảng lặng trước khi câu bắt đầu.",
  },
  {
    key: "post", label: "Lặng sau câu", min: 0, max: 3000, step: 50, def: 0, unit: "ms", digits: 0,
    engines: null,
    help: "Thêm khoảng lặng sau câu, cộng vào khoảng nghỉ trước câu kế tiếp.",
  },
];

export function paramSupported(param, engine) {
  return !param.engines || param.engines.includes(engine);
}

export function clampParam(param, value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return param.def;
  const v = Math.min(param.max, Math.max(param.min, n));
  return Number(v.toFixed(param.digits));
}

export function readParam(attrs, param) {
  const raw = attrs?.[param.key];
  if (raw === undefined || raw === "") return param.def;
  return clampParam(param, raw);
}

// Ghi giá trị vào attrs; bằng mặc định thì xóa khóa để kịch bản gọn và khóa cache không đổi.
export function writeParam(attrs, param, value) {
  const next = { ...(attrs || {}) };
  const v = clampParam(param, value);
  if (v === param.def) delete next[param.key];
  else next[param.key] = String(v);
  return next;
}

// ----- Accent -----
// spec "2/0" <-> [2, 0]; rỗng/không hợp lệ -> null
export function parseAccentSpec(spec) {
  if (!spec || !/^\d+(\/\d+)*$/.test(String(spec))) return null;
  return String(spec).split("/").map(Number);
}

export function accentSpec(accents) {
  return accents.join("/");
}

// Bấm mora thứ `moraIndex` (0-based) của cụm: accent rơi sau mora đó (= moraIndex+1);
// bấm lại đúng vị trí đang là accent thì về bằng (0).
export function toggleAccent(current, moraIndex) {
  const target = moraIndex + 1;
  return current === target ? 0 : target;
}

// Đường cao độ kiểu Tokyo cho từng mora: true = cao. accent 0 (bằng): mora 1 thấp, còn lại cao.
// accent 1: mora 1 cao, còn lại thấp. accent n>1: mora 1 thấp, 2..n cao, sau n thấp.
export function pitchPattern(moraCount, accent) {
  return Array.from({ length: moraCount }, (_, i) => {
    if (accent === 0) return i > 0 || moraCount === 1;
    if (accent === 1) return i === 0;
    return i > 0 && i < accent;
  });
}

// Toạ độ đường nối cao độ cho một cụm: mỗi mora rộng `width`, chấm cao ở y=`high`, thấp ở y=`low`.
export const MORA_GEOMETRY = { width: 34, high: 9, low: 35, height: 72 };

export function pitchPoints(pattern, { width, high, low } = MORA_GEOMETRY) {
  return pattern.map((isHigh, i) => `${i * width + width / 2},${isHigh ? high : low}`).join(" ");
}
