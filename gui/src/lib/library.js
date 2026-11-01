// Logic thuần cho thư viện mẫu vai, cài đặt chung và chỉ báo lỗi theo câu. Không phụ thuộc React.

export const PRESET_FIELDS = ["voice", "emotion", "speed", "pitch"];

export const DEFAULT_SETTINGS = { format: "mp3", lufs: "", slow: false, srt: false };
const SETTINGS_KEY = "textts.settings";

/** Lấy các trường mẫu từ cấu hình một vai. */
export function presetFromRole(role) {
  return Object.fromEntries(PRESET_FIELDS.map((k) => [k, role[k]]));
}

/** Thêm hoặc ghi đè mẫu theo tên; danh sách luôn xếp theo tên. */
export function upsertPreset(list, name, role) {
  const trimmed = name.trim();
  if (!trimmed) throw new Error("Tên mẫu không được để trống");
  return [...list.filter((p) => p.name !== trimmed), { name: trimmed, ...presetFromRole(role) }]
    .sort((a, b) => a.name.localeCompare(b.name));
}

export function removePreset(list, name) {
  return list.filter((p) => p.name !== name);
}

/** Patch để áp mẫu vào vai; chỉ lấy đúng các trường mẫu. */
export function patchFromPreset(preset) {
  return Object.fromEntries(PRESET_FIELDS.filter((k) => k in preset).map((k) => [k, preset[k]]));
}

/** Đọc cài đặt chung đã lưu; dữ liệu hỏng thì dùng mặc định. */
export function loadSettings(storage) {
  try {
    return { ...DEFAULT_SETTINGS, ...JSON.parse(storage.getItem(SETTINGS_KEY) || "{}") };
  } catch {
    return { ...DEFAULT_SETTINGS };
  }
}

export function saveSettings(storage, settings) {
  storage.setItem(SETTINGS_KEY, JSON.stringify(settings));
}

/** Gộp các cảnh báo/lỗi theo mã câu; lỗi thắng cảnh báo, các cảnh báo được nối lại. */
export function indexIssues(issues) {
  const byId = {};
  for (const i of issues) {
    const prev = byId[i.id];
    if (!prev) byId[i.id] = i;
    else if (i.level === "error" && prev.level !== "error") byId[i.id] = i;
    else if (prev.level === "warning" && i.level === "warning") {
      byId[i.id] = { ...prev, message: `${prev.message}; ${i.message}` };
    }
  }
  return byId;
}
