// Workspace kiểu Adobe: mỗi workspace là một bố cục panel (độ rộng, chiều cao, panel nào mở, tab nào).
// Người dùng kéo giãn/thu gọn panel thì bố cục của workspace đó được ghi nhớ; "Đặt lại" trả về mặc định.

export const WORKSPACES = {
  edit: {
    label: "Soạn thảo",
    hint: "Soạn kịch bản và chú âm; timeline gọn",
    layout: { inspectorWidth: 380, dockHeight: 210, inspector: true, timeline: true, log: false, accent: false, accentHeight: 170, inspectorTab: "roles" },
  },
  audio: {
    label: "Âm thanh",
    hint: "Timeline nhiều track lớn, mixer và nhịp đọc",
    layout: { inspectorWidth: 340, dockHeight: 420, inspector: true, timeline: true, log: false, accent: false, accentHeight: 170, inspectorTab: "mixer" },
  },
  publish: {
    label: "Xuất bản",
    hint: "Tùy chọn xuất, tên file theo giáo trình, nhật ký",
    layout: { inspectorWidth: 460, dockHeight: 210, inspector: true, timeline: true, log: true, accent: false, accentHeight: 170, inspectorTab: "export" },
  },
};

export const PANELS = [
  ["inspector", "Thuộc tính"],
  ["timeline", "Timeline"],
  ["log", "Nhật ký xử lý"],
  ["accent", "Accent"],
];

const KEY = "textts.workspace.v1";
const LIMITS = { inspectorWidth: [260, 720], dockHeight: [120, 720], accentHeight: [110, 400] };

export function clampLayout(layout) {
  const out = { ...layout };
  for (const [k, [lo, hi]] of Object.entries(LIMITS)) {
    if (Number.isFinite(out[k])) out[k] = Math.round(Math.min(hi, Math.max(lo, out[k])));
  }
  return out;
}

export function defaultState() {
  return {
    active: "edit",
    theme: "dark",
    layouts: Object.fromEntries(Object.entries(WORKSPACES).map(([id, w]) => [id, { ...w.layout }])),
  };
}

export function loadWorkspace(storage) {
  const base = defaultState();
  try {
    const saved = JSON.parse(storage?.getItem(KEY) || "null");
    if (!saved) return base;
    const layouts = { ...base.layouts };
    for (const id of Object.keys(WORKSPACES)) {
      layouts[id] = clampLayout({ ...base.layouts[id], ...(saved.layouts?.[id] || {}) });
    }
    return {
      active: WORKSPACES[saved.active] ? saved.active : base.active,
      theme: saved.theme === "light" ? "light" : "dark",
      layouts,
    };
  } catch {
    return base;
  }
}

export function saveWorkspace(storage, state) {
  try {
    storage?.setItem(KEY, JSON.stringify(state));
  } catch {
    // bộ nhớ đầy/không cho ghi: bỏ qua, chỉ mất phần ghi nhớ bố cục
  }
}

export function patchLayout(state, patch) {
  const id = state.active;
  return { ...state, layouts: { ...state.layouts, [id]: clampLayout({ ...state.layouts[id], ...patch }) } };
}

export function resetLayout(state) {
  const id = state.active;
  return { ...state, layouts: { ...state.layouts, [id]: { ...WORKSPACES[id].layout } } };
}
