// Timeline: sóng âm của bản đầu ra, tô màu theo vai.
// Click để tua. Kéo một câu sang phải để dời nó về phía sau (lưu vào delay_ms).
import { useEffect, useRef, useState } from "react";

const ROLE_COLORS = { "1": "#4ade80", "2": "#60a5fa", "3": "#c084fc" };
const DRAG_THRESHOLD_PX = 4;

export default function Timeline({ output, onShift, disabled }) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const dragRef = useRef(null);
  const [now, setNow] = useState(0);
  const [drag, setDrag] = useState(null); // {id, offsetMs}
  const { peaks, items, duration_ms } = output.timeline;
  const duration = duration_ms / 1000;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const { width, height } = canvas;
    ctx.clearRect(0, 0, width, height);
    const toX = (ms) => (ms / duration_ms) * width;

    for (const it of items) {
      const shift = drag && drag.id === it.id ? drag.offsetMs : 0;
      ctx.fillStyle = (ROLE_COLORS[it.role] ?? "#888") + (shift ? "99" : "33");
      const x0 = toX(it.start_ms + shift);
      const x1 = toX(it.end_ms + shift);
      ctx.fillRect(x0, 0, Math.max(1, x1 - x0), height);
    }

    const mid = height / 2;
    const bw = width / Math.max(1, peaks.length);
    ctx.fillStyle = "#cbd5e1";
    peaks.forEach((p, i) => {
      const h = Math.max(1, p * (height * 0.9));
      ctx.fillRect(i * bw, mid - h / 2, Math.max(1, bw - 0.5), h);
    });

    const x = toX(now);
    ctx.fillStyle = "#f8fafc";
    ctx.fillRect(x, 0, 2, height);
  }, [output, now, drag]);

  function canvasX(e) {
    const canvas = canvasRef.current;
    const rect = canvas.getBoundingClientRect();
    return (e.clientX - rect.left) * (canvas.width / rect.width);
  }

  function itemAt(xCanvas) {
    const ms = (xCanvas / canvasRef.current.width) * duration_ms;
    return items.find((it) => ms >= it.start_ms && ms <= it.end_ms) ?? null;
  }

  function onPointerDown(e) {
    if (disabled) return;
    const x = canvasX(e);
    const hit = itemAt(x);
    dragRef.current = { startX: x, id: hit ? hit.id : null, moved: false, seekMs: (x / canvasRef.current.width) * duration_ms };
    canvasRef.current.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d || d.id === null) return;
    const x = canvasX(e);
    const dxPx = x - d.startX;
    if (Math.abs(dxPx) > DRAG_THRESHOLD_PX) d.moved = true;
    if (d.moved) {
      const offsetMs = Math.max(0, Math.round((dxPx / canvasRef.current.width) * duration_ms));
      setDrag({ id: d.id, offsetMs });
    }
  }

  function onPointerUp(e) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (d.id !== null && d.moved) {
      const x = canvasX(e);
      const offsetMs = Math.max(0, Math.round(((x - d.startX) / canvasRef.current.width) * duration_ms));
      setDrag(null);
      if (offsetMs > 0) onShift(d.id, offsetMs);
      return;
    }
    // Không kéo: tua đến vị trí đã nhấp
    setDrag(null);
    const t = Math.max(0, Math.min(1, d.seekMs / duration_ms)) * duration;
    if (audioRef.current) audioRef.current.currentTime = t;
    setNow(t * 1000);
  }

  return (
    <div className="timeline">
      <audio ref={audioRef} controls src={output.dataUrl}
        onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
      <canvas
        ref={canvasRef}
        width={1200}
        height={120}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={() => { dragRef.current = null; setDrag(null); }}
      />
      <div className="legend">
        {items.map((it) => (
          <span key={it.id} className="legend-item" style={{ color: ROLE_COLORS[it.role] }}>
            {it.id}
          </span>
        ))}
        <span className="hint">Kéo một câu sang phải để dời; nhấp để tua.</span>
      </div>
    </div>
  );
}
