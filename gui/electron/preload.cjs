// Cầu nối an toàn: renderer chỉ gọi các hàm được liệt kê ở đây.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("textts", {
  openProject: () => ipcRenderer.invoke("project:open"),
  openScript: (outputRoot) => ipcRenderer.invoke("script:open", { outputRoot }),
  importText: (text, outputRoot) => ipcRenderer.invoke("script:importText", { text, outputRoot }),
  pickFolder: () => ipcRenderer.invoke("dialog:pickFolder"),
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
  onLog: (callback) => {
    const listener = (_evt, text) => callback(text);
    ipcRenderer.on("tts:log", listener);
    return () => ipcRenderer.removeListener("tts:log", listener);
  },
});
