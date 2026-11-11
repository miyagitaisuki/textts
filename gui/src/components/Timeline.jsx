// Timeline nhiều track kiểu Premiere/Audition:
// mỗi vai một track (clip = câu thoại), track SFX, track nhạc nền và track tổng (sóng âm).
// - Nhấp thước/khoảng trống: tua. Nhấp clip: chọn câu. Nhấp đúp clip: nghe thử câu đó.
// - Kéo clip sang trái/phải: dời câu (lưu vào delay_ms, không nhỏ hơn 0).
// - Ctrl + lăn chuột hoặc nút −/+: phóng to/thu nhỏ; "Vừa khung" để xem toàn bài.
import { useEffect, useMemo, useRef, useState } from "react";

export const ROLE_COLORS = { "1": "#34d399", "2": "#60a5fa", "3": "#c084fc", "4": "#fbbf24", "5": "#f43f5e" };
const roleColor = (r) => ROLE_COLORS[r] || "#94a3b8";
const DRAG_THRESHOLD_PX = 4;
const MIN_PX_PER_SEC = 4;
const MAX_PX_PER_SEC = 400;
const HEADER_W = 168;

function fmt(ms) {
  const s = Math.max(0, ms) / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s - m * 60).toFixed(1).padStart(4, "0")}`;
}

function tickStep(pxPerSec) {
  // khoảng vạch sao cho mỗi nhãn cách nhau ít nhất ~70px
  for (const step of [0.5, 1, 2, 5, 10, 15, 30, 60, 120]) if (step * pxPerSec >= 70) return step;
  return 300;
}

function baseName(p = "") {
  return String(p).split(/[\\/]/).pop().replace(/\.[^.]+$/, "");
}

export default function Timeline({
  output,
  items: projectItems = [],
  roles = {},
  selectedId,
  onSelect,
  onShift,
  onSeek,
  onPreview,
  currentTime = 0,
  isPlaying = false,
  playbackRate = 1.0,
  onChangeRate,
  disabled,
  bgmPath = "",
}) {
  const scrollRef = useRef(null);
  const dragRef = useRef(null);
  const [drag, setDrag] = useState(null); // { id, offsetMs }
  const [viewW, setViewW] = useState(800);
  const [bodyH, setBodyH] = useState(240);
  const bodyRef = useRef(null);
  const [zoom, setZoom] = useState(null); // null = vừa khung
  const tl = output?.timeline || {};
  const { peaks = [], items = [], duration_ms = 0, role_levels = {}, sfx = [] } = tl;
  const bgm = tl.bgm || bgmPath;
  const nowMs = currentTime * 1000;

  // Đo bề rộng vùng cuộn để tính mức "vừa khung".
  useEffect(() => {
    const el = scrollRef.current;
    if (!el) return;
    const ro = new ResizeObserver(() => {
      setViewW(el.clientWidth || 800);
      setBodyH(bodyRef.current?.clientHeight || 240);
    });
    ro.observe(el);
    if (bodyRef.current) ro.observe(bodyRef.current);
    return () => ro.disconnect();
  }, []);

  const fitPx = duration_ms ? Math.max(MIN_PX_PER_SEC, (viewW - 24) / (duration_ms / 1000)) : 50;
  const pxPerSec = zoom ?? fitPx;
  const contentW = Math.max(viewW, (duration_ms / 1000) * pxPerSec + 24);
  const x = (ms) => (ms / 1000) * pxPerSec;

  // Khi đang phát, giữ playhead trong khung nhìn (cuộn theo trang như Premiere).
  useEffect(() => {
    const el = scrollRef.current;
    if (!el || !isPlaying) return;
    const px = x(nowMs);
    if (px < el.scrollLeft || px > el.scrollLeft + el.clientWidth - 40) el.scrollLeft = Math.max(0, px - 40);
  }, [nowMs, isPlaying, pxPerSec]);

  const textById = useMemo(
    () => Object.fromEntries(projectItems.filter((i) => i.type === "line").map((i) => [i.id, i])),
    [projectItems]
  );
  const roleIds = useMemo(() => {
    const ids = new Set([...Object.keys(roles), ...items.map((i) => i.role)]);
    return [...ids].sort((a, b) => Number(a) - Number(b));
  }, [roles, items]);

  // Màu từng cột sóng theo vai đang nói tại thời điểm đó.
  const bars = useMemo(
    () =>
      peaks.map((p, i) => {
        const t = (i / peaks.length) * duration_ms;
        const cur = items.find((it) => t >= it.start_ms && t < it.end_ms);
        return { h: Math.max(2, p * 100), color: cur ? roleColor(cur.role) : "#475569" };
      }),
    [peaks, items, duration_ms]
  );

  function setZoomClamped(next) {
    const el = scrollRef.current;
    const center = el ? (el.scrollLeft + el.clientWidth / 2) / pxPerSec : 0;
    const z = Math.min(MAX_PX_PER_SEC, Math.max(MIN_PX_PER_SEC, next));
    setZoom(Math.abs(z - fitPx) < 0.5 ? null : z);
    requestAnimationFrame(() => {
      if (el) el.scrollLeft = Math.max(0, center * z - el.clientWidth / 2);
    });
  }

  function onWheel(e) {
    if (!(e.ctrlKey || e.metaKey)) return;
    e.preventDefault();
    setZoomClamped(pxPerSec * (e.deltaY < 0 ? 1.25 : 0.8));
  }

  function msAt(e) {
    const el = scrollRef.current;
    const rect = el.getBoundingClientRect();
    return Math.max(0, Math.min(duration_ms, ((e.clientX - rect.left + el.scrollLeft) / pxPerSec) * 1000));
  }

  function seekAt(e) {
    if (!duration_ms) return;
    onSeek?.(msAt(e) / 1000);
  }

  function onClipDown(e, it) {
    e.stopPropagation();
    if (disabled) return;
    dragRef.current = { id: it.id, startX: e.clientX, moved: false, start: it.start_ms };
    e.currentTarget.setPointerCapture?.(e.pointerId);
  }

  function onClipMove(e) {
    const d = dragRef.current;
    if (!d) return;
    const dx = e.clientX - d.startX;
    if (!d.moved && Math.abs(dx) < DRAG_THRESHOLD_PX) return;
    d.moved = true;
    const minOffset = -(textById[d.id]?.delay_ms || 0); // không kéo sớm hơn vị trí gốc
    const offsetMs = Math.max(minOffset, Math.round(((dx / pxPerSec) * 1000) / 10) * 10);
    setDrag({ id: d.id, offsetMs });
  }

  function onClipUp(it) {
    const d = dragRef.current;
    dragRef.current = null;
    if (!d) return;
    if (!d.moved) {
      onSelect?.(it.id);
      onSeek?.(it.start_ms / 1000);
    } else if (drag && Math.abs(drag.offsetMs) >= 10) {
      onShift?.(it.id, drag.offsetMs);
    }
    setDrag(null);
  }

  const step = tickStep(pxPerSec);
  const ticks = [];
  for (let s = 0; s <= duration_ms / 1000 + 0.001; s += step) ticks.push(s);
  const levelAt = (role) => {
    const arr = role_levels[role];
    if (!arr?.length || !duration_ms) return 0;
    return arr[Math.min(arr.length - 1, Math.floor((nowMs / duration_ms) * arr.length))] ?? 0;
  };

  // Track SFX / nhạc nền chỉ hiện khi bài có dùng, để panel thấp vẫn đủ chỗ.
  const tracks = [
    ...roleIds.map((r) => ({ key: `role-${r}`, kind: "role", role: r })),
    ...(sfx.length ? [{ key: "sfx", kind: "sfx" }] : []),
    ...(bgm ? [{ key: "bgm", kind: "bgm" }] : []),
  ];
  // Chiều cao mỗi track co giãn theo panel (giữ chỗ cho track Tổng và thanh cuộn ngang).
  const laneH = Math.round(Math.min(44, Math.max(20, (bodyH - 22 - 12 - 36) / Math.max(1, tracks.length))));

  return (
    <div className="mt-timeline">
      <div className="mt-toolbar">
        <span className="mt-title">Timeline</span>
        <span className="mt-time">
          {fmt(nowMs)} <span className="muted">/ {fmt(duration_ms)}</span>
        </span>
        <span className="mt-spacer" />
        <div className="mt-zoom" role="group" aria-label="Thu phóng timeline">
          <button type="button" className="mini-ghost-btn" title="Thu nhỏ (Ctrl + lăn chuột)" onClick={() => setZoomClamped(pxPerSec * 0.8)}>
            −
          </button>
          <input
            type="range"
            min={Math.log(MIN_PX_PER_SEC)}
            max={Math.log(MAX_PX_PER_SEC)}
            step={0.01}
            value={Math.log(pxPerSec)}
            onChange={(e) => setZoomClamped(Math.exp(Number(e.target.value)))}
            aria-label="Mức thu phóng"
          />
          <button type="button" className="mini-ghost-btn" title="Phóng to (Ctrl + lăn chuột)" onClick={() => setZoomClamped(pxPerSec * 1.25)}>
            +
          </button>
          <button type="button" className="mini-ghost-btn" title="Xem toàn bài" onClick={() => setZoom(null)} disabled={zoom === null}>
            Vừa khung
          </button>
        </div>
        <label className="mt-rate" title="Tốc độ phát lại (chỉ khi nghe, không đổi file)">
          Tốc độ
          <select value={playbackRate} onChange={(e) => onChangeRate?.(Number(e.target.value))}>
            {[0.75, 1, 1.25, 1.5, 2].map((r) => (
              <option key={r} value={r}>
                {r}×
              </option>
            ))}
          </select>
        </label>
      </div>

      <div className="mt-body" ref={bodyRef} style={{ "--lane-h": `${laneH}px` }}>
        <div className="mt-headers" style={{ width: HEADER_W }}>
          <div className="mt-ruler-spacer" />
          {tracks.map((t) => {
            if (t.kind === "role") {
              const level = levelAt(t.role);
              return (
                <div key={t.key} className="mt-track-head" style={{ "--track-color": roleColor(t.role) }}>
                  <span className="mt-swatch" />
                  <span className="mt-track-name" title={roles[t.role]?.name || ""}>
                    [{t.role}] {roles[t.role]?.name || `Vai ${t.role}`}
                  </span>
                  <span className="mt-meter" title={`Mức hiện tại ${Math.round(level * 100)}%`}>
                    <span style={{ width: `${Math.round(level * 100)}%` }} />
                  </span>
                </div>
              );
            }
            return (
              <div key={t.key} className="mt-track-head mt-track-aux">
                <span className="mt-track-name">{t.kind === "sfx" ? "Hiệu ứng (SFX)" : "Nhạc nền"}</span>
              </div>
            );
          })}
          <div className="mt-track-head mt-track-master">
            <span className="mt-track-name">Tổng</span>
          </div>
        </div>

        <div className="mt-scroll" ref={scrollRef} onWheel={onWheel}>
          <div className="mt-content" style={{ width: contentW }}>
            <div className="mt-ruler" onPointerDown={seekAt} title="Nhấp để tua">
              {ticks.map((s) => (
                <span key={s} className="mt-tick" style={{ left: x(s * 1000) }}>
                  {fmt(s * 1000).replace(/\.0$/, "")}
                </span>
              ))}
            </div>

            {tracks.map((t) => (
              <div key={t.key} className="mt-lane" onPointerDown={seekAt}>
                {t.kind === "role" &&
                  items
                    .filter((it) => it.role === t.role)
                    .map((it) => {
                      const off = drag?.id === it.id ? drag.offsetMs : 0;
                      const line = textById[it.id];
                      return (
                        <div
                          key={it.id}
                          className={`mt-clip ${selectedId === it.id ? "selected" : ""} ${off ? "dragging" : ""}`}
                          style={{
                            left: x(it.start_ms + off),
                            width: Math.max(4, x(it.end_ms - it.start_ms)),
                            "--track-color": roleColor(it.role),
                          }}
                          title={`${it.id} · ${fmt(it.start_ms)}–${fmt(it.end_ms)}${line ? `\n${line.plain}` : ""}\nKéo để dời, nhấp đúp để nghe thử`}
                          onPointerDown={(e) => onClipDown(e, it)}
                          onPointerMove={onClipMove}
                          onPointerUp={() => onClipUp(it)}
                          onPointerCancel={() => {
                            dragRef.current = null;
                            setDrag(null);
                          }}
                          onDoubleClick={() => onPreview?.(it.id)}
                        >
                          <span className="mt-clip-id">{it.id}</span>
                          <span className="mt-clip-text">{line?.plain ?? ""}</span>
                          {off !== 0 && <span className="mt-clip-offset">{off > 0 ? "+" : ""}{(off / 1000).toFixed(2)}s</span>}
                        </div>
                      );
                    })}
                {t.kind === "sfx" &&
                  sfx.map((m) => (
                    <div
                      key={`${m.id}-${m.start_ms}`}
                      className={`mt-clip mt-clip-sfx ${selectedId === m.id ? "selected" : ""}`}
                      style={{ left: x(m.start_ms), width: Math.max(4, x(m.end_ms - m.start_ms)) }}
                      title={`${baseName(m.path)} · ${fmt(m.start_ms)}`}
                      onPointerDown={(e) => {
                        e.stopPropagation();
                        onSelect?.(m.id);
                        onSeek?.(m.start_ms / 1000);
                      }}
                    >
                      <span className="mt-clip-text">♪ {baseName(m.path)}</span>
                    </div>
                  ))}
                {t.kind === "bgm" && bgm && (
                  <div className="mt-clip mt-clip-bgm" style={{ left: 0, width: x(duration_ms) }} title={bgm}>
                    <span className="mt-clip-text">♫ {baseName(bgm)}</span>
                  </div>
                )}
              </div>
            ))}

            <div className="mt-lane mt-master" onPointerDown={seekAt}>
              <div className="mt-wave">
                {bars.map((b, i) => (
                  <span key={i} style={{ height: `${b.h}%`, background: b.color }} />
                ))}
              </div>
            </div>

            <div className="mt-playhead" style={{ left: x(nowMs) }} />
          </div>
        </div>
      </div>
    </div>
  );
}
