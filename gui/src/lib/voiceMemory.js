// Ghi nhớ engine và giọng đã chọn cho từng nhân vật, để lần nhập kịch bản sau tự gán lại.
// Khóa nhớ: tên nhân vật (nếu có) và mã vai ("#1"); khi áp dụng, tên được ưu tiên hơn mã vai.
// Không phụ thuộc React để kiểm thử được.

export const MEMORY_KEY = "textts.voiceMemory";
const FIELDS = ["voice", "emotion", "speed", "pitch"];

export function emptyMemory() {
  return { engine: "edge", roles: {} };
}

export function loadMemory(storage) {
  try {
    const m = JSON.parse(storage.getItem(MEMORY_KEY) || "null");
    if (m && typeof m === "object" && m.roles && typeof m.roles === "object") {
      return { engine: typeof m.engine === "string" ? m.engine : "edge", roles: m.roles };
    }
  } catch {
    // dữ liệu hỏng: dùng bộ nhớ rỗng
  }
  return emptyMemory();
}

export function saveMemory(storage, memory) {
  storage.setItem(MEMORY_KEY, JSON.stringify(memory));
}

function pick(role) {
  return Object.fromEntries(FIELDS.filter((k) => role[k] !== undefined).map((k) => [k, role[k]]));
}

function keysOf(id, role) {
  const keys = [];
  const name = (role.name || "").trim();
  if (name) keys.push(`name:${name}`);
  keys.push(`#${id}`);
  return keys;
}

/** Ghi nhớ engine và cấu hình giọng của mọi vai trong dự án. Trả về bộ nhớ mới (không sửa bản cũ). */
export function rememberProject(memory, project) {
  if (!project?.roles) return memory;
  const engine = project.engine || "edge";
  const forEngine = { ...(memory.roles[engine] || {}) };
  for (const [id, role] of Object.entries(project.roles)) {
    const value = pick(role);
    for (const key of keysOf(id, role)) forEngine[key] = value;
  }
  return { engine, roles: { ...memory.roles, [engine]: forEngine } };
}

/**
 * Áp bộ nhớ vào dự án vừa nhập: đặt engine và gán giọng đã nhớ cho từng vai.
 * `engine`: engine sẽ dùng (mặc định engine dùng lần trước). Trả về { project, applied } với
 * `applied` là danh sách mã vai đã được gán lại từ bộ nhớ.
 */
export function applyMemory(project, memory, engine = memory.engine) {
  const remembered = memory.roles[engine] || {};
  const applied = [];
  const roles = {};
  for (const [id, role] of Object.entries(project.roles)) {
    const hit = keysOf(id, role).map((k) => remembered[k]).find(Boolean);
    if (hit) {
      roles[id] = { ...role, ...hit };
      applied.push(id);
    } else {
      roles[id] = role;
    }
  }
  return { project: { ...project, engine, roles }, applied };
}

/**
 * Vai có giọng không thuộc danh sách `values` của engine được gán giọng khác trong danh sách đó
 * (ưu tiên giọng chưa vai nào dùng), để không gửi tên giọng Edge sang VOICEVOX. Danh sách rỗng thì giữ nguyên.
 */
export function fillMissingVoices(project, values) {
  if (!values.length) return project;
  const used = new Set(Object.values(project.roles).map((r) => String(r.voice)).filter((v) => values.includes(v)));
  const free = values.filter((v) => !used.has(v));
  const roles = {};
  let n = 0;
  for (const [id, role] of Object.entries(project.roles)) {
    if (values.includes(String(role.voice))) {
      roles[id] = role;
    } else {
      roles[id] = { ...role, voice: free.length ? free[n % free.length] : values[n % values.length] };
      n += 1;
    }
  }
  return { ...project, roles };
}
