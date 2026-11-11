import { useEffect, useMemo, useRef, useState } from "react";
import {
  DEFAULT_SETTINGS,
  loadSettings,
  saveSettings,
  patchFromPreset,
  removePreset,
  upsertPreset,
} from "./lib/library.js";
import Inspector from "./components/Inspector.jsx";
import Recorder from "./components/Recorder.jsx";
import LineTable from "./components/LineTable.jsx";
import AivisButton from "./components/AivisButton.jsx";
import VoicevoxButton from "./components/VoicevoxButton.jsx";
import Timeline from "./components/Timeline.jsx";
import TransportBar from "./components/TransportBar.jsx";
import ToastContainer from "./components/Toast.jsx";
import ExportDialog from "./components/ExportDialog.jsx";
import ReadingsDialog from "./components/ReadingsDialog.jsx";
import CacheManagerDialog from "./components/CacheManagerDialog.jsx";
import AboutDialog from "./components/AboutDialog.jsx";
import {
  PlayIcon,
  PlusIcon,
  ClockIcon,
  MusicIcon,
  SearchIcon,
  UndoIcon,
  RedoIcon,
  SparklesIcon,
  BookOpenIcon,
  HardDriveIcon,
  InfoIcon,
} from "./components/Icons.jsx";

const nextId = (items) => {
  const nums = items.map((it) => Number(it.id.slice(1))).filter((n) => !Number.isNaN(n));
  return `L${String((nums.length ? Math.max(...nums) : 0) + 1).padStart(3, "0")}`;
};

export default function App() {
  const [project, setProjectState] = useState(null);
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
  const [exportOpts, setExportOpts] = useState(() => loadSettings(window.localStorage));
  const [presets, setPresets] = useState([]);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
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
  const [apiServer, setApiServer] = useState({
    running: false,
    port: 8000,
    docsUrl: "http://127.0.0.1:8000/docs",
  });
  const [voicevoxOk, setVoicevoxOk] = useState(false);
  const [outputRoot, setOutputRoot] = useState("");

  // Timeline & Playback
  const audioRef = useRef(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [audioDuration, setAudioDuration] = useState(0);
  const [playbackRate, setPlaybackRate] = useState(1.0);
  const [timelineOpen, setTimelineOpen] = useState(true);

  // Toasts
  const [toasts, setToasts] = useState([]);

  function addToast(message, type = "info") {
    const id = Date.now() + Math.random().toString();
    setToasts((prev) => [...prev, { id, message, type }]);
  }

  function dismissToast(id) {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }

  // Audio Sync
  useEffect(() => {
    if (output?.dataUrl && audioRef.current) {
      audioRef.current.src = output.dataUrl;
      const dur = output.timeline?.duration_ms ? output.timeline.duration_ms / 1000 : 0;
      setAudioDuration(dur);
    }
  }, [output]);

  function togglePlay() {
    if (!audioRef.current || !output?.dataUrl) return;
    if (audioRef.current.paused) {
      audioRef.current.play().catch(() => {});
    } else {
      audioRef.current.pause();
    }
  }

  function seek(secs) {
    if (!audioRef.current) return;
    audioRef.current.currentTime = secs;
    setCurrentTime(secs);
  }

  function changePlaybackRate(r) {
    setPlaybackRate(r);
    if (audioRef.current) {
      audioRef.current.playbackRate = r;
    }
  }

  // Spacebar để Play/Pause
  useEffect(() => {
    function onKeyDown(e) {
      if (e.code === "Space") {
        const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
        if (typing) return;
        e.preventDefault();
        togglePlay();
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [output]);

  useEffect(() => {
    if (window.textts?.getApiServerStatus) {
      window.textts.getApiServerStatus().then((s) => s && setApiServer(s));
    }
    if (window.textts?.getVoicevoxStatus) {
      window.textts.getVoicevoxStatus().then((res) => setVoicevoxOk(Boolean(res?.ok)));
    }
    window.textts?.getOutputRoot?.().then(setOutputRoot);

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
    if (res) {
      setApiServer(res);
      addToast(`API Server: ${res.running ? "Đã bật (:8000)" : "Đã tắt"}`, "info");
    }
  }

  function openDocs() {
    window.textts?.openExternalUrl?.(apiServer.docsUrl || "http://127.0.0.1:8000/docs");
  }

  const canUndo = history.current.past.length > 0;
  const canRedo = history.current.future.length > 0;
  const lastLogLine = log.trim().split("\n").filter(Boolean).pop() ?? "";
  const logHasError = /lỗi|không|\[thoát với mã [^0]/i.test(log);

  useEffect(() => {
    saveSettings(window.localStorage, exportOpts);
  }, [exportOpts]);

  useEffect(() => {
    window.textts?.loadPresets?.().then(setPresets);
    if (window.textts?.loadReadings) {
      window.textts.loadReadings(filePath).then((d) => d && setReadingsDict(d));
    }
  }, [filePath]);

  function persistPresets(next) {
    setPresets(next);
    window.textts?.savePresets?.(next);
  }

  const library = {
    presets,
    onSave: (name, role) => {
      persistPresets(upsertPreset(presets, name, role));
      addToast(`Đã lưu mẫu "${name}"`, "success");
    },
    onRemove: (name) => {
      persistPresets(removePreset(presets, name));
      addToast(`Đã xóa mẫu "${name}"`, "info");
    },
    onApply: (roleId, preset) => {
      patchRole(roleId, patchFromPreset(preset));
      addToast(`Đã áp dụng mẫu "${preset.name}" cho vai ${roleId}`, "success");
    },
  };

  useEffect(() => window.textts?.onLog?.((text) => setLog((prev) => prev + text)), []);

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
    addToast("Hoàn tác", "info");
  }

  function redo() {
    const h = history.current;
    if (!h.future.length) return;
    h.past.push(projectRef.current);
    setProject(h.future.pop());
    setDirty(true);
    setOutputStale(true);
    addToast("Làm lại", "info");
  }

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

  async function refreshSuggestions(proj) {
    const lines = (proj?.items ?? []).filter((it) => it.type === "line");
    if (lines.length === 0) return setSuggestions({});
    const res = await window.textts?.suggestReadings?.(lines.map((it) => it.display));
    if (!res?.ok) return;
    const map = {};
    lines.forEach((it, i) => (map[it.id] = res.items[i]));
    setSuggestions(map);
  }

  async function openProject() {
    const res = await window.textts?.openProject?.();
    if (res) {
      applyProject(res);
      addToast("Đã mở dự án", "success");
    }
  }

  async function chooseOutputRoot() {
    const picked = await window.textts?.pickOutputRoot?.();
    if (picked) {
      setOutputRoot(picked);
      addToast(`Đã đổi thư mục xuất sang: ${picked}`, "info");
    }
    return picked;
  }

  async function ensureOutputRoot() {
    return outputRoot || (await chooseOutputRoot());
  }

  async function openScript() {
    if (!(await ensureOutputRoot())) return;
    const res = await window.textts?.openScript?.();
    if (!res) return;
    if (res.error) {
      setLog(res.error);
      addToast("Lỗi khi mở kịch bản", "error");
      return;
    }
    applyProject(res);
    addToast("Đã nhập kịch bản mới", "success");
  }

  async function importPasted() {
    setPasteError("");
    if (!pasteText.trim()) {
      setPasteError("Chưa có nội dung kịch bản để tạo dự án.");
      return;
    }
    if (!(await ensureOutputRoot())) {
      setPasteError('Chưa chọn thư mục xuất. Bấm "Đổi…" để chọn.');
      return;
    }
    const res = await window.textts?.importText?.(pasteText);
    if (res?.error) {
      setPasteError(res.error);
      return;
    }
    setPasting(false);
    setPasteText("");
    applyProject(res);
    addToast("Tạo dự án thành công từ kịch bản dán", "success");
  }

  async function openProjectFolder() {
    if (filePath) {
      await window.textts?.openFolder?.(filePath);
    }
  }

  async function checkUpdates() {
    addToast("Đang kiểm tra cập nhật...", "info");
    const res = await window.textts?.checkForUpdates?.();
    if (res?.error) addToast(res.error, "error");
    else if (res?.message) addToast(res.message, "info");
  }

  function applyProject(res) {
    setProject(res.data);
    setFilePath(res.filePath);
    setDirty(false);
    history.current = { past: [], future: [] };
    setSelectedId(null);
    setPreviewUrl(null);
    setLog("");
    setErrorIds([]);
    setVoices(res.voices ?? []);
    setIssues(res.issues ?? []);
    setOutput(null);
    setOutputStale(false);
    refreshSuggestions(res.data);
    loadOutputFor(res.filePath);
  }

  async function save() {
    if (!projectRef.current || !filePath) return false;
    const res = await window.textts?.saveProject?.(filePath, projectRef.current);
    if (res?.ok) {
      setDirty(false);
      setIssues(res.issues ?? []);
      addToast("Đã lưu dự án", "success");
      return true;
    }
    if (res?.error) setLog((prev) => prev + `\nLỗi khi lưu dự án:\n${res.error}\n`);
    addToast(res?.error ? `Lỗi khi lưu dự án: ${res.error}` : "Lỗi khi lưu dự án", "error");
    return false;
  }

  async function loadOutputFor(projectPath, format = "mp3") {
    if (!window.textts?.loadOutput) return;
    const res = await window.textts.loadOutput(projectPath.replace(/\.json$/, `.${format}`));
    setOutput(res);
    setOutputStale(false);
  }

  function patchRole(id, patch) {
    edit((p) => ({
      ...p,
      roles: { ...p.roles, [id]: { ...p.roles[id], ...patch } },
    }));
  }

  function addRole() {
    edit((p) => {
      const keys = Object.keys(p.roles);
      const nextIdNum = keys.length ? Math.max(...keys.map((k) => Number(k) || 0)) + 1 : 1;
      const newRoleId = String(nextIdNum);
      const defaultVoice = voices[0]?.value || "ja-JP-NanamiNeural";
      return {
        ...p,
        roles: {
          ...p.roles,
          [newRoleId]: {
            name: `Vai ${newRoleId}`,
            voice: defaultVoice,
            emotion: "neutral",
            speed: "normal",
            pitch: 0,
            gain_db: 0,
          },
        },
      };
    });
    addToast("Đã thêm vai mới", "info");
  }

  function deleteRole(roleId) {
    if (Object.keys(project.roles).length <= 1) {
      addToast("Dự án phải có ít nhất một vai nhân vật", "warn");
      return;
    }
    const linesWithRole = items.filter((it) => it.type === "line" && it.role === roleId).length;
    if (linesWithRole > 0) {
      if (!window.confirm(`Vai [${roleId}] đang có ${linesWithRole} câu thoại. Bạn có chắc muốn xóa không?`)) {
        return;
      }
    }
    edit((p) => {
      const newRoles = { ...p.roles };
      delete newRoles[roleId];
      return { ...p, roles: newRoles };
    });
    addToast(`Đã xóa vai [${roleId}]`, "info");
  }

  function patchItem(id, patch) {
    edit((p) => ({
      ...p,
      items: p.items.map((it) => (it.id === id ? { ...it, ...patch } : it)),
    }));
  }

  function moveItem(id, dir) {
    edit((p) => {
      const i = p.items.findIndex((it) => it.id === id);
      const j = i + dir;
      if (i < 0 || j < 0 || j >= p.items.length) return p;
      const next = [...p.items];
      [next[i], next[j]] = [next[j], next[i]];
      return { ...p, items: next };
    });
  }

  function deleteItem(id) {
    edit((p) => ({ ...p, items: p.items.filter((it) => it.id !== id) }));
    if (selectedId === id) setSelectedId(null);
  }

  function addLine() {
    edit((p) => {
      const role = Object.keys(p.roles)[0] || "1";
      return {
        ...p,
        items: [
          ...p.items,
          {
            id: nextId(p.items),
            type: "line",
            src_line: 0,
            role,
            attrs: {},
            display: "",
            tts_text: "",
            plain: "",
          },
        ],
      };
    });
  }

  function addPause() {
    edit((p) => ({
      ...p,
      items: [...p.items, { id: nextId(p.items), type: "pause", src_line: 0, ms: 500 }],
    }));
  }

  function duplicateItem(id) {
    edit((p) => {
      const idx = p.items.findIndex((it) => it.id === id);
      if (idx < 0) return p;
      const orig = p.items[idx];
      const copy = { ...orig, id: nextId(p.items) };
      const nextItems = [...p.items];
      nextItems.splice(idx + 1, 0, copy);
      return { ...p, items: nextItems };
    });
    addToast("Đã nhân bản câu thoại", "info");
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
    const pattern = new RegExp(
      `(${words.map((w) => w.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|")})(?!\\{)`,
      "g"
    );
    edit((p) => ({
      ...p,
      items: p.items.map((it) => {
        if (it.type !== "line") return it;
        const nextDisplay = it.display.replace(pattern, (m, w) => `${w}{${dict[w]}}`);
        return nextDisplay !== it.display ? { ...it, display: nextDisplay } : it;
      }),
    }));
    addToast("Đã áp dụng từ điển cách đọc", "success");
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
    addToast("Đã thay thế tất cả", "info");
  }

  async function preview(id) {
    if (!(await save())) return;
    setBusy(true);
    setPreviewUrl(null);
    const res = await window.textts?.preview?.(filePath, id);
    setBusy(false);
    if (res?.ok) {
      setPreviewUrl(res.dataUrl);
      if (audioRef.current) {
        audioRef.current.src = res.dataUrl;
        audioRef.current.play().catch(() => {});
      }
    } else {
      setLog((prev) => prev + `\nLỗi khi nghe thử:\n${res?.error}\n`);
      addToast("Lỗi khi nghe thử câu này", "error");
    }
  }

  async function generate() {
    if (!(await save())) return;
    setBusy(true);
    setLog("");
    const format = exportOpts.format;
    const outputPath = filePath.replace(/\.json$/, `.${format}`);
    const res = await window.textts?.generate?.(filePath, outputPath, {
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
    setLog((prev) => prev + `\n${res?.code === 0 ? "Hoàn tất" : "Dừng với lỗi"} (mã thoát ${res?.code})`);

    const failed = [...(res?.log || "").matchAll(/^\s*-\s*(L\d+)\s+\(dòng/gm)].map((m) => m[1]);
    setErrorIds(failed);
    if (failed.length) {
      setTimeout(() => document.getElementById(`row-${failed[0]}`)?.scrollIntoView({ block: "center" }), 0);
      addToast("Có lỗi ở một số câu thoại", "error");
    }

    if (res?.code === 0) {
      await loadOutputFor(filePath, format);
      setOutputStale(false);
      window.textts?.worksheetExists?.(filePath).then(setHasWorksheet);
      addToast("Tạo âm thanh thành công!", "success");
      setTimelineOpen(true);
    }
    setBusy(false);
  }

  function applySuggestion(id) {
    const s = suggestions?.[id];
    if (s?.annotated) {
      patchItem(id, { display: s.annotated });
      addToast("Đã áp dụng gợi ý Furigana", "info");
    }
  }

  function shiftItem(id, offsetMs) {
    edit((p) => ({
      ...p,
      items: p.items.map((it) => (it.id === id ? { ...it, delay_ms: (it.delay_ms || 0) + offsetMs } : it)),
    }));
    addToast(`Đã dời câu [${id}] thêm +${offsetMs}ms`, "info");
  }

  const selectedItem = useMemo(() => items.find((it) => it.id === selectedId), [items, selectedId]);

  return (
    <div className="app">
      {/* Top Studio Navbar */}
      <header className="studio-navbar">
        <div className="studio-brand">
          <span className="brand-dot" />
          <span>textts Studio</span>
        </div>

        <button className="nav-btn primary" onClick={openScript} disabled={busy}>
          Mở kịch bản .txt
        </button>
        <button className="nav-btn" onClick={openProject} disabled={busy}>
          Mở dự án
        </button>
        <button className="nav-btn ghost" onClick={() => setPasting((v) => !v)} disabled={busy}>
          Dán kịch bản
        </button>

        <button
          className="nav-btn ghost"
          onClick={openProjectFolder}
          disabled={busy || !filePath}
          title="Mở thư mục chứa file dự án"
        >
          Thư mục
        </button>

        <button
          className="nav-btn ghost"
          onClick={() => setShowReadings(true)}
          disabled={busy}
          title="Mở từ điển cách đọc Kanji (readings.yaml)"
        >
          <BookOpenIcon size={14} />
          <span>Từ điển</span>
        </button>

        <button
          className="nav-btn ghost"
          onClick={() => setShowCache(true)}
          disabled={busy}
          title="Quản lý bộ nhớ đệm cache âm thanh"
        >
          Cache
        </button>

        <button
          className="nav-btn ghost"
          onClick={() => setShowAbout(true)}
          disabled={busy}
          title="Hướng dẫn sử dụng CLI, kết nối AI & Giới thiệu"
        >
          <InfoIcon size={14} />
          <span>Hướng dẫn</span>
        </button>

        <button
          className={`nav-btn ghost ${searchOpen ? "active" : ""}`}
          onClick={() => setSearchOpen((v) => !v)}
          disabled={busy || !project}
          title="Tìm kiếm & Thay thế (Ctrl+F)"
        >
          <SearchIcon size={14} />
          <span>Tìm</span>
        </button>

        <button
          className={`nav-btn ghost ${apiServer.running ? "active" : ""}`}
          onClick={toggleApiServer}
          title={apiServer.running ? "API Server đang bật trên cổng 8000. Bấm để tắt" : "Bật API Server cho AI"}
        >
          <span className={`status-dot ${apiServer.running ? "dot-green" : "dot-gray"}`} />
          <span>API {apiServer.running ? ":8000" : "Tắt"}</span>
        </button>

        {apiServer.running && (
          <button className="nav-btn ghost" onClick={openDocs} title="Mở trang tài liệu Swagger UI">
            Docs
          </button>
        )}

        <span
          className="status-pill"
          title={voicevoxOk ? "VOICEVOX Engine đang chạy (port 50021)" : "VOICEVOX Engine chưa bật"}
        >
          <span className={`status-dot ${voicevoxOk ? "dot-green" : "dot-yellow"}`} />
          <span>VOICEVOX</span>
        </span>

        <VoicevoxButton />
        <AivisButton />

        <span className="nav-spacer" />

        <button
          className="nav-btn ghost"
          onClick={undo}
          disabled={busy || !canUndo}
          title="Hoàn tác (Ctrl+Z)"
          aria-label="Hoàn tác"
        >
          <UndoIcon size={14} />
        </button>
        <button
          className="nav-btn ghost"
          onClick={redo}
          disabled={busy || !canRedo}
          title="Làm lại (Ctrl+Shift+Z)"
          aria-label="Làm lại"
        >
          <RedoIcon size={14} />
        </button>

        <button
          className="nav-btn ghost"
          onClick={save}
          disabled={busy || !project || !dirty}
          title="Lưu dự án (Ctrl+S)"
        >
          Lưu {dirty ? "●" : ""}
        </button>
      </header>

      {/* Popover Tìm kiếm & Thay thế */}
      {searchOpen && project && (
        <section className="search-bar-popover">
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
          <button className="nav-btn" onClick={replaceAll} disabled={busy || !searchText}>
            Thay thế tất cả
          </button>
          <button className="nav-btn ghost" onClick={() => setSearchOpen(false)}>
            ✕
          </button>
        </section>
      )}

      {/* Dán kịch bản Overlay */}
      {pasting && (
        <section className="paste-panel-overlay">
          <p>
            Mỗi dòng bắt đầu bằng số vai: <code>1 こんにちは</code>, <code>[2] はい</code>. Dự án mới sẽ được tạo trong
            thư mục xuất.
          </p>
          <textarea
            rows={7}
            value={pasteText}
            disabled={busy}
            placeholder="Dán kịch bản tiếng Nhật vào đây..."
            onChange={(e) => setPasteText(e.target.value)}
          />
          {pasteError && (
            <div className="preset-error" role="alert">
              {pasteError}
            </div>
          )}
          <div style={{ display: "flex", gap: 10 }}>
            <button className="nav-btn primary" onClick={importPasted} disabled={busy}>
              Tạo dự án mới
            </button>
            <button className="nav-btn ghost" onClick={() => setPasting(false)}>
              Hủy
            </button>
          </div>
        </section>
      )}

      {/* Main Workspace */}
      {!project ? (
        <main className="studio-empty-state">
          <div className="empty-brand-badge">
            <SparklesIcon size={28} />
          </div>
          <h1 className="empty-title">Chào mừng đến với textts Studio</h1>
          <p className="empty-subtitle">
            Phần mềm tạo hội thoại âm thanh tiếng Nhật chuyên nghiệp với VOICEVOX, AivisSpeech, chú âm Furigana tự động và
            xuất phiếu bài tập HTML.
          </p>
          <div className="empty-actions-row">
            <button className="nav-btn primary" onClick={openScript} disabled={busy}>
              Mở kịch bản .txt
            </button>
            <button className="nav-btn" onClick={() => setPasting(true)} disabled={busy}>
              Dán kịch bản
            </button>
            <button className="nav-btn" onClick={openProject} disabled={busy}>
              Mở dự án (project.json)
            </button>
            <button className="nav-btn ghost" onClick={() => setShowAbout(true)} disabled={busy}>
              Hướng dẫn & Kết nối AI
            </button>
          </div>
          {log && (
            <details className="log-wrap" style={{ marginTop: 24, width: "100%", maxWidth: 640 }}>
              <summary>Nhật ký hệ thống</summary>
              <pre className="log">{log}</pre>
            </details>
          )}
        </main>
      ) : (
        <div className="studio-workspace">
          {/* Cột trái: Trình soạn thảo kịch bản dạng Cards */}
          <section className="script-editor-pane">
            <div className="editor-toolbar">
              <h2>
                <span>Kịch bản hội thoại</span>
                <span className="line-counter">({lineCount} câu thoại)</span>
              </h2>
              <div className="editor-actions-group">
                <button
                  type="button"
                  className="editor-action-btn"
                  onClick={addLine}
                  disabled={busy}
                  title="Thêm câu thoại mới (Ctrl+Enter)"
                >
                  <PlusIcon size={13} />
                  <span>Câu thoại</span>
                </button>
                <button
                  type="button"
                  className="editor-action-btn"
                  onClick={addPause}
                  disabled={busy}
                  title="Thêm khoảng nghỉ giữa các câu"
                >
                  <ClockIcon size={13} />
                  <span>Khoảng nghỉ</span>
                </button>
                <button
                  type="button"
                  className="editor-action-btn"
                  onClick={addSfx}
                  disabled={busy}
                  title="Chèn hiệu ứng âm thanh SFX"
                >
                  <MusicIcon size={13} />
                  <span>Hiệu ứng SFX</span>
                </button>
              </div>
            </div>

            <div className="script-scroll-area">
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
            </div>

            {/* Chi tiết nhật ký log có thể gập mở */}
            <details className="log-wrap" open={logHasError}>
              <summary>Nhật ký xử lý{log ? ` (${log.trim().split("\n").length} dòng)` : ""}</summary>
              <pre className="log">{log}</pre>
            </details>
          </section>

          {/* Cột phải: Studio Inspector (3 Tab: Nhân vật, Mixer, Chi tiết) */}
          <Inspector
            roles={project.roles}
            selectedItem={selectedItem}
            onChangeRole={patchRole}
            onAddRole={addRole}
            onDeleteRole={deleteRole}
            onPatchSelectedItem={(patch) => selectedId && patchItem(selectedId, patch)}
            disabled={busy}
            voices={voices}
            recorder={(id) => <Recorder projectPath={filePath} roleId={id} disabled={busy} />}
            library={library}
            output={output}
          />
        </div>
      )}

      {/* Master Audio Element dùng chung */}
      <audio
        ref={audioRef}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onSeeked={(e) => setCurrentTime(e.currentTarget.currentTime)}
        style={{ display: "none" }}
      />

      {/* Bottom DAW Dock: Timeline + Transport Bar */}
      <div className="studio-bottom-dock">
        {output && timelineOpen && (
          <Timeline
            output={output}
            onShift={shiftItem}
            selectedId={selectedId}
            disabled={busy}
            currentTime={currentTime}
            onSeek={seek}
            playbackRate={playbackRate}
            onChangeRate={changePlaybackRate}
          />
        )}

        <TransportBar
          isPlaying={isPlaying}
          currentTime={currentTime}
          duration={audioDuration}
          onTogglePlay={togglePlay}
          onSeek={seek}
          onGenerate={generate}
          onOpenExport={() => setShowExport(true)}
          onOpenOutputFolder={openProjectFolder}
          onChooseOutputRoot={chooseOutputRoot}
          outputRoot={outputRoot}
          busy={busy}
          lineCount={lineCount}
          outputStale={outputStale}
          timelineOpen={timelineOpen}
          onToggleTimeline={() => setTimelineOpen((v) => !v)}
          lastLogLine={lastLogLine}
        />
      </div>

      {/* Modals & Dialogs */}
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
            addToast("Đã lưu từ điển cách đọc", "success");
          }}
          onApplyToProject={applyReadingsToProject}
          disabled={busy}
          onClose={() => setShowReadings(false)}
        />
      )}

      {showCache && <CacheManagerDialog disabled={busy} onClose={() => setShowCache(false)} />}

      {showAbout && (
        <AboutDialog
          onClose={() => setShowAbout(false)}
          docsUrl={apiServer.docsUrl}
          apiRunning={apiServer.running}
          onToggleApi={toggleApiServer}
        />
      )}

      {/* Floating Toast Stack */}
      <ToastContainer toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}
