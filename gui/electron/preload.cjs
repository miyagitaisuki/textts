// Cầu nối an toàn: renderer chỉ gọi các hàm được liệt kê ở đây.
const { contextBridge, ipcRenderer } = require("electron");

contextBridge.exposeInMainWorld("textts", {
  openProject: () => ipcRenderer.invoke("project:open"),
  saveProject: (filePath, data) => ipcRenderer.invoke("project:save", { filePath, data }),
  generate: (projectPath, outputPath) =>
    ipcRenderer.invoke("tts:generate", { projectPath, outputPath }),
  preview: (projectPath, lineId) => ipcRenderer.invoke("tts:preview", { projectPath, lineId }),
  onLog: (callback) => {
    const listener = (_evt, text) => callback(text);
    ipcRenderer.on("tts:log", listener);
    return () => ipcRenderer.removeListener("tts:log", listener);
  },
});
