import { useEffect, useState } from "react";

// Bảng câu thoại: mỗi dòng là một câu hoặc khoảng nghỉ, theo đúng thứ tự trong project.json.
export default function App() {
  const [project, setProject] = useState(null);
  const [filePath, setFilePath] = useState("");
  const [log, setLog] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => window.textts.onLog((text) => setLog((prev) => prev + text)), []);

  async function openProject() {
    const res = await window.textts.openProject();
    if (!res) return;
    setProject(res.data);
    setFilePath(res.filePath);
    setLog("");
  }

  async function generate() {
    if (!filePath || !project) return;
    setBusy(true);
    setLog("");
    const outputPath = filePath.replace(/\.json$/, ".mp3");
    const res = await window.textts.generate(filePath, outputPath);
    setLog((prev) => prev + `\n[thoát với mã ${res.code}]`);
    setBusy(false);
  }

  const items = project?.items ?? [];

  return (
    <div className="app">
      <header className="toolbar">
        <button onClick={openProject} disabled={busy}>Mở project.json</button>
        <button onClick={generate} disabled={busy || !project}>
          {busy ? "Đang tạo..." : "Tạo âm thanh"}
        </button>
        <span className="path">{filePath || "Chưa mở project"}</span>
      </header>

      <main className="content">
        <table className="lines">
          <thead>
            <tr>
              <th>ID</th>
              <th>Vai</th>
              <th>Câu thoại</th>
              <th>Cảm xúc / tốc độ</th>
            </tr>
          </thead>
          <tbody>
            {items.map((it) =>
              it.type === "pause" ? (
                <tr key={it.id} className="pause">
                  <td>{it.id}</td>
                  <td colSpan={3}>Nghỉ {it.ms} ms</td>
                </tr>
              ) : (
                <tr key={it.id}>
                  <td>{it.id}</td>
                  <td className={`role role-${it.role}`}>[{it.role}]</td>
                  <td className="text">{it.display}</td>
                  <td>{it.attrs?.emotion ?? "mặc định"} / {it.attrs?.speed ?? "mặc định"}</td>
                </tr>
              )
            )}
            {!project && (
              <tr>
                <td colSpan={4} className="empty">Mở một project.json để xem kịch bản.</td>
              </tr>
            )}
          </tbody>
        </table>
        <pre className="log">{log}</pre>
      </main>
    </div>
  );
}
