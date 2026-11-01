import { useEffect, useMemo, useState } from "react";
import RolePanel from "./components/RolePanel.jsx";
import LineTable from "./components/LineTable.jsx";
import Timeline from "./components/Timeline.jsx";
import Mixer from "./components/Mixer.jsx";

const nextId = (items) => {
  const nums = items.map((it) => Number(it.id.slice(1))).filter((n) => !Number.isNaN(n));
  return `L${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
};

export default function App() {
  const [project, setProject] = useState(null);
  const [filePath, setFilePath] = useState("");
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState({});
  const [output, setOutput] = useState(null);
  const [outputStale, setOutputStale] = useState(false);

  useEffect(() => window.textts.onLog((text) => setLog((prev) => prev + text)), []);

  const items = project?.items ?? [];
  const lineCount = useMemo(() => items.filter((it) => it.type === "line").length, [items]);

  function edit(mutator) {
    setProject((p) => mutator(p));
    setDirty(true);
    setOutputStale(true);
  }

  // Gợi ý cách đọc chỉ là tham khảo: lỗi ở đây không chặn việc soạn thảo.
  async function refreshSuggestions(proj) {
    const lines = (proj?.items ?? []).filter((it) => it.type === "line");
    if (lines.length === 0) return setSuggestions({});
    const res = await window.textts.suggestReadings(lines.map((it) => it.display));
    if (!res.ok) {
      setLog((prev) => prev + `\n[gợi ý cách đọc lỗi]\n${res.error}\n`);
      return;
    }
    const map = {};
    lines.forEach((it, i) => (map[it.id] = res.items[i]));
    setSuggestions(map);
  }

  async function openProject() {
    const res = await window.textts.openProject();
    if (res) applyProject(res);
  }

  async function openScript() {
    const res = await window.textts.openScript();
    if (!res) return;
    if (res.error) {
      setLog(res.error);
      return;
    }
    applyProject(res);
  }

  function applyProject(res) {
    setProject(res.data);
    setFilePath(res.filePath);
    setDirty(false);
    setSelectedId(null);
    setPreviewUrl(null);
    setLog("");
    setOutput(null);
    setOutputStale(false);
    refreshSuggestions(res.data);
    loadOutputFor(res.filePath);
  }

  async function save() {
    if (!filePath || !project) return false;
    await window.textts.saveProject(filePath, project);
    setDirty(false);
    refreshSuggestions(project);
    return true;
  }

  // Kết quả nằm cạnh project: <tên>.mp3 và <tên>.timeline.json
  async function loadOutputFor(projectPath) {
    const res = await window.textts.loadOutput(projectPath.replace(/\.json$/, ".mp3"));
    setOutput(res);
    setOutputStale(false);
  }

  // Kéo thả: dời câu về phía sau. Không thay đổi câu khác ngoài việc đẩy các câu sau nó.
  function shiftItem(id, deltaMs) {
    edit((p) => ({
      ...p,
      items: p.items.map((it) =>
        it.id === id ? { ...it, delay_ms: Math.max(0, (it.delay_ms || 0) + deltaMs) } : it
      ),
    }));
  }

  function applySuggestion(id) {
    const sug = suggestions[id];
    if (sug) patchItem(id, { display: sug.annotated });
  }

  function patchItem(id, patch) {
    edit((p) => ({
      ...p,
      items: p.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  }

  function patchRole(roleId, patch) {
    edit((p) => ({ ...p, roles: { ...p.roles, [roleId]: { ...p.roles[roleId], ...patch } } }));
  }

  function moveItem(id, delta) {
    edit((p) => {
      const i = p.items.findIndex((it) => it.id === id);
      const j = i + delta;
      if (j < 0 || j >= p.items.length) return p;
      const copy = [...p.items];
      [copy[i], copy[j]] = [copy[j], copy[i]];
      return { ...p, items: copy };
    });
  }

  function deleteItem(id) {
    edit((p) => ({ ...p, items: p.items.filter((it) => it.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }

  function addLine() {
    edit((p) => {
      const id = nextId(p.items);
      const role = Object.keys(p.roles)[0] ?? "1";
      const line = { id, type: "line", src_line: 0, role, attrs: {}, display: "", tts_text: "", plain: "" };
      return { ...p, items: [...p.items, line] };
    });
  }

  function addPause() {
    edit((p) => ({
      ...p,
      items: [...p.items, { id: nextId(p.items), type: "pause", src_line: 0, ms: 500 }],
    }));
  }

  // Lưu trước khi chạy để tiến trình Python đọc đúng nội dung đang sửa.
  async function preview(id) {
    if (!(await save())) return;
    setBusy(true);
    setPreviewUrl(null);
    const res = await window.textts.preview(filePath, id);
    setBusy(false);
    if (res.ok) setPreviewUrl(res.dataUrl);
    else setLog((prev) => prev + `\n[nghe thử lỗi]\n${res.error}\n`);
  }

  async function generate() {
    if (!(await save())) return;
    setBusy(true);
    setLog("");
    const outputPath = filePath.replace(/\.json$/, ".mp3");
    const res = await window.textts.generate(filePath, outputPath);
    setLog((prev) => prev + `\n[thoát với mã ${res.code}]`);
    if (res.code === 0) {
      await loadOutputFor(filePath);
      setOutputStale(false);
    }
    setBusy(false);
  }

  return (
    <div className="app">
      <header className="toolbar">
        <button onClick={openProject} disabled={busy}>Mở project.json</button>
        <button onClick={openScript} disabled={busy}>Mở kịch bản .txt</button>
        <button onClick={save} disabled={busy || !project || !dirty}>Lưu</button>
        <button onClick={generate} disabled={busy || !project || lineCount === 0}>
          {busy ? "Đang xử lý..." : "Tạo âm thanh"}
        </button>
        {outputStale && output && <span className="stale">cần tạo lại</span>}
        <span className="path">
          {filePath || "Chưa mở project"}{dirty ? " • chưa lưu" : ""}
        </span>
      </header>

      {!project ? (
        <main className="content empty-state">Mở một project.json để bắt đầu.</main>
      ) : (
        <main className="content">
          <RolePanel roles={project.roles} onChange={patchRole} disabled={busy} />
          <Mixer roles={project.roles} onChange={patchRole} disabled={busy} />

          <section>
            <div className="section-head">
              <h2>Kịch bản</h2>
              <div>
                <button className="ghost" onClick={addLine} disabled={busy}>+ Câu thoại</button>
                <button className="ghost" onClick={addPause} disabled={busy}>+ Nghỉ</button>
              </div>
            </div>
            <LineTable
              items={items}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPatch={patchItem}
              onMove={moveItem}
              onDelete={deleteItem}
              onPreview={preview}
              suggestions={suggestions}
              onApply={applySuggestion}
              disabled={busy}
            />
          </section>

          {output && (
            <section>
              <h2>Timeline</h2>
              {outputStale && (
                <p className="stale">Bản đầu ra đã cũ so với chỉnh sửa. Bấm "Tạo âm thanh" để cập nhật.</p>
              )}
              <Timeline output={output} onShift={shiftItem} disabled={busy} />
            </section>
          )}

          {previewUrl && (
            <section>
              <h2>Nghe thử</h2>
              <audio controls autoPlay src={previewUrl} />
            </section>
          )}

          <pre className="log">{log}</pre>
        </main>
      )}
    </div>
  );
}
