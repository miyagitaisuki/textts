// Ghi âm giọng thật làm mẫu cho một vai. File lưu trong recordings/<tên project>/ cạnh project.json.
import { useEffect, useRef, useState } from "react";

export default function Recorder({ projectPath, roleId, disabled }) {
  const [recording, setRecording] = useState(false);
  const [status, setStatus] = useState("");
  const [playUrl, setPlayUrl] = useState(null);
  const recorderRef = useRef(null);
  const chunksRef = useRef([]);

  useEffect(() => () => {
    recorderRef.current?.stream?.getTracks().forEach((t) => t.stop());
  }, []);

  async function start() {
    if (!projectPath) return;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const rec = new MediaRecorder(stream);
      chunksRef.current = [];
      rec.ondataavailable = (e) => e.data.size && chunksRef.current.push(e.data);
      rec.onstop = () => finish(rec, stream);
      rec.start();
      recorderRef.current = rec;
      setRecording(true);
      setStatus("Đang ghi...");
    } catch (err) {
      setStatus(`Không mở được micro: ${err.message}`);
    }
  }

  function stop() {
    recorderRef.current?.stop();
    setRecording(false);
  }

  async function finish(rec, stream) {
    stream.getTracks().forEach((t) => t.stop());
    const blob = new Blob(chunksRef.current, { type: rec.mimeType || "audio/webm" });
    setPlayUrl(URL.createObjectURL(blob));
    const bytes = new Uint8Array(await blob.arrayBuffer());
    let binary = "";
    for (const b of bytes) binary += String.fromCharCode(b);
    const res = await window.textts.saveRecording(projectPath, roleId, btoa(binary));
    setStatus(res.ok ? `Đã lưu: ${res.path.split(/[\\/]/).pop()}` : `Lỗi lưu: ${res.error}`);
  }

  return (
    <div className="recorder">
      {recording ? (
        <button onClick={stop}>■ Dừng</button>
      ) : (
        <button onClick={start} disabled={disabled || !projectPath}>● Ghi âm mẫu</button>
      )}
      {status && <span className="rec-status">{status}</span>}
      {playUrl && <audio controls src={playUrl} />}
    </div>
  );
}
