import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, patchFromPreset, removePreset, upsertPreset } from "./lib/library.js";
import RolePanel from "./components/RolePanel.jsx";
import Recorder from "./components/Recorder.jsx";
import LineTable from "./components/LineTable.jsx";
import Timeline from "./components/Timeline.jsx";
import Mixer from "./components/Mixer.jsx";
import ExportDialog from "./components/ExportDialog.jsx";

const nextId = (items) => {
  const nums = items.map((it) => Number(it.id.slice(1))).filter((n) => !Number.isNaN(n));
  return `L${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
};

export default function App() {
  const [project, setProjectState] = useState(null);
  // Bản hiện tại nằm trong ref để edit() luôn lấy đúng bản mới nhất, kể cả khi gọi liên tiếp.
  const projectRef = useRef(null);
  const history = useRef({ past: [], future: [] });
  const HISTORY_LIMIT = 100;
  const [filePath, setFilePath] = useState("");
  const [dirty, setDirty] = useState(false);
  const [selectedId, setSelectedId] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);
  const [suggestions, setSuggestions] = useState({});
  const [output, setOutput] = useState(null);
  const [outputStale, setOutputStale] = useState(false);
  const [errorIds, setErrorIds] = useState([]);
  const [voices, setVoices] = useState([]);
  const [issues, setIssues] = useState([]);
  // Cài đặt xuất được nhớ trong máy (localStorage) và dùng làm mặc định lần sau.
  const [exportOpts, setExportOpts] = useState(() => loadSettings(window.localStorage));
  const [presets, setPresets] = useState([]);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [showExport, setShowExport] = useState(false);
  // Đọc từ ref khi render; mỗi thay đổi đều đi kèm setState nên giao diện luôn cập nhật.
  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  // Dòng cuối của nhật ký cho biết bước hiện tại; nhật ký mở sẵn khi có lỗi.
  const lastLogLine = log.trim().split("\n").filter(Boolean).pop() ?? "";
  const logHasError = /lỗi|không|\[thoát với mã [^0]/i.test(log);

  useEffect(() => {
    saveSettings(window.localStorage, exportOpts);
  }, [exportOpts]);

  useEffect(() => {
    window.textts.loadPresets().then(setPresets);
  }, []);

  function persistPresets(next) {
    setPresets(next);
    window.textts.savePresets(next);
  }

  const library = {
    presets,
    onSave: (name, role) => persistPresets(upsertPreset(presets, name, role)),
    onRemove: (name) => persistPresets(removePreset(presets, name)),
    onApply: (roleId, preset) => patchRole(roleId, patchFromPreset(preset)),
  };

  useEffect(() => window.textts.onLog((text) => setLog((prev) => prev + text)), []);

  const items = project?.items ?? [];
  const lineCount = useMemo(() => items.filter((it) => it.type === "line").length, [items]);

  function setProject(next) {
    projectRef.current = next;
    setProjectState(next);
  }

  function edit(mutator) {
    const cur = projectRef.current;
    const next = mutator(cur);
    if (next === cur) return;
    const h = history.current;
    h.past.push(cur);
    if (h.past.length > HISTORY_LIMIT) h.past.shift();
    h.future = [];
    setProject(next);
    setDirty(true);
    setOutputStale(true);
  }

  function undo() {
    const h = history.current;
    if (!h.past.length) return;
    h.future.push(projectRef.current);
    setProject(h.past.pop());
    setDirty(true);
    setOutputStale(true);
  }

  function redo() {
    const h = history.current;
    if (!h.future.length) return;
    h.past.push(projectRef.current);
    setProject(h.future.pop());
    setDirty(true);
    setOutputStale(true);
  }

  // Phím tắt: Ctrl/⌘+Z hoàn tác, Ctrl/⌘+Shift+Z hoặc Ctrl+Y làm lại, Ctrl/⌘+S lưu,
  // Ctrl/⌘+Enter thêm câu. Bỏ qua khi đang gõ trong ô nhập để không đè lên undo của trình duyệt.
  useEffect(() => {
    function onKey(e) {
      if (busy || !projectRef.current) return;
      const mod = e.ctrlKey || e.metaKey;
      if (!mod) return;
      const key = e.key.toLowerCase();
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
      if (key === "s") {
        e.preventDefault();
        save();
      } else if (key === "enter") {
        e.preventDefault();
        addLine();
      } else if (!typing && key === "z" && !e.shiftKey) {
        e.preventDefault();
        undo();
      } else if (!typing && ((key === "z" && e.shiftKey) || key === "y")) {
        e.preventDefault();
        redo();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  });

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

  // Thư mục xuất do main process giữ và ghi nhớ; chọn lại bằng nút "Đổi…".
  const [outputRoot, setOutputRoot] = useState("");

  useEffect(() => {
    window.textts.getOutputRoot().then(setOutputRoot);
  }, []);

  async function chooseOutputRoot() {
    const picked = await window.textts.pickOutputRoot();
    if (picked) setOutputRoot(picked);
    return picked;
  }

  async function ensureOutputRoot() {
    return outputRoot || (await chooseOutputRoot());
  }

  async function openScript() {
    if (!(await ensureOutputRoot())) return;
    const res = await window.textts.openScript();
    if (!res) return;
    if (res.error) {
      setLog(res.error);
      return;
    }
    applyProject(res);
  }

  async function importPasted() {
    if (!pasteText.trim()) {
      setLog("Chưa có nội dung kịch bản để tạo dự án.");
      return;
    }
    if (!(await ensureOutputRoot())) return;
    const res = await window.textts.importText(pasteText);
    if (res.error) {
      setLog(res.error);
      return;
    }
    setPasting(false);
    setPasteText("");
    applyProject(res);
  }

  async function openProjectFolder() {
    const res = await window.textts.openFolder(filePath);
    if (res?.error) setLog(`Không mở được thư mục: ${res.error}`);
  }

  function applyProject(res) {
    history.current = { past: [], future: [] };
    setProject(res.data);
    window.textts.listVoices(res.data.engine).then(setVoices);
    window.textts.lint(res.filePath).then(setIssues);
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
    window.textts.lint(filePath).then(setIssues);
    refreshSuggestions(project);
    return true;
  }

  // Kết quả nằm cạnh project: <tên>.mp3 và <tên>.timeline.json
  async function loadOutputFor(projectPath, format = "mp3") {
    const res = await window.textts.loadOutput(projectPath.replace(/\.json$/, `.${format}`));
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
    const format = exportOpts.format;
    const outputPath = filePath.replace(/\.json$/, `.${format}`);
    const lufs = exportOpts.lufs.trim() === "" ? null : Number(exportOpts.lufs);
    const res = await window.textts.generate(filePath, outputPath, {
      lufs, slow: exportOpts.slow, srt: exportOpts.srt,
    });
    setLog((prev) => prev + `\n[thoát với mã ${res.code}]`);
    // Dòng lỗi có dạng "  - L002 (dòng 5): ...": đánh dấu và cuộn tới câu lỗi đầu tiên.
    const failed = [...res.log.matchAll(/^\s*-\s*(L\d+)\s+\(dòng/gm)].map((m) => m[1]);
    setErrorIds(failed);
    if (failed.length) {
      setTimeout(() => document.getElementById(`row-${failed[0]}`)?.scrollIntoView({ block: "center" }), 0);
    }
    if (res.code === 0) {
      await loadOutputFor(filePath, format);
      setOutputStale(false);
    }
    setBusy(false);
  }

  return (
    <div className="app">
      <header className="toolbar">
        <button onClick={openProject} disabled={busy}>Mở project.json</button>
        <button onClick={openScript} disabled={busy}>Mở kịch bản .txt</button>
        <button onClick={() => setPasting((v) => !v)} disabled={busy}>Dán kịch bản</button>
        <button className="ghost" onClick={openProjectFolder} disabled={busy || !filePath}>Mở thư mục dự án</button>
        <span className="toolbar-spacer" />
        <button className="ghost" onClick={undo} disabled={busy || !canUndo} title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác">↶</button>
        <button className="ghost" onClick={redo} disabled={busy || !canRedo} title="Làm lại (Ctrl+Shift+Z)" aria-label="Làm lại">↷</button>
      </header>

      {pasting && (
        <section className="paste-panel">
          <p>Mỗi dòng bắt đầu bằng số vai: <code>1 こんにちは</code>, <code>[2] はい</code>.
            Dự án mới sẽ được tạo trong thư mục xuất.</p>
          <textarea rows={8} value={pasteText} disabled={busy}
            onChange={(e) => setPasteText(e.target.value)} />
          <div>
            <button onClick={importPasted} disabled={busy}>Tạo dự án</button>
            <button className="ghost" onClick={() => setPasting(false)}>Hủy</button>
          </div>
        </section>
      )}

      {!project ? (
        <main className="content empty-state">
          <p>Mở một project.json, hoặc bắt đầu từ kịch bản.</p>
          <div className="empty-actions">
            <button onClick={openScript} disabled={busy}>Mở kịch bản .txt</button>
            <button className="ghost" onClick={() => setPasting(true)} disabled={busy}>Dán kịch bản</button>
            <button className="ghost" onClick={openProject} disabled={busy}>Mở project.json</button>
          </div>
        </main>
      ) : (
        <main className="content">
          <RolePanel roles={project.roles} onChange={patchRole} disabled={busy} voices={voices}
            recorder={(id) => <Recorder projectPath={filePath} roleId={id} disabled={busy} />}
            library={library} />
          <Mixer roles={project.roles} onChange={patchRole} disabled={busy} />

          <section>
            <div className="section-head">
              <h2>Kịch bản</h2>
              <div>
                <button className="ghost" onClick={addLine} disabled={busy} title="Thêm câu (Ctrl+Enter)">+ Câu thoại</button>
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
              errorIds={errorIds}
              issues={issues}
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

          <details className="log-wrap" open={logHasError}>
            <summary>Nhật ký{log ? ` (${log.trim().split("\n").length} dòng)` : ""}</summary>
            <pre className="log">{log}</pre>
          </details>
        </main>
      )}

      <footer className="actionbar">
        <div className="status">
          <span className="path" title={filePath}>
            {filePath || "Chưa mở project"}{dirty ? " • chưa lưu" : ""}
          </span>
          <span className="out-root" title={outputRoot}>
            Thư mục xuất: {outputRoot || "chưa chọn"}
          </span>
          <button className="ghost" onClick={chooseOutputRoot} disabled={busy}>Đổi…</button>
        </div>
        <div className="actions">
          {busy && (
            <span className="progress" role="status">
              <span className="spinner" aria-hidden="true" />
              {lastLogLine || "Đang chuẩn bị..."}
            </span>
          )}
          <button className="ghost" onClick={() => setShowExport(true)} disabled={busy}>Tùy chọn xuất…</button>
          <button className="ghost" onClick={save} disabled={busy || !project || !dirty} title="Lưu (Ctrl+S)">Lưu</button>
          <button className="primary" onClick={generate} disabled={busy || !project || lineCount === 0}>
            {busy ? "Đang xử lý..." : "Tạo âm thanh"}
          </button>
        </div>
      </footer>

      {showExport && (
        <ExportDialog opts={exportOpts} onChange={setExportOpts} disabled={busy}
          onClose={() => setShowExport(false)} />
      )}
    </div>
  );
}
