// Timeline: sóng âm của bản đầu ra, tô màu theo vai, click để tua, vạch phát hiện tại.
import { useEffect, useRef, useState } from "react";

const ROLE_COLORS = { "1": "#4ade80", "2": "#60a5fa", "3": "#c084fc" };

export default function Timeline({ output }) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const [now, setNow] = useState(0);
  const duration = output.timeline.duration_ms / 1000;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    const { peaks, items, duration_ms } = output.timeline;
    ctx.clearRect(0, 0, width, height);

    // Vùng từng câu, tô nhạt theo màu vai
    for (const it of items) {
      ctx.fillStyle = (ROLE_COLORS[it.role] ?? "#888") + "33";
      const x0 = (it.start_ms / duration_ms) * width;
      const x1 = (it.end_ms / duration_ms) * width;
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height);
    }
    // Sóng âm
    const mid = height / 2;
    const bw = width / Math.max(1, peaks.length);
    ctx.fillStyle = "#cbd5e1";
    peaks.forEach((p, i) => {
      const h = Math.max(1, p * (height * 0.9));
      ctx.fillRect(i * bw, mid - h / 2, Math.max(1, bw - 0.5), h);
    });
    // Vạch phát hiện tại
    const x = (now / duration_ms) * width;
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(x, 0, 2, height);
  }, [output, now]);

  function seekFromClick(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const ratio = (e.clientX - rect.left) / rect.width;
    const t = Math.max(0, Math.min(1, ratio)) * duration;
    if (audioRef.current) audioRef.current.currentTime = t;
    setNow(t * 1000);
  }

  return (
    <div className="timeline">
      <audio ref={audioRef} controls src={output.dataUrl}
        onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
      <canvas ref={canvasRef} width={1200} height={120} onClick={seekFromClick} />
      <div className="legend">
        {output.timeline.items.map((it) => (
          <span key={it.id} className="legend-item" style={{ color: ROLE_COLORS[it.role] }}>
            {it.id}
          </span>
        ))}
      </div>
    </div>
  );
}
