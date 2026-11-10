// Timeline: sóng âm của bản đầu ra, tô màu theo vai.
// Click để tua. Kéo một câu sang phải để dời nó về phía sau (lưu vào delay_ms).
import { useEffect, useRef, useState } from "react";

const ROLE_COLORS = { "1": "#34d399", "2": "#60a5fa", "3": "#c084fc", "4": "#fbbf24", "5": "#f43f5e" };
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
        const color = ROLE_COLORS[role] || "#94a3b8";
        return (
          <div key={role} className="vu-channel" title={`Vai ${role}: ${Math.round(level * 100)}%`}>
            <div className="vu-track">
              <div
                className="vu-fill"
                style={{
                  height: `${Math.round(level * 100)}%`,
                  background: level > 0.9 ? "#ef4444" : level > 0.7 ? "#facc15" : color,
                }}
              />
            </div>
            <span className="fader-label" style={{ color }}>
              [{role}]
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function Timeline({
  output,
  onShift,
  selectedId,
  disabled,
  currentTime = 0,
  onSeek,
  playbackRate = 1.0,
  onChangeRate,
}) {
  const canvasRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null); // {id, offsetMs}
  const { peaks, items = [], duration_ms = 0, role_levels = {} } = output?.timeline || {};
  const duration = duration_ms / 1000;
  const nowMs = currentTime * 1000;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    const dpr = window.devicePixelRatio || 1;
    const cssW = canvas.clientWidth || 1200;
    const pxW = Math.round(cssW * dpr);
    const pxH = Math.round(CANVAS_CSS_HEIGHT * dpr);

    if (canvas.width !== pxW || canvas.height !== pxH) {
      canvas.width = pxW;
      canvas.height = pxH;
    }
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    const w = cssW;
    const h = CANVAS_CSS_HEIGHT;
    ctx.clearRect(0, 0, w, h);

    // Nền tối
    ctx.fillStyle = "#0c101a";
    ctx.fillRect(0, 0, w, h);

    // Đường lưới nhẹ
    ctx.strokeStyle = "#1b2234";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(0, h / 2);
    ctx.lineTo(w, h);
    ctx.stroke();

    // Sóng âm
    if (peaks && peaks.length) {
      const step = w / peaks.length;
      for (let i = 0; i < peaks.length; i++) {
        const t = (i / peaks.length) * duration_ms;
        const cur = items.find((it) => t >= it.start_ms && t < it.end_ms);
        const col = (cur && ROLE_COLORS[cur.role]) || "#334155";
        ctx.fillStyle = col;
        const amp = peaks[i] * (h / 2 - 8);
        ctx.fillRect(i * step, h / 2 - amp, Math.max(1.5, step - 0.5), amp * 2);
      }
    }

    // Viền các câu
    ctx.lineWidth = 1.5;
    for (const it of items) {
      const x1 = (it.start_ms / duration_ms) * w;
      const x2 = (it.end_ms / duration_ms) * w;
      const isCur = it.id === selectedId;
      ctx.strokeStyle = isCur ? "#ffffff" : ROLE_COLORS[it.role] || "#64748b";
      ctx.strokeRect(x1, 2, Math.max(2, x2 - x1), h - 4);
      if (isCur) {
        ctx.fillStyle = "rgba(255, 255, 255, 0.08)";
        ctx.fillRect(x1, 2, Math.max(2, x2 - x1), h - 4);
      }
    }

    // Đang kéo dời câu
    if (drag) {
      const it = items.find((p) => p.id === drag.id);
      if (it) {
        const nextStart = it.start_ms + drag.offsetMs;
        const len = it.end_ms - it.start_ms;
        const x1 = (nextStart / duration_ms) * w;
        const x2 = ((nextStart + len) / duration_ms) * w;
        ctx.fillStyle = "rgba(251, 191, 36, 0.35)";
        ctx.fillRect(x1, 2, Math.max(2, x2 - x1), h - 4);
        ctx.strokeStyle = "#fbbf24";
        ctx.setLineDash([4, 4]);
        ctx.strokeRect(x1, 2, Math.max(2, x2 - x1), h - 4);
        ctx.setLineDash([]);
      }
    }

    // Con trỏ phát (Playhead)
    const playX = (currentTime / (duration || 1)) * w;
    ctx.strokeStyle = "#10b981";
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(playX, 0);
    ctx.lineTo(playX, h);
    ctx.stroke();

    // Đầu kim tam giác
    ctx.fillStyle = "#10b981";
    ctx.beginPath();
    ctx.moveTo(playX - 5, 0);
    ctx.lineTo(playX + 5, 0);
    ctx.lineTo(playX, 7);
    ctx.closePath();
    ctx.fill();
  }, [peaks, items, duration_ms, selectedId, drag, currentTime, duration]);

  function timeAt(e) {
    const rect = canvasRef.current.getBoundingClientRect();
    const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    return ratio * (duration || 0);
  }

  function itemAtMs(ms) {
    return items.find((it) => ms >= it.start_ms && ms < it.end_ms);
  }

  function onPointerDown(e) {
    if (disabled || !duration) return;
    const t = timeAt(e);
    const it = itemAtMs(t * 1000);
    dragRef.current = {
      startX: e.clientX,
      tDown: t,
      targetId: it ? it.id : null,
      moved: false,
    };
    e.currentTarget.setPointerCapture(e.pointerId);
  }

  function onPointerMove(e) {
    const d = dragRef.current;
    if (!d || disabled) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) >= DRAG_THRESHOLD_PX) {
      d.moved = true;
    }
    if (d.moved && d.targetId) {
      const rect = canvasRef.current.getBoundingClientRect();
      const msPerPx = duration_ms / rect.width;
      const offsetMs = Math.round(Math.max(0, dx * msPerPx));
      setDrag({ id: d.targetId, offsetMs });
    }
  }

  function onPointerUp(e) {
    const d = dragRef.current;
    if (!d) return;
    dragRef.current = null;
    if (!d.moved) {
      onSeek?.(d.tDown);
    } else if (d.targetId && drag && drag.offsetMs > 0) {
      onShift?.(d.targetId, drag.offsetMs);
    }
    setDrag(null);
  }

  return (
    <div className="studio-timeline-panel">
      <div className="timeline-toolbar-row">
        <div className="timeline-legend">
          {items.map((it) => (
            <span
              key={it.id}
              className={`legend-pill ${selectedId === it.id ? "active" : ""}`}
              style={{ borderColor: ROLE_COLORS[it.role] || "#64748b" }}
            >
              [{it.role}] {it.id}
            </span>
          ))}
          <span className="timeline-hint">Kéo câu sang phải để chèn delay; nhấp để tua vị trí.</span>
        </div>

        <div className="playback-speed-select">
          <label>Tốc độ:</label>
          <select
            value={playbackRate}
            disabled={disabled}
            onChange={(e) => onChangeRate?.(Number(e.target.value))}
            title="Tốc độ phát lại"
          >
            <option value={0.75}>0.75×</option>
            <option value={1.0}>1.0×</option>
            <option value={1.25}>1.25×</option>
            <option value={1.5}>1.5×</option>
          </select>
        </div>
      </div>

      <VuMeters levels={role_levels} nowMs={nowMs} durationMs={duration_ms} />
      <Ruler durationMs={duration_ms} />
      <div className="timeline-canvas-wrap">
        <canvas
          ref={canvasRef}
          width={1200}
          height={CANVAS_CSS_HEIGHT}
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerCancel={() => {
            dragRef.current = null;
            setDrag(null);
          }}
        />
      </div>
    </div>
  );
}
