// Cầu nối an toàn: renderer chỉ gọi các hàm được liệt kê ở đây.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("textts", {
  openProject: () => ipcRenderer.invoke("project:open"),
  openScript: () => ipcRenderer.invoke("script:open"),
  listVoices: (engine) => ipcRenderer.invoke("voices:list", { engine }),
  saveProject: (filePath, data) => ipcRenderer.invoke("project:save", { filePath, data }),
  generate: (projectPath, outputPath) =>
    ipcRenderer.invoke("tts:generate", { projectPath, outputPath }),
  preview: (projectPath, lineId) => ipcRenderer.invoke("tts:preview", { projectPath, lineId }),
  suggestReadings: (texts) => ipcRenderer.invoke("reading:suggest", { texts }),
  loadOutput: (audioPath) => ipcRenderer.invoke("output:load", { audioPath }),
  onLog: (callback) => {
    const listener = (_evt, text) => callback(text);
    ipcRenderer.on("tts:log", listener);
    return () => ipcRenderer.removeListener("tts:log", listener);
  },
});
