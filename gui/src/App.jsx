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
import AboutDialog from "./components/AboutDialog.jsx";
import WorkflowBar from "./components/WorkflowBar.jsx";
import { generateBlockReason, getWorkflowStep } from "./lib/workflow.js";

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
  const [showAbout, setShowAbout] = useState(false);
  const [readingsDict, setReadingsDict] = useState({});
  const [hasWorksheet, setHasWorksheet] = useState(false);
  const [searchOpen, setSearchOpen] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [replaceText, setReplaceText] = useState("");
  const [apiServer, setApiServer] = useState({ running: false, port: 8000, docsUrl: "http://127.0.0.1:8000/docs" });
  const [voicevoxOk, setVoicevoxOk] = useState(false);
  // Menu "Công cụ" trên thanh trên cùng: các chức năng phụ được gom vào đây cho gọn.
  const [showTools, setShowTools] = useState(false);
  const toolsRef = useRef(null);

  useEffect(() => {
    if (!showTools) return;
    const onDown = (e) => {
      if (!toolsRef.current?.contains(e.target)) setShowTools(false);
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [showTools]);

  useEffect(() => {
    if (window.textts?.getApiServerStatus) {
      window.textts.getApiServerStatus().then((s) => s && setApiServer(s));
    }
    if (window.textts?.getVoicevoxStatus) {
      window.textts.getVoicevoxStatus().then((res) => setVoicevoxOk(Boolean(res?.ok)));
    }
    const unsubAbout = window.textts?.onShowAbout?.(() => setShowAbout(true));
    const interval = setInterval(() => {
      window.textts?.getApiServerStatus?.().then((s) => s && setApiServer(s));
      window.textts?.getVoicevoxStatus?.().then((res) => setVoicevoxOk(Boolean(res?.ok)));
    }, 5000);
    return () => {
      clearInterval(interval);
      unsubAbout?.();
    };
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
  const workflowStep = getWorkflowStep({
    hasProject: Boolean(project),
    lineCount,
    hasOutput: Boolean(output),
    outputStale,
  });
  const blockReason = generateBlockReason({ hasProject: Boolean(project), lineCount, busy });

  function scrollToId(id) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  // Bấm vào một bước trên thanh quy trình thì làm đúng việc của bước đó.
  function onStepClick(key) {
    if (key === "import") openScript();
    else if (key === "edit") scrollToId("section-lines");
    else if (key === "generate") {
      // Khi chưa đủ điều kiện, đưa người dùng tới phần kịch bản để xem việc cần làm.
      if (blockReason) scrollToId("section-lines");
      else generate();
    }
    else if (output) scrollToId("section-output");
    else scrollToId("section-lines");
  }

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
        <div className="toolbar-group" role="group" aria-label="Mở hoặc nhập">
          <button onClick={openScript} disabled={busy} title="Chọn file kịch bản .txt để tạo dự án mới">
            Mở file .txt
          </button>
          <button className="ghost" onClick={() => setPasting((v) => !v)} disabled={busy} title="Dán nội dung kịch bản trực tiếp">
            Dán văn bản
          </button>
          <button className="ghost" onClick={openProject} disabled={busy} title="Mở dự án đã lưu (file .json) để sửa tiếp">
            Mở dự án đã lưu
          </button>
        </div>
        <button className="ghost help-btn" onClick={() => setShowAbout(true)} disabled={busy} title="Hướng dẫn từng bước và cú pháp kịch bản">
          ❓ Hướng dẫn
        </button>
        <span className="toolbar-spacer" />
        <span
          className="voicevox-status"
          title={voicevoxOk
            ? "VOICEVOX đang chạy: có thể dùng giọng VOICEVOX"
            : "VOICEVOX chưa chạy. Chỉ cần khi dùng giọng VOICEVOX; giọng Edge không cần"}
        >
          <span className={`status-dot ${voicevoxOk ? "dot-green" : "dot-yellow"}`} />
          VOICEVOX {voicevoxOk ? "sẵn sàng" : "chưa bật"}
        </span>
        <button className="ghost" onClick={undo} disabled={busy || !canUndo} title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác">↶</button>
        <button className="ghost" onClick={redo} disabled={busy || !canRedo} title="Làm lại (Ctrl+Shift+Z)" aria-label="Làm lại">↷</button>
        <div className="tools-menu" ref={toolsRef}>
          <button
            className="ghost"
            aria-haspopup="menu"
            aria-expanded={showTools}
            onClick={() => setShowTools((v) => !v)}
          >
            Công cụ ▾
          </button>
          {showTools && (
            <div className="tools-panel" role="menu" onClick={() => setShowTools(false)}>
              <button className="tools-item" role="menuitem" disabled={busy || !project} onClick={() => setSearchOpen((v) => !v)}>
                <strong>Tìm & thay thế</strong>
                <span>Sửa hàng loạt một cụm chữ trong mọi câu (Ctrl+F)</span>
              </button>
              <button className="tools-item" role="menuitem" disabled={busy || !filePath} onClick={openProjectFolder}>
                <strong>Mở thư mục dự án</strong>
                <span>Xem file .json, .mp3 và phụ đề đã tạo</span>
              </button>
              <button className="tools-item" role="menuitem" disabled={busy} onClick={() => setShowReadings(true)}>
                <strong>Từ điển cách đọc</strong>
                <span>Lưu cách đọc của các từ khó (readings.yaml) để áp dụng cho mọi kịch bản</span>
              </button>
              <button className="tools-item" role="menuitem" disabled={busy} onClick={() => setShowCache(true)}>
                <strong>Bộ nhớ đệm (cache)</strong>
                <span>Xem dung lượng và xóa âm thanh đã tạo trước đó để giải phóng ổ đĩa</span>
              </button>
              <button className="tools-item" role="menuitem" disabled={busy} onClick={checkUpdates}>
                <strong>Kiểm tra cập nhật</strong>
                <span>Tìm phiên bản textts mới trên GitHub</span>
              </button>
              <div className="tools-item tools-api" role="none">
                <strong>
                  <span className={`status-dot ${apiServer.running ? "dot-green" : "dot-gray"}`} />
                  Máy chủ API cho AI: {apiServer.running ? "đang bật" : "đang tắt"}
                </strong>
                <span>Chỉ bật khi bạn muốn ChatGPT, Claude hoặc agent khác gọi textts. Không cần cho việc dùng thường.</span>
                <div className="tools-api-actions">
                  <button className="ghost" role="menuitem" disabled={busy} onClick={toggleApiServer}>
                    {apiServer.running ? "Tắt API" : "Bật API"}
                  </button>
                  {apiServer.running && (
                    <button className="ghost" role="menuitem" onClick={openDocs}>Mở tài liệu API</button>
                  )}
                </div>
              </div>
              <button className="tools-item" role="menuitem" onClick={() => setShowAbout(true)}>
                <strong>Hướng dẫn đầy đủ</strong>
                <span>Cú pháp kịch bản, dòng lệnh CLI, kết nối AI và thông tin phiên bản</span>
              </button>
            </div>
          )}
        </div>
      </header>

      <WorkflowBar step={workflowStep} dirty={dirty} disabled={busy} onStepClick={onStepClick} />

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
          <p className="panel-title">Dán kịch bản</p>
          <p className="section-hint">
            Mỗi dòng là một câu, bắt đầu bằng số vai: <code>1 こんにちは</code> hoặc <code>[2] はい</code>.
            Chữ Hán có thể kèm cách đọc: <code>{"駅{えき}"}</code>. Sau khi tạo, bạn sẽ chỉnh tiếp trên màn hình chính.
          </p>
          <textarea rows={8} value={pasteText} disabled={busy}
            placeholder={"1 すみません、駅はどこですか。\n2 あちらです。"}
            onChange={(e) => setPasteText(e.target.value)} />
          {pasteError && <div className="preset-error" role="alert">{pasteError}</div>}
          <div className="panel-actions">
            <button onClick={importPasted} disabled={busy || !pasteText.trim()}>Tạo dự án từ văn bản</button>
            <button className="ghost" onClick={() => setPasting(false)}>Hủy</button>
          </div>
        </section>
      )}

      {!project ? (
        <main className="content welcome">
          <div className="welcome-card">
            <h2>Bắt đầu với textts</h2>
            <p className="welcome-lead">Biến kịch bản hội thoại tiếng Nhật thành file âm thanh, qua 3 bước:</p>
            <ol className="welcome-steps">
              <li>
                <strong>Nhập kịch bản.</strong> Bấm <em>Mở file .txt</em> hoặc <em>Dán văn bản</em>.
                Mỗi dòng là một câu, bắt đầu bằng số vai:
                <pre className="example">{"1 すみません、駅{えき}はどこですか。\n2 あちらです。\n[pause=800]"}</pre>
              </li>
              <li>
                <strong>Chỉnh vai và câu.</strong> Phần <em>Vai</em> chọn giọng và cảm xúc cho từng nhân vật.
                Bảng <em>Kịch bản</em> cho phép sửa chữ, đổi vai hoặc thêm câu.
              </li>
              <li>
                <strong>Tạo âm thanh.</strong> Bấm <em>Tạo âm thanh</em> ở góc dưới. Kết quả (.mp3) được lưu cạnh file dự án.
              </li>
            </ol>
            <div className="welcome-tips">
              <strong>Ghi nhớ</strong>
              <ul>
                <li>{"Viết 漢字{かな} để chỉ cách đọc chữ Hán, ví dụ 駅{えき}."}</li>
                <li><code>[pause=1000]</code> là nghỉ 1 giây; <code>[sfx=đường/dẫn.wav]</code> chèn hiệu ứng âm thanh.</li>
                <li>Bấm <kbd>Ctrl</kbd>+<kbd>S</kbd> để lưu, <kbd>Ctrl</kbd>+<kbd>Z</kbd> để hoàn tác.</li>
              </ul>
            </div>
            {!outputRoot && (
              <p className="notice">Lần đầu dùng: app sẽ hỏi bạn chọn thư mục để lưu file kết quả.</p>
            )}
            <div className="empty-actions">
              <button onClick={openScript} disabled={busy}>Mở file .txt</button>
              <button className="ghost" onClick={() => setPasting(true)} disabled={busy}>Dán văn bản</button>
              <button className="ghost" onClick={openProject} disabled={busy}>Mở dự án đã lưu</button>
            </div>
            <button className="link-btn" onClick={() => setShowAbout(true)}>
              Xem hướng dẫn đầy đủ (cú pháp, dòng lệnh, kết nối AI)
            </button>
          </div>
          {log && <pre className="log">{log}</pre>}
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

          <section id="section-lines">
            <div className="section-head">
              <div>
                <h2>Kịch bản <span className="count">({lineCount} câu)</span></h2>
                <p className="section-hint">
                  Sửa trực tiếp trong ô chữ. Đổi vai bằng ô đầu dòng. “theo vai” nghĩa là dùng cài đặt của vai đó;
                  chọn cảm xúc hoặc tốc độ khác để ghi đè riêng cho câu này.
                </p>
              </div>
              <div className="add-buttons">
                <button className="ghost" onClick={addLine} disabled={busy} title="Thêm câu thoại mới ở cuối (Ctrl+Enter)">+ Câu thoại</button>
                <button className="ghost" onClick={addPause} disabled={busy} title="Thêm khoảng nghỉ (mili-giây) ở cuối kịch bản">+ Khoảng nghỉ</button>
                <button className="ghost" onClick={addSfx} disabled={busy} title="Thêm một file âm thanh hiệu ứng (.wav, .mp3) ở cuối kịch bản">+ Hiệu ứng</button>
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
            <section id="section-output">
              <div className="section-head">
                <div>
                  <h2>Kết quả: dòng thời gian</h2>
                  <p className="section-hint">
                    Mỗi khối là một câu, độ dài theo thời lượng thật. Bấm vào sóng để nghe từ vị trí đó.
                    Kéo câu để dời về phía sau.
                  </p>
                </div>
                <div className="add-buttons">
                  <button className="ghost" onClick={() => window.textts?.openFolder?.(filePath)} disabled={busy || !filePath}>
                    Mở thư mục kết quả
                  </button>
                </div>
              </div>
              {outputStale && (
                <p className="stale">
                  Bạn đã sửa sau lần tạo gần nhất. Bấm “Tạo âm thanh” để cập nhật file.
                </p>
              )}
              <Timeline output={output} selectedId={selectedId} onShift={shiftItem} disabled={busy} />
            </section>
          )}

          {previewUrl && (
            <section>
              <h2>Nghe thử một câu</h2>
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
            {filePath ? `Dự án: ${filePath}` : "Chưa có dự án"}{dirty ? " • chưa lưu" : ""}
          </span>
          <span className="out-root" title={outputRoot}>
            Lưu file kết quả vào: {outputRoot || "chưa chọn"}
          </span>
          <button className="ghost" onClick={chooseOutputRoot} disabled={busy} title="Chọn thư mục để lưu file .mp3 và phụ đề">Đổi thư mục…</button>
        </div>
        <div className="actions">
          {busy && (
            <span className="progress" role="status">
              <span className="spinner" aria-hidden="true" />
              {lastLogLine || "Đang chuẩn bị…"}
            </span>
          )}
          {!busy && blockReason && <span className="block-hint">{blockReason}</span>}
          <button className="ghost" onClick={() => setShowExport(true)} disabled={busy}
            title="Chọn định dạng MP3/WAV, bản chậm, phụ đề, nhạc nền, chế độ luyện tập">
            Tùy chọn xuất…
          </button>
          <button className="ghost" onClick={save} disabled={busy || !project || !dirty} title="Lưu dự án (Ctrl+S)">Lưu</button>
          <button className="primary" onClick={generate} disabled={busy || Boolean(blockReason)} title={blockReason || "Tạo file âm thanh từ kịch bản hiện tại"}>
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

      {showAbout && (
        <AboutDialog
          onClose={() => setShowAbout(false)}
          docsUrl={apiServer.docsUrl}
          apiRunning={apiServer.running}
          onToggleApi={toggleApiServer}
        />
      )}
    </div>
  );
}

