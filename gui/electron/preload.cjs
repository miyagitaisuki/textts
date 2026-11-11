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
  loadPresets: () => ipcRenderer.invoke("presets:load"),
  savePresets: (presets) => ipcRenderer.invoke("presets:save", { presets }),
  lint: (projectPath) => ipcRenderer.invoke("lint:check", { projectPath }),
  saveRecording: (projectPath, roleId, base64) =>
    ipcRenderer.invoke("recording:save", { projectPath, roleId, base64 }),
  saveProject: (filePath, data) => ipcRenderer.invoke("project:save", { filePath, data }),
  generate: (projectPath, outputPath, options) =>
    ipcRenderer.invoke("tts:generate", { projectPath, outputPath, options }),
  preview: (projectPath, lineId) => ipcRenderer.invoke("tts:preview", { projectPath, lineId }),
  suggestReadings: (texts) => ipcRenderer.invoke("reading:suggest", { texts }),
  loadOutput: (audioPath) => ipcRenderer.invoke("output:load", { audioPath }),
  pickAudioFile: () => ipcRenderer.invoke("file:pickAudio"),
  openWorksheet: (projectPath) => ipcRenderer.invoke("worksheet:open", { projectPath }),
  worksheetExists: (projectPath) => ipcRenderer.invoke("worksheet:exists", { projectPath }),
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
