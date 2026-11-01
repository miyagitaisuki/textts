// Timeline: sóng âm của bản đầu ra, tô màu theo vai.
// Click để tua. Kéo một câu sang phải để dời nó về phía sau (lưu vào delay_ms).
import { useEffect, useRef, useState } from "react";

const ROLE_COLORS = { "1": "#4ade80", "2": "#60a5fa", "3": "#c084fc" };
const DRAG_THRESHOLD_PX = 4;
const CANVAS_CSS_HEIGHT = 120;

// Thước thời gian: vạch mỗi 2, 10 hoặc 30 giây tùy độ dài.
function Ruler({ durationMs }) {
  const totalS = durationMs / 1000;
  const step = totalS <= 20 ? 2 : totalS <= 120 ? 10 : 30;
  const ticks = [];
  for (let s = 0; s <= totalS; s += step) ticks.push(s);
  return (
    <div className="ruler" aria-hidden="true">
      {ticks.map((s) => (
        <span key={s} style={{ left: `${(s / totalS) * 100}%` }}>
          {Math.floor(s / 60)}:{String(s % 60).padStart(2, "0")}
        </span>
      ))}
    </div>
  );
}

// Thanh VU: mức của từng vai tại vị trí phát hiện tại.
function VuMeters({ levels, nowMs, durationMs }) {
  const roles = Object.keys(levels ?? {});
  const bins = roles.length ? levels[roles[0]].length : 0;
  const index = bins ? Math.min(bins - 1, Math.max(0, Math.floor((nowMs / durationMs) * bins))) : 0;
  return (
    <div className="vu">
      {roles.map((role) => {
        const level = levels[role][index] ?? 0;
        return (
          <div key={role} className="vu-channel" title={`Vai ${role}: ${Math.round(level * 100)}%`}>
            <div className="vu-track">
              <div className="vu-fill" style={{
                height: `${Math.round(level * 100)}%`,
                background: level > 0.9 ? "#ef4444" : level > 0.7 ? "#facc15" : ROLE_COLORS[role],
              }} />
            </div>
            <span className="fader-label" style={{ color: ROLE_COLORS[role] }}>[{role}]</span>
          </div>
        );
      })}
    </div>
  );
}

export default function Timeline({ output, onShift, disabled }) {
  const canvasRef = useRef(null);
  const audioRef = useRef(null);
  const dragRef = useRef(null);
  const [now, setNow] = useState(0);
  const [drag, setDrag] = useState(null); // {id, offsetMs}
  const { peaks, items, duration_ms, role_levels } = output.timeline;
  const rafRef = useRef(null);
  const duration = duration_ms / 1000;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    // Bộ nhớ điểm ảnh theo mật độ màn hình (HiDPI) để sóng không bị mờ; kích thước hiển thị do CSS quyết định.
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 1200;
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(CANVAS_CSS_HEIGHT * dpr);
    if (canvas.width !== pxW) canvas.width = pxW;
    if (canvas.height !== pxH) canvas.height = pxH;
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

  // Khi đang phát, cập nhật vị trí mỗi khung hình để thanh VU chạy mượt.
  function startTracking() {
    const tick = () => {
      if (audioRef.current) setNow(audioRef.current.currentTime * 1000);
      rafRef.current = requestAnimationFrame(tick);
    };
    cancelAnimationFrame(rafRef.current);
    rafRef.current = requestAnimationFrame(tick);
  }
  function stopTracking() {
    cancelAnimationFrame(rafRef.current);
    if (audioRef.current) setNow(audioRef.current.currentTime * 1000);
  }
  useEffect(() => () => cancelAnimationFrame(rafRef.current), []);

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
        onPlay={startTracking}
        onPause={stopTracking}
        onEnded={stopTracking}
        onSeeked={(e) => setNow(e.currentTarget.currentTime * 1000)}
        onTimeUpdate={(e) => setNow(e.currentTarget.currentTime * 1000)} />
      <VuMeters levels={role_levels} nowMs={now} durationMs={duration_ms} />
      <Ruler durationMs={duration_ms} />
      <canvas
        ref={canvasRef}
        width={1200}
        height={CANVAS_CSS_HEIGHT}
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
