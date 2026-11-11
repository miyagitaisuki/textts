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
import SoundLibraryDialog from "./components/SoundLibraryDialog.jsx";
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
  SlidersIcon,
  FileTextIcon,
  FolderIcon,
  ClipboardIcon,
  SaveIcon,
  ServerIcon,
  ExternalLinkIcon,
  RefreshIcon,
  CopyIcon,
} from "./components/Icons.jsx";
import Ribbon, { RibbonButton, RibbonGroup } from "./components/Ribbon.jsx";
import { applyMemory, fillMissingVoices, loadMemory, rememberProject, saveMemory } from "./lib/voiceMemory.js";

const ENGINE_LABELS = { edge: "Edge TTS", voicevox: "VOICEVOX", aivis: "AivisSpeech" };
// "Xuất tất cả": bản chính + phụ đề + bản chậm + phiếu học tập + từng câu riêng.
const EXPORT_ALL = { srt: true, slow: true, worksheet: true, exportLines: true };
const SHORTCUTS = [
  ["Alt + ↑ / ↓", "Chọn câu trước / sau"],
  ["F5", "Nghe thử câu đang chọn"],
  ["Space / Ctrl + Space", "Phát / dừng bản đã xuất"],
  ["Ctrl + G", "Tạo âm thanh"],
  ["Ctrl + Shift + G", "Xuất tất cả"],
  ["Ctrl + Enter", "Thêm câu thoại"],
  ["Ctrl + S", "Lưu"],
  ["Ctrl + Z / Ctrl + Y", "Hoàn tác / Làm lại"],
  ["Ctrl + F", "Tìm & thay"],
];

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
  // Đường dẫn file âm thanh đã lưu gần nhất ("" nếu đang nghe bản thử hoặc chưa xuất).
  const [outputPath, setOutputPath] = useState("");
  const [errorIds, setErrorIds] = useState([]);
  const [voices, setVoices] = useState([]);
  const [issues, setIssues] = useState([]);
  const [exportOpts, setExportOpts] = useState(() => loadSettings(window.localStorage));
  const [presets, setPresets] = useState([]);
  const [pasting, setPasting] = useState(false);
  const [pasteText, setPasteText] = useState("");
  const [pasteError, setPasteError] = useState("");
  const memoryRef = useRef(loadMemory(window.localStorage));
  // Nghe thử giọng của vai: mã vai đang đọc mẫu và trình phát riêng (không đụng bản đã xuất).
  const [samplingId, setSamplingId] = useState(null);
  const sampleAudioRef = useRef(null);
  const sampleReqRef = useRef(0); // tăng mỗi lần bấm/dừng: kết quả đến muộn của lần trước bị bỏ qua
  const [pasteEngine, setPasteEngine] = useState(() => memoryRef.current.engine || "edge");
  // Dự án vừa nạp từ đĩa: không ghi nhớ giọng cho tới khi người dùng sửa.
  const loadedRef = useRef(null);
  const [showExport, setShowExport] = useState(false);
  const [showReadings, setShowReadings] = useState(false);
  const [showCache, setShowCache] = useState(false);
  const [showAbout, setShowAbout] = useState(false);
  // Hộp thoại ngân hàng âm thanh đang mở: { kind: "sfx" | "bgm", resolve(path) }
  const [soundPicker, setSoundPicker] = useState(null);
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
      if (e.code === "Space" && !e.ctrlKey && !e.metaKey) {
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

  // Tải lại danh sách giọng khi mở dự án, đổi engine (kể cả hoàn tác) hoặc VOICEVOX vừa bật.
  const projectEngine = project?.engine || "edge";
  useEffect(() => {
    if (filePath) loadVoices(projectEngine);
  }, [filePath, projectEngine, voicevoxOk]);

  // Ghi nhớ engine và giọng mỗi khi người dùng đổi cấu hình vai, để lần nhập kịch bản sau tự gán lại.
  useEffect(() => {
    if (!project || project === loadedRef.current) return;
    memoryRef.current = rememberProject(memoryRef.current, project);
    saveMemory(window.localStorage, memoryRef.current);
  }, [project?.roles, project?.engine]);

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
      const key = e.key.toLowerCase();
      const typing = ["INPUT", "TEXTAREA", "SELECT"].includes(e.target?.tagName);
      if (e.altKey && !mod && (e.key === "ArrowUp" || e.key === "ArrowDown")) {
        e.preventDefault();
        selectAdjacentLine(e.key === "ArrowUp" ? -1 : 1);
        return;
      }
      if (e.key === "F5") {
        e.preventDefault();
        if (selectedLineId()) preview(selectedLineId());
        else addToast("Chọn một câu thoại để nghe thử (Alt + ↑/↓)", "info");
        return;
      }
      if (!mod) return;
      if (key === " " || e.code === "Space") {
        e.preventDefault();
        togglePlay();
      } else if (key === "g") {
        e.preventDefault();
        if (e.shiftKey) exportAll();
        else generate();
      } else if (key === "s") {
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

  function selectedLineId() {
    const it = projectRef.current?.items.find((x) => x.id === selectedId);
    return it?.type === "line" ? it.id : null;
  }

  // Chọn câu thoại trước/sau câu đang chọn và cuộn tới đó.
  function selectAdjacentLine(step) {
    const lines = (projectRef.current?.items ?? []).filter((it) => it.type === "line");
    if (!lines.length) return;
    const idx = lines.findIndex((it) => it.id === selectedId);
    const next = idx < 0 ? (step > 0 ? 0 : lines.length - 1) : Math.min(lines.length - 1, Math.max(0, idx + step));
    const id = lines[next].id;
    setSelectedId(id);
    setTimeout(() => document.getElementById(`row-${id}`)?.scrollIntoView({ block: "nearest" }), 0);
  }

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
    const prepared = await prepareImport(res);
    applyProject(prepared);
    addToast(importMessage("Đã nhập kịch bản mới", prepared), "success");
  }

  // Dự án vừa tạo từ kịch bản: dùng engine và giọng đã nhớ cho từng nhân vật, rồi ghi lại file.
  // engineChoice: engine người dùng chọn lúc nhập (mặc định engine dùng lần trước).
  async function prepareImport(res, engineChoice) {
    let engine = engineChoice || memoryRef.current.engine || "edge";
    let fallback = "";
    let values = [];
    if (engine !== "edge") {
      values = ((await window.textts?.listVoices?.(engine)) ?? []).map((v) => v.value);
      if (!values.length) {
        fallback = `${ENGINE_LABELS[engine] ?? engine} chưa bật nên tạm dùng Edge TTS`;
        engine = "edge";
      }
    }
    const { project, applied } = applyMemory(res.data, memoryRef.current, engine);
    const data = engine === "edge" ? project : fillMissingVoices(project, values);
    if (JSON.stringify(data) !== JSON.stringify(res.data)) {
      await window.textts?.saveProject?.(res.filePath, data);
    }
    return { ...res, data, applied, fallback };
  }

  function importMessage(prefix, prepared) {
    const parts = [prefix];
    if (prepared.applied?.length) parts.push(`đã gán giọng đã nhớ cho ${prepared.applied.length} vai`);
    if (prepared.fallback) parts.push(prepared.fallback);
    return parts.join(" · ");
  }

  // Xử lý hàng loạt: chọn nhiều kịch bản .txt, mỗi file thành một dự án và xuất âm thanh theo tùy chọn đã lưu.
  async function batchExport() {
    if (!(await ensureOutputRoot())) return;
    const results = await window.textts?.openManyScripts?.();
    if (!results?.length) return;
    setBusy(true);
    setLog(`Xử lý hàng loạt ${results.length} kịch bản\n`);
    const done = [];
    const failed = [];
    let last = null;
    for (const [i, r] of results.entries()) {
      setLog((prev) => prev + `\n[${i + 1}/${results.length}] ${r.script}: `);
      if (r.error) {
        failed.push(r.script);
        setLog((prev) => prev + `lỗi phân tích kịch bản: ${r.error}`);
        continue;
      }
      const prepared = await prepareImport(r);
      const res = await window.textts?.generate?.(r.filePath, "", exportOpts.format, generateOptions());
      if (res?.code === 0) {
        done.push(r.script);
        last = prepared;
        setLog((prev) => prev + `xong → ${res.outputPath}`);
      } else {
        failed.push(r.script);
        setLog((prev) => prev + `lỗi (mã ${res?.code})\n${(res?.log || "").trim().split("\n").slice(-5).join("\n")}`);
      }
    }
    setBusy(false);
    if (last) {
      applyProject(last);
      loadOutputFor(last.filePath, exportOpts.format);
    }
    addToast(
      `Hàng loạt: xong ${done.length}/${results.length} kịch bản${failed.length ? `, lỗi: ${failed.join(", ")}` : ""}`,
      failed.length ? "error" : "success",
    );
  }

  async function importPasted(andGenerate = false) {
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
    const prepared = await prepareImport(res, pasteEngine);
    applyProject(prepared);
    addToast(importMessage("Tạo dự án thành công từ kịch bản dán", prepared), "success");
    if (andGenerate === true) await generate(prepared.filePath);
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
    loadedRef.current = res.data;
    setProject(res.data);
    setFilePath(res.filePath);
    setDirty(false);
    history.current = { past: [], future: [] };
    setSelectedId(null);
    setPreviewUrl(null);
    setLog("");
    setErrorIds([]);
    setVoices([]);
    setIssues(res.issues ?? []);
    setOutput(null);
    setOutputStale(false);
    refreshSuggestions(res.data);
    loadOutputFor(res.filePath, exportOpts.format, res.data?.output_name || "");
  }

  // Lấy danh sách giọng của engine (Edge/VOICEVOX/AivisSpeech) qua tts.py --list-voices.
  async function loadVoices(engine) {
    const list = (await window.textts?.listVoices?.(engine || "edge")) ?? [];
    // Bỏ qua kết quả trễ nếu người dùng đã đổi sang engine khác trong lúc chờ.
    if ((projectRef.current?.engine || "edge") === (engine || "edge")) setVoices(list);
    return list;
  }

  function stopSample() {
    sampleReqRef.current += 1;
    sampleAudioRef.current?.pause();
    sampleAudioRef.current = null;
    setSamplingId(null);
  }

  // Đọc một câu mẫu ngắn bằng giọng, cảm xúc, tốc độ và cao độ hiện tại của vai để chọn nhanh giọng.
  async function sampleVoice(roleId) {
    if (samplingId === roleId) return stopSample();
    const proj = projectRef.current;
    const role = proj?.roles?.[roleId];
    if (!role) return;
    stopSample();
    const reqId = sampleReqRef.current;
    setSamplingId(roleId);
    const engine = proj.engine || "edge";
    const res = await window.textts?.sampleVoice?.({
      engine,
      voice: String(role.voice),
      emotion: role.emotion,
      speed: role.speed,
      pitch: role.pitch,
    });
    if (reqId !== sampleReqRef.current) return; // đã dừng hoặc chuyển sang vai khác trong lúc chờ
    if (!res?.ok) {
      setSamplingId(null);
      addToast(`Không nghe thử được giọng (${ENGINE_LABELS[engine] ?? engine}): ${res?.error ?? "lỗi không rõ"}`, "error");
      return;
    }
    const audio = new Audio(res.dataUrl);
    sampleAudioRef.current = audio;
    audio.onended = () => {
      if (sampleAudioRef.current === audio) stopSample();
    };
    audio.play().catch(() => stopSample());
  }

  // Đổi engine của dự án; giọng của vai không có trong engine mới được gán lần lượt theo danh sách giọng mới.
  async function changeEngine(engine) {
    if (!projectRef.current || (projectRef.current.engine || "edge") === engine) return;
    const list = (await window.textts?.listVoices?.(engine)) ?? [];
    if (engine !== "edge" && !list.length) {
      const name = engine === "voicevox" ? "VOICEVOX" : "AivisSpeech";
      addToast(`Không lấy được danh sách giọng của ${name}. Hãy bật ${name} trước.`, "error");
      return;
    }
    const values = list.map((v) => v.value);
    // Giọng đã nhớ cho engine này được dùng trước; vai còn lại nhận giọng có trong engine.
    edit((p) => fillMissingVoices(applyMemory(p, memoryRef.current, engine).project, values));
    setVoices(list);
    addToast(`Đã chuyển sang ${ENGINE_LABELS[engine] ?? engine}`, "success");
  }

  // targetPath: đường dẫn dự án (mặc định dự án đang mở). Khi gọi từ onClick, tham số là sự kiện nên bỏ qua.
  async function save(targetPath) {
    const path = typeof targetPath === "string" ? targetPath : filePath;
    if (!projectRef.current || !path) return false;
    const res = await window.textts?.saveProject?.(path, projectRef.current);
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

  // Nạp bản âm thanh đã lưu của dự án (thư mục riêng theo tên file) để phát và vẽ timeline.
  async function loadOutputFor(projectPath, format = "mp3", outputName = "") {
    if (!window.textts?.loadOutput) return;
    const audio = window.textts.locateOutput
      ? await window.textts.locateOutput(projectPath, outputName, format)
      : projectPath.replace(/\.json$/, `.${format}`);
    await loadSavedOutput(audio);
  }

  async function loadSavedOutput(audio) {
    const res = audio ? await window.textts.loadOutput(audio) : null;
    setOutput(res);
    setOutputPath(res ? audio : "");
    setOutputStale(false);
    setHasWorksheet(Boolean(res) && Boolean(await window.textts?.worksheetExists?.(audio)));
  }

  function setOutputName(name) {
    edit((p) => ({ ...p, output_name: name }));
  }

  // Nghe thử toàn bài từ dữ liệu đang sửa: không lưu dự án, không ghi file âm thanh nào.
  async function previewAll() {
    if (!projectRef.current || !filePath || !window.textts?.previewAll) return;
    setBusy(true);
    setLog("Nghe thử toàn bài (không lưu file)\n");
    const res = await window.textts.previewAll(filePath, projectRef.current, generateOptions());
    setBusy(false);
    if (!res?.ok) {
      setLog((prev) => prev + `\n${res?.error || "Không tạo được bản nghe thử"}`);
      addToast(res?.error || "Không tạo được bản nghe thử", "error");
      return;
    }
    setOutput({ timeline: res.timeline, dataUrl: res.dataUrl });
    setOutputPath("");
    setOutputStale(false);
    setTimelineOpen(true);
    setTimeout(() => audioRef.current?.play().catch(() => {}), 0);
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

  // Mở ngân hàng âm thanh, trả về đường dẫn file được chọn ("" nếu đóng hộp thoại).
  function pickFromSoundLibrary(kind) {
    if (!window.textts?.listSounds) return window.textts?.pickAudioFile?.() ?? Promise.resolve("");
    return new Promise((resolve) => setSoundPicker({ kind, resolve }));
  }

  async function addSfx() {
    let chosenPath = "";
    if (window.textts) {
      chosenPath = await pickFromSoundLibrary("sfx");
      if (!chosenPath) return;
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

  // Tham số cho tts:generate từ tùy chọn xuất đã lưu (+ ghi đè, ví dụ "Xuất tất cả").
  function generateOptions(overrides = {}) {
    const o = { ...exportOpts, ...overrides };
    return {
      lufs: o.lufs,
      slow: o.slow,
      srt: o.srt,
      rolePlay: o.rolePlay,
      shadow: o.shadow,
      shadowGap: o.shadowGap,
      exportLines: o.exportLines,
      worksheet: o.worksheet,
      bgmPath: o.bgmPath,
      bgmDb: o.bgmDb,
    };
  }

  // targetPath: dự án cần xuất (mặc định dự án đang mở); overrides: ghi đè tùy chọn xuất.
  async function generate(targetPath, overrides = {}) {
    const projPath = typeof targetPath === "string" ? targetPath : filePath;
    if (!(await save(projPath))) return false;
    setBusy(true);
    setLog("");
    const format = exportOpts.format;
    const outputName = projPath === filePath ? projectRef.current?.output_name || "" : "";
    const res = await window.textts?.generate?.(projPath, outputName, format, generateOptions(overrides));
    setLog((prev) => prev + `\n${res?.code === 0 ? "Hoàn tất" : "Dừng với lỗi"} (mã thoát ${res?.code})`);

    const failed = [...(res?.log || "").matchAll(/^\s*-\s*(L\d+)\s+\(dòng/gm)].map((m) => m[1]);
    setErrorIds(failed);
    if (failed.length) {
      setTimeout(() => document.getElementById(`row-${failed[0]}`)?.scrollIntoView({ block: "center" }), 0);
      addToast("Có lỗi ở một số câu thoại", "error");
    }

    if (res?.code === 0) {
      await loadSavedOutput(res.outputPath);
      addToast(`Đã lưu: ${res.outputPath}`, "success");
      setTimelineOpen(true);
    }
    setBusy(false);
    return res?.code === 0;
  }

  function exportAll() {
    return generate(undefined, EXPORT_ALL);
  }

  // Áp toàn bộ gợi ý furigana cho mọi câu còn chữ Hán chưa chú âm (một lần hoàn tác được).
  function applyAllSuggestions() {
    const cur = projectRef.current;
    if (!cur) return;
    const changed = cur.items.filter(
      (it) => it.type === "line" && suggestions?.[it.id]?.annotated && suggestions[it.id].annotated !== it.display,
    );
    if (!changed.length) {
      addToast("Không còn chữ Hán nào cần chú âm", "info");
      return;
    }
    const ids = new Set(changed.map((it) => it.id));
    const next = {
      ...cur,
      items: cur.items.map((it) => (ids.has(it.id) ? { ...it, display: suggestions[it.id].annotated } : it)),
    };
    edit(() => next);
    refreshSuggestions(next);
    addToast(`Đã chú âm ${changed.length} câu. Hãy rà lại chỗ đọc đặc biệt (tên riêng, từ nhiều cách đọc).`, "success");
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
      {/* Ribbon kiểu Word: các chức năng gom theo tab */}
      <Ribbon
        brand={
          <div className="studio-brand">
            <span className="brand-dot" />
            <span>textts Studio</span>
          </div>
        }
        quickAccess={
          <>
            <button
              type="button"
              className="qat-btn"
              onClick={save}
              disabled={busy || !project || !dirty}
              title="Lưu dự án (Ctrl+S)"
              aria-label="Lưu"
            >
              <SaveIcon size={14} />
              {dirty && <span className="qat-dirty" />}
            </button>
            <button type="button" className="qat-btn" onClick={undo} disabled={busy || !canUndo}
              title="Hoàn tác (Ctrl+Z)" aria-label="Hoàn tác">
              <UndoIcon size={14} />
            </button>
            <button type="button" className="qat-btn" onClick={redo} disabled={busy || !canRedo}
              title="Làm lại (Ctrl+Shift+Z)" aria-label="Làm lại">
              <RedoIcon size={14} />
            </button>
          </>
        }
        status={
          <span
            className="status-pill"
            title={voicevoxOk ? "VOICEVOX Engine đang chạy (port 50021)" : "VOICEVOX Engine chưa bật"}
          >
            <span className={`status-dot ${voicevoxOk ? "dot-green" : "dot-yellow"}`} />
            <span>VOICEVOX</span>
          </span>
        }
        tabs={[
          {
            id: "home",
            label: "Trang chủ",
            content: (
              <>
                <RibbonGroup label="Dự án">
                  <RibbonButton highlight icon={<ClipboardIcon size={20} />} label="Tạo kịch bản mới"
                    title="Nhập hoặc dán kịch bản để tạo dự án mới"
                    active={pasting} onClick={() => setPasting((v) => !v)} disabled={busy} />
                  <RibbonButton icon={<FileTextIcon size={20} />} label="Mở kịch bản .txt"
                    onClick={openScript} disabled={busy} />
                  <RibbonButton icon={<FolderIcon size={20} />} label="Mở dự án" onClick={openProject} disabled={busy} />
                  <div className="ribbon-stack">
                    <RibbonButton size="small" icon={<SaveIcon size={14} />} label={dirty ? "Lưu ●" : "Lưu"}
                      title="Lưu dự án (Ctrl+S)" onClick={save} disabled={busy || !project || !dirty} />
                    <RibbonButton size="small" icon={<FolderIcon size={14} />} label="Mở thư mục"
                      title="Mở thư mục chứa file dự án" onClick={openProjectFolder} disabled={busy || !filePath} />
                  </div>
                  <RibbonButton icon={<CopyIcon size={20} />} label="Hàng loạt"
                    title="Chọn nhiều kịch bản .txt: mỗi file thành một dự án và được xuất âm thanh theo tùy chọn đã lưu"
                    onClick={batchExport} disabled={busy} />
                </RibbonGroup>
                <RibbonGroup label="Chèn">
                  <RibbonButton icon={<PlusIcon size={20} />} label="Câu thoại" title="Thêm câu thoại mới (Ctrl+Enter)"
                    onClick={addLine} disabled={busy || !project} />
                  <RibbonButton icon={<ClockIcon size={20} />} label="Khoảng nghỉ" title="Thêm khoảng nghỉ giữa các câu"
                    onClick={addPause} disabled={busy || !project} />
                  <RibbonButton icon={<MusicIcon size={20} />} label="Hiệu ứng SFX" title="Chèn hiệu ứng âm thanh SFX"
                    onClick={addSfx} disabled={busy || !project} />
                </RibbonGroup>
                <RibbonGroup label="Chỉnh sửa">
                  <RibbonButton icon={<SearchIcon size={20} />} label="Tìm & thay" title="Tìm kiếm & Thay thế (Ctrl+F)"
                    active={searchOpen} onClick={() => setSearchOpen((v) => !v)} disabled={busy || !project} />
                  <RibbonButton icon={<BookOpenIcon size={20} />} label="Tự chú âm"
                    title="Thêm furigana gợi ý cho mọi chữ Hán chưa chú âm trong kịch bản (hoàn tác được)"
                    onClick={applyAllSuggestions} disabled={busy || !project} />
                  <div className="ribbon-stack">
                    <RibbonButton size="small" icon={<UndoIcon size={14} />} label="Hoàn tác" title="Hoàn tác (Ctrl+Z)"
                      onClick={undo} disabled={busy || !canUndo} />
                    <RibbonButton size="small" icon={<RedoIcon size={14} />} label="Làm lại" title="Làm lại (Ctrl+Shift+Z)"
                      onClick={redo} disabled={busy || !canRedo} />
                  </div>
                </RibbonGroup>
                <RibbonGroup label="Âm thanh">
                  <RibbonButton icon={<PlayIcon size={20} />} label="Nghe thử toàn bài"
                    title="Nghe thử toàn bài với thay đổi hiện tại, không ghi file nào" onClick={previewAll} disabled={busy || !project} />
                  <RibbonButton primary icon={<SparklesIcon size={20} />} label="Tạo & lưu"
                    title="Tạo và lưu âm thanh vào thư mục riêng mang tên file (Ctrl+G)" onClick={generate} disabled={busy || !project} />
                  <RibbonButton icon={<HardDriveIcon size={20} />} label="Xuất tất cả"
                    title="Xuất một lần: âm thanh + phụ đề SRT + bản chậm 0.8× + phiếu học tập + từng câu riêng (Ctrl+Shift+G)"
                    onClick={exportAll} disabled={busy || !project} />
                  <RibbonButton icon={<SlidersIcon size={20} />} label="Tùy chọn xuất"
                    title="Tùy chọn xuất file (SRT, MP3, Chậm 0.8x, Phiếu học tập)"
                    onClick={() => setShowExport(true)} disabled={busy || !project} />
                </RibbonGroup>
              </>
            ),
          },
          {
            id: "engine",
            label: "Engine giọng",
            content: (
              <>
                <RibbonGroup label="VOICEVOX">
                  <span
                    className="status-pill"
                    title={voicevoxOk ? "VOICEVOX Engine đang chạy (port 50021)" : "VOICEVOX Engine chưa bật"}
                  >
                    <span className={`status-dot ${voicevoxOk ? "dot-green" : "dot-yellow"}`} />
                    <span>{voicevoxOk ? "Đang chạy" : "Chưa bật"}</span>
                  </span>
                  <VoicevoxButton />
                </RibbonGroup>
                <RibbonGroup label="AivisSpeech">
                  <AivisButton />
                </RibbonGroup>
                <RibbonGroup label="Kết nối AI">
                  <RibbonButton icon={<ServerIcon size={20} />} active={apiServer.running}
                    label={apiServer.running ? "API :8000" : "Bật API"}
                    title={apiServer.running ? "API Server đang bật trên cổng 8000. Bấm để tắt" : "Bật API Server cho AI"}
                    onClick={toggleApiServer} />
                  <RibbonButton icon={<ExternalLinkIcon size={20} />} label="Tài liệu API"
                    title="Mở trang tài liệu Swagger UI" onClick={openDocs} disabled={!apiServer.running} />
                </RibbonGroup>
              </>
            ),
          },
          {
            id: "tools",
            label: "Công cụ",
            content: (
              <>
                <RibbonGroup label="Cách đọc">
                  <RibbonButton icon={<BookOpenIcon size={20} />} label="Từ điển"
                    title="Mở từ điển cách đọc Kanji (readings.yaml)" onClick={() => setShowReadings(true)} disabled={busy} />
                </RibbonGroup>
                <RibbonGroup label="Bộ nhớ đệm">
                  <RibbonButton icon={<HardDriveIcon size={20} />} label="Cache"
                    title="Quản lý bộ nhớ đệm cache âm thanh" onClick={() => setShowCache(true)} disabled={busy} />
                </RibbonGroup>
              </>
            ),
          },
          {
            id: "help",
            label: "Trợ giúp",
            content: (
              <RibbonGroup label="Trợ giúp">
                <RibbonButton icon={<InfoIcon size={20} />} label="Hướng dẫn"
                  title="Hướng dẫn sử dụng CLI, kết nối AI & Giới thiệu" onClick={() => setShowAbout(true)} />
                <RibbonButton icon={<RefreshIcon size={20} />} label="Kiểm tra cập nhật" onClick={checkUpdates} />
              </RibbonGroup>
            ),
          },
          {
            id: "keys",
            label: "Phím tắt",
            content: (
              <RibbonGroup label="Phím tắt">
                <dl className="shortcut-list">
                  {SHORTCUTS.map(([k, d]) => (
                    <div key={k}>
                      <dt><kbd>{k}</kbd></dt>
                      <dd>{d}</dd>
                    </div>
                  ))}
                </dl>
              </RibbonGroup>
            ),
          },
        ]}
      />

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

      {/* Tạo kịch bản mới (nhập/dán kịch bản) */}
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
            placeholder="Nhập hoặc dán kịch bản tiếng Nhật vào đây..."
            onChange={(e) => setPasteText(e.target.value)}
          />
          {pasteError && (
            <div className="preset-error" role="alert">
              {pasteError}
            </div>
          )}
          <div className="paste-actions">
            <label className="paste-engine">
              Engine đọc
              <select value={pasteEngine} disabled={busy} onChange={(e) => setPasteEngine(e.target.value)}>
                {Object.entries(ENGINE_LABELS).map(([v, l]) => (
                  <option key={v} value={v}>{l}</option>
                ))}
              </select>
            </label>
            <span className="muted paste-note">Giọng của từng nhân vật dùng lại lựa chọn lần trước.</span>
            <span className="nav-spacer" />
            <button className="nav-btn" onClick={() => importPasted(false)} disabled={busy}>
              Tạo dự án
            </button>
            <button
              className="nav-btn primary"
              onClick={() => importPasted(true)}
              disabled={busy}
              title="Tạo dự án rồi xuất âm thanh ngay theo tùy chọn xuất đã lưu"
            >
              Tạo dự án & xuất âm thanh
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
            <button className="nav-btn primary" onClick={() => setPasting(true)} disabled={busy}>
              Tạo kịch bản mới
            </button>
            <button className="nav-btn" onClick={openScript} disabled={busy}>
              Mở kịch bản .txt
            </button>
            <button className="nav-btn" onClick={openProject} disabled={busy}>
              Mở dự án (project.json)
            </button>
            <button className="nav-btn ghost" onClick={() => setShowAbout(true)} disabled={busy}>
              Hướng dẫn & Kết nối AI
            </button>
          </div>
          <p className="empty-author">
            Tác giả: ThS. Nguyễn Thanh Quang — Giảng viên chuyên ngành Nhật Bản học, Trường Đại học Quy Nhơn
          </p>
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
            engine={project.engine || "edge"}
            onChangeEngine={changeEngine}
            onSampleVoice={sampleVoice}
            sampling={samplingId}
            timing={project.timing}
            onChangeTiming={(timing) => edit((p) => ({ ...p, timing }))}
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
          onPreviewAll={previewAll}
          outputName={project?.output_name || ""}
          defaultOutputName={filePath ? filePath.split(/[\\/]/).pop().replace(/\.json$/, "") : ""}
          onOutputNameChange={setOutputName}
          isPreview={Boolean(output) && !outputPath}
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
          onPickAudio={() => pickFromSoundLibrary("bgm")}
          onOpenWorksheet={() => outputPath && window.textts?.openWorksheet?.(outputPath)}
          hasWorksheet={hasWorksheet}
          disabled={busy}
          onClose={() => setShowExport(false)}
        />
      )}

      {soundPicker && (
        <SoundLibraryDialog
          kind={soundPicker.kind}
          onPick={(file) => {
            soundPicker.resolve(file);
            soundPicker.resolve = () => {};
          }}
          onClose={() => {
            soundPicker.resolve("");
            setSoundPicker(null);
          }}
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
