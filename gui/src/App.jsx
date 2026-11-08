import { useEffect, useMemo, useRef, useState } from "react";
import { DEFAULT_SETTINGS, loadSettings, saveSettings, patchFromPreset, removePreset, upsertPreset } from "./lib/library.js";
import RolePanel from "./components/RolePanel.jsx";
import Recorder from "./components/Recorder.jsx";
import LineTable from "./components/LineTable.jsx";
import Timeline from "./components/Timeline.jsx";
import Mixer from "./components/Mixer.jsx";
import ExportDialog from "./components/ExportDialog.jsx";
import ReadingsDialog from "./components/ReadingsDialog.jsx";
import CacheManagerDialog from "./components/CacheManagerDialog.jsx";

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
  // Lỗi tạo dự án từ kịch bản dán: hiện ngay trong khung dán, không phụ thuộc đã mở project hay chưa.
  const [pasteError, setPasteError] = useState("");
  const [showExport, setShowExport] = useState(false);
  const [showReadings, setShowReadings] = useState(false);
  const [showCache, setShowCache] = useState(false);
  const [readingsDict, setReadingsDict] = useState({});
  const [hasWorksheet, setHasWorksheet] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [apiServer, setApiServer] = useState({ running: false, port: 8000, docsUrl: "http://127.0.0.1:8000/docs" });
  const [voicevoxOk, setVoicevoxOk] = useState(false);

  useEffect(() => {
    if (window.textts?.getApiServerStatus) {
      window.textts.getApiServerStatus().then((s) => s && setApiServer(s));
    }
    if (window.textts?.getVoicevoxStatus) {
      window.textts.getVoicevoxStatus().then((res) => setVoicevoxOk(Boolean(res?.ok)));
    }
    const interval = setInterval(() => {
      window.textts?.getApiServerStatus?.().then((s) => s && setApiServer(s));
      window.textts?.getVoicevoxStatus?.().then((res) => setVoicevoxOk(Boolean(res?.ok)));
    }, 5000);
    return () => clearInterval(interval);
  }, []);

  async function toggleApiServer() {
    if (!window.textts?.toggleApiServer) return;
    const res = await window.textts.toggleApiServer();
    if (res) setApiServer(res);
  }

  function openDocs() {
    window.textts?.openExternalUrl?.(apiServer.docsUrl || "http://127.0.0.1:8000/docs");
  }

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
    if (window.textts?.loadReadings) {
      window.textts.loadReadings(filePath).then((d) => d && setReadingsDict(d));
    }
  }, [filePath]);

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
      } else if (key === "f") {
        e.preventDefault();
        setSearchOpen((v) => !v);
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
      setLog((prev) => prev + `\nLỗi khi lấy gợi ý cách đọc:\n${res.error}\n`);
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
    setPasteError("");
    if (!pasteText.trim()) {
      setPasteError("Chưa có nội dung kịch bản để tạo dự án.");
      return;
    }
    if (!(await ensureOutputRoot())) {
      setPasteError("Chưa chọn thư mục xuất. Bấm \"Đổi…\" để chọn.");
      return;
    }
    const res = await window.textts.importText(pasteText);
    if (res.error) {
      setPasteError(res.error);
      return;
    }
    setPasting(false);
    setPasteText("");
    applyProject(res);
  }

  async function checkUpdates() {
    const res = await window.textts.checkForUpdates();
    setLog((prev) => prev + `\n${res.message}\n`);
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

  function addRole() {
    edit((p) => {
      const nums = Object.keys(p.roles).map(Number).filter((n) => !Number.isNaN(n));
      const nextRoleId = String((nums.length ? Math.max(...nums) : 0) + 1);
      const firstRole = Object.values(p.roles)[0] || {
        voice: "ja-JP-NanamiNeural",
        emotion: "neutral",
        speed: "normal",
        pitch: 0,
        gain_db: 0,
      };
      return {
        ...p,
        roles: {
          ...p.roles,
          [nextRoleId]: {
            ...firstRole,
            name: `Vai ${nextRoleId}`,
            gain_db: 0,
          },
        },
      };
    });
  }

  function deleteRole(roleId) {
    const isUsed = (projectRef.current?.items || []).some((it) => it.type === "line" && it.role === roleId);
    if (isUsed) {
      alert(`Vai [${roleId}] đang được sử dụng trong kịch bản. Hãy đổi vai của các câu thoại đó trước khi xóa.`);
      return;
    }
    edit((p) => {
      const nextRoles = { ...p.roles };
      delete nextRoles[roleId];
      return { ...p, roles: nextRoles };
    });
  }

  function duplicateItem(id) {
    edit((p) => {
      const idx = p.items.findIndex((it) => it.id === id);
      if (idx < 0) return p;
      const target = p.items[idx];
      const copy = { ...target, id: nextId(p.items) };
      const nextItems = [...p.items];
      nextItems.splice(idx + 1, 0, copy);
      return { ...p, items: nextItems };
    });
  }

  function insertLineBelow(id) {
    edit((p) => {
      const idx = p.items.findIndex((it) => it.id === id);
      const targetRole = p.items[idx]?.role || Object.keys(p.roles)[0] || "1";
      const newLine = {
        id: nextId(p.items),
        type: "line",
        src_line: 0,
        role: targetRole,
        attrs: {},
        display: "",
        tts_text: "",
        plain: "",
      };
      const nextItems = [...p.items];
      nextItems.splice(idx + 1, 0, newLine);
      return { ...p, items: nextItems };
    });
  }

  async function addSfx() {
    let chosenPath = "";
    if (window.textts?.pickAudioFile) {
      chosenPath = await window.textts.pickAudioFile();
    }
    if (!chosenPath) {
      chosenPath = window.prompt("Nhập đường dẫn file hiệu ứng âm thanh (.wav, .mp3):");
    }
    if (!chosenPath) return;
    edit((p) => ({
      ...p,
      items: [...p.items, { id: nextId(p.items), type: "sfx", src_line: 0, path: chosenPath }],
    }));
  }

  function applyReadingsToProject(dict) {
    if (!dict || Object.keys(dict).length === 0) return;
    const words = Object.keys(dict).sort((a, b) => b.length - a.length);
    const pattern = new RegExp(`(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?!\\{)`, "g");
    edit((p) => ({
      ...p,
      items: p.items.map((it) => {
        if (it.type !== "line") return it;
        const nextDisplay = it.display.replace(pattern, (m, w) => `${w}{${dict[w]}}`);
        return nextDisplay !== it.display ? { ...it, display: nextDisplay } : it;
      }),
    }));
  }

  function replaceAll() {
    if (!searchText) return;
    edit((p) => ({
      ...p,
      items: p.items.map((it) => {
        if (it.type !== "line") return it;
        const nextDisplay = it.display.replaceAll(searchText, replaceText);
        return nextDisplay !== it.display ? { ...it, display: nextDisplay } : it;
      }),
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
    else setLog((prev) => prev + `\nLỗi khi nghe thử:\n${res.error}\n`);
  }

  async function generate() {
    if (!(await save())) return;
    setBusy(true);
    setLog("");
    const format = exportOpts.format;
    const outputPath = filePath.replace(/\.json$/, `.${format}`);
    const res = await window.textts.generate(filePath, outputPath, {
      lufs: exportOpts.lufs,
      slow: exportOpts.slow,
      srt: exportOpts.srt,
      rolePlay: exportOpts.rolePlay,
      shadow: exportOpts.shadow,
      shadowGap: exportOpts.shadowGap,
      exportLines: exportOpts.exportLines,
      worksheet: exportOpts.worksheet,
      bgmPath: exportOpts.bgmPath,
      bgmDb: exportOpts.bgmDb,
    });
    setLog((prev) => prev + `\n${res.code === 0 ? "Hoàn tất" : "Dừng với lỗi"} (mã thoát ${res.code})`);
    // Dòng lỗi có dạng "  - L002 (dòng 5): ...": đánh dấu và cuộn tới câu lỗi đầu tiên.
    const failed = [...res.log.matchAll(/^\s*-\s*(L\d+)\s+\(dòng/gm)].map((m) => m[1]);
    setErrorIds(failed);
    if (failed.length) {
      setTimeout(() => document.getElementById(`row-${failed[0]}`)?.scrollIntoView({ block: "center" }), 0);
    }
    if (res.code === 0) {
      await loadOutputFor(filePath, format);
      setOutputStale(false);
      window.textts?.worksheetExists?.(filePath).then(setHasWorksheet);
    }
    setBusy(false);
  }

  return (
    <div className="app">
      <header className="toolbar">
        <button onClick={openProject} disabled={busy}>Mở dự án (project.json)</button>
        <button onClick={openScript} disabled={busy}>Mở kịch bản .txt</button>
        <button onClick={() => setPasting((v) => !v)} disabled={busy}>Dán kịch bản</button>
        <button className="ghost" onClick={openProjectFolder} disabled={busy || !filePath}>Mở thư mục dự án</button>
        <button className="ghost" onClick={checkUpdates} disabled={busy} title="Kiểm tra bản mới trên GitHub">Kiểm tra cập nhật</button>
        <button className="ghost" onClick={() => setShowReadings(true)} disabled={busy} title="Mở từ điển cách đọc Kanji (readings.yaml)">Từ điển đọc</button>
        <button className="ghost" onClick={() => setShowCache(true)} disabled={busy} title="Quản lý bộ nhớ đệm cache">Cache</button>
        <button
          className={searchOpen ? "ghost active" : "ghost"}
          onClick={() => setSearchOpen((v) => !v)}
          disabled={busy || !project}
          title="Tìm kiếm & Thay thế (Ctrl+F)"
        >
          Tìm (Ctrl+F)
        </button>
        <button
          className={apiServer.running ? "ghost api-btn on" : "ghost api-btn"}
          onClick={toggleApiServer}
          title={apiServer.running ? "API Server đang bật trên cổng 8000. Bấm để tắt" : "Bật API Server cho AI"}
        >
          <span className={`status-dot ${apiServer.running ? "dot-green" : "dot-gray"}`} />
          API: {apiServer.running ? "Bật (:8000)" : "Tắt"}
        </button>
        {apiServer.running && (
          <button className="ghost" onClick={openDocs} title="Mở trang tài liệu Swagger UI">
            Docs
          </button>
        )}
        <span
          className="voicevox-status"
          title={voicevoxOk ? "VOICEVOX Engine đang chạy (port 50021)" : "VOICEVOX Engine chưa bật"}
        >
          <span className={`status-dot ${voicevoxOk ? "dot-green" : "dot-yellow"}`} />
          VOICEVOX
        </span>
        <span className="toolbar-spacer" />
        <button className="ghost" onClick={undo} disabled={busy || !canUndo} title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác">↶</button>
        <button className="ghost" onClick={redo} disabled={busy || !canRedo} title="Làm lại (Ctrl+Shift+Z)" aria-label="Làm lại">↷</button>
      </header>

      {searchOpen && project && (
        <section className="search-bar">
          <input
            type="text"
            placeholder="Tìm kiếm trong kịch bản..."
            value={searchText}
            onChange={(e) => setSearchText(e.target.value)}
          />
          <input
            type="text"
            placeholder="Thay thế bằng..."
            value={replaceText}
            onChange={(e) => setReplaceText(e.target.value)}
          />
          <button className="ghost" onClick={replaceAll} disabled={busy || !searchText}>Thay thế tất cả</button>
          <button className="ghost" onClick={() => setSearchOpen(false)}>✕</button>
        </section>
      )}

      {pasting && (
        <section className="paste-panel">
          <p>Mỗi dòng bắt đầu bằng số vai: <code>1 こんにちは</code>, <code>[2] はい</code>.
            Dự án mới sẽ được tạo trong thư mục xuất.</p>
          <textarea rows={8} value={pasteText} disabled={busy}
            onChange={(e) => setPasteText(e.target.value)} />
          {pasteError && <div className="preset-error" role="alert">{pasteError}</div>}
          <div>
            <button onClick={importPasted} disabled={busy}>Tạo dự án</button>
            <button className="ghost" onClick={() => setPasting(false)}>Hủy</button>
          </div>
        </section>
      )}

      {!project ? (
        <main className="content empty-state">
          <p>Mở một dự án (project.json), hoặc bắt đầu từ kịch bản.</p>
          {log && <pre className="log">{log}</pre>}
          <div className="empty-actions">
            <button onClick={openScript} disabled={busy}>Mở kịch bản .txt</button>
            <button className="ghost" onClick={() => setPasting(true)} disabled={busy}>Dán kịch bản</button>
            <button className="ghost" onClick={openProject} disabled={busy}>Mở dự án (project.json)</button>
          </div>
        </main>
      ) : (
        <main className="content">
          <RolePanel
            roles={project.roles}
            onChange={patchRole}
            onAddRole={addRole}
            onDeleteRole={deleteRole}
            disabled={busy}
            voices={voices}
            recorder={(id) => <Recorder projectPath={filePath} roleId={id} disabled={busy} />}
            library={library}
          />
          <Mixer roles={project.roles} onChange={patchRole} disabled={busy} />

          <section>
            <div className="section-head">
              <h2>Kịch bản</h2>
              <div>
                <button className="ghost" onClick={addLine} disabled={busy} title="Thêm câu (Ctrl+Enter)">+ Câu thoại</button>
                <button className="ghost" onClick={addPause} disabled={busy}>+ Nghỉ</button>
                <button className="ghost" onClick={addSfx} disabled={busy} title="Thêm hiệu ứng âm thanh">+ SFX</button>
              </div>
            </div>
            <LineTable
              items={items}
              roles={project.roles}
              selectedId={selectedId}
              onSelect={setSelectedId}
              onPatch={patchItem}
              onMove={moveItem}
              onDelete={deleteItem}
              onDuplicate={duplicateItem}
              onInsertBelow={insertLineBelow}
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
              <h2>Dòng thời gian</h2>
              {outputStale && (
                <p className="stale">Bản đầu ra đã cũ so với chỉnh sửa. Bấm "Tạo âm thanh" để cập nhật.</p>
              )}
              <Timeline output={output} selectedId={selectedId} onShift={shiftItem} disabled={busy} />
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
            {filePath || "Chưa mở dự án"}{dirty ? " • chưa lưu" : ""}
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
              {lastLogLine || "Đang chuẩn bị…"}
            </span>
          )}
          <button className="ghost" onClick={() => setShowExport(true)} disabled={busy}>Tùy chọn xuất…</button>
          <button className="ghost" onClick={save} disabled={busy || !project || !dirty} title="Lưu (Ctrl+S)">Lưu</button>
          <button className="primary" onClick={generate} disabled={busy || !project || lineCount === 0}>
            {busy ? "Đang xử lý…" : "Tạo âm thanh"}
          </button>
        </div>
      </footer>

      {showExport && (
        <ExportDialog
          opts={exportOpts}
          onChange={setExportOpts}
          roles={project?.roles || {}}
          onPickAudio={() => window.textts?.pickAudioFile?.()}
          onOpenWorksheet={() => window.textts?.openWorksheet?.(filePath)}
          hasWorksheet={hasWorksheet}
          disabled={busy}
          onClose={() => setShowExport(false)}
        />
      )}

      {showReadings && (
        <ReadingsDialog
          readings={readingsDict}
          onSave={async (dict) => {
            setReadingsDict(dict);
            await window.textts?.saveReadings?.(filePath, dict);
          }}
          onApplyToProject={applyReadingsToProject}
          disabled={busy}
          onClose={() => setShowReadings(false)}
        />
      )}

      {showCache && (
        <CacheManagerDialog disabled={busy} onClose={() => setShowCache(false)} />
      )}
    </div>
  );
}

