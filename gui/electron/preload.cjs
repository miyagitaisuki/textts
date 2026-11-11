// Cầu nối an toàn: renderer chỉ gọi các hàm được liệt kê ở đây.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("textts", {
  openProject: () => ipcRenderer.invoke("project:open"),
  openScript: () => ipcRenderer.invoke("script:open"),
  importText: (text) => ipcRenderer.invoke("script:importText", { text }),
  openManyScripts: () => ipcRenderer.invoke("script:openMany"),
  getOutputRoot: () => ipcRenderer.invoke("outputRoot:get"),
  pickOutputRoot: () => ipcRenderer.invoke("outputRoot:pick"),
  checkForUpdates: () => ipcRenderer.invoke("update:check"),
  openFolder: (projectPath) => ipcRenderer.invoke("folder:open", { projectPath }),
  listVoices: (engine) => ipcRenderer.invoke("voices:list", { engine }),
  getVoiceBank: (engine) => ipcRenderer.invoke("voicebank:get", { engine }),
  setVoiceBank: (entry) => ipcRenderer.invoke("voicebank:set", entry),
  loadPresets: () => ipcRenderer.invoke("presets:load"),
  savePresets: (presets) => ipcRenderer.invoke("presets:save", { presets }),
  lint: (projectPath) => ipcRenderer.invoke("lint:check", { projectPath }),
  saveRecording: (projectPath, roleId, base64) =>
    ipcRenderer.invoke("recording:save", { projectPath, roleId, base64 }),
  saveProject: (filePath, data) => ipcRenderer.invoke("project:save", { filePath, data }),
  generate: (projectPath, outputName, format, options) =>
    ipcRenderer.invoke("tts:generate", { projectPath, outputName, format, options }),
  checkPronunciation: (projectPath, level) => ipcRenderer.invoke("tts:check", { projectPath, level }),
  previewAll: (projectPath, data, options) => ipcRenderer.invoke("tts:previewAll", { projectPath, data, options }),
  preview: (projectPath, lineId) => ipcRenderer.invoke("tts:preview", { projectPath, lineId }),
  sampleVoice: (opts) => ipcRenderer.invoke("voice:sample", opts),
  getMcpConfig: () => ipcRenderer.invoke("mcp:config"),
  suggestReadings: (texts) => ipcRenderer.invoke("reading:suggest", { texts }),
  loadOutput: (audioPath) => ipcRenderer.invoke("output:load", { audioPath }),
  locateOutput: (projectPath, outputName, format) =>
    ipcRenderer.invoke("output:locate", { projectPath, outputName, format }),
  pickAudioFile: () => ipcRenderer.invoke("file:pickAudio"),
  listSounds: () => ipcRenderer.invoke("soundlib:list"),
  downloadSounds: (ids) => ipcRenderer.invoke("soundlib:download", { ids }),
  importSounds: (kind, opts = {}) => ipcRenderer.invoke("soundlib:import", { kind, ...opts }),
  describeSound: (meta) => ipcRenderer.invoke("soundlib:describe", meta),
  openSoundFolder: () => ipcRenderer.invoke("soundlib:openFolder"),
  removeSound: (file) => ipcRenderer.invoke("soundlib:remove", { file }),
  readSound: (file) => ipcRenderer.invoke("soundlib:read", { file }),
  openWorksheet: (audioPath) => ipcRenderer.invoke("worksheet:open", { audioPath }),
  worksheetExists: (audioPath) => ipcRenderer.invoke("worksheet:exists", { audioPath }),
  loadReadings: (projectPath) => ipcRenderer.invoke("readings:load", { projectPath }),
  saveReadings: (projectPath, readings) => ipcRenderer.invoke("readings:save", { projectPath, readings }),
  getCacheInfo: () => ipcRenderer.invoke("cache:info"),
  clearCache: () => ipcRenderer.invoke("cache:clear"),
  getApiServerStatus: () => ipcRenderer.invoke("apiServer:status"),
  toggleApiServer: () => ipcRenderer.invoke("apiServer:toggle"),
  getVoicevoxStatus: () => ipcRenderer.invoke("voicevox:status"),
  installVoicevox: () => ipcRenderer.invoke("voicevox:install"),
  startVoicevox: () => ipcRenderer.invoke("voicevox:start"),
  getAivisStatus: () => ipcRenderer.invoke("aivis:status"),
  installAivis: () => ipcRenderer.invoke("aivis:install"),
  startAivis: () => ipcRenderer.invoke("aivis:start"),
  openExternalUrl: (url) => ipcRenderer.invoke("url:openExternal", { url }),
  onLog: (callback) => {
    const listener = (_evt, text) => callback(text);
    ipcRenderer.on("tts:log", listener);
    return () => ipcRenderer.removeListener("tts:log", listener);
  },
  onShowAbout: (callback) => {
    const listener = () => callback();
    ipcRenderer.on("app:showAbout", listener);
    return () => ipcRenderer.removeListener("app:showAbout", listener);
  },
});
