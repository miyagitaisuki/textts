// Ngân hàng âm thanh: chọn hiệu ứng (sfx) hoặc nhạc/âm nền (bgm) từ
// gói CC0 của textts (tải về khi cần) hoặc thư viện cá nhân của giáo viên.
import { useEffect, useMemo, useRef, useState } from "react";

const TITLES = { sfx: "Ngân hàng hiệu ứng âm thanh", bgm: "Ngân hàng nhạc & âm nền" };

export default function SoundLibraryDialog({ kind = "sfx", api = window.textts, onPick, onClose }) {
  const [items, setItems] = useState([]);
  const [tab, setTab] = useState("pack");
  const [busyId, setBusyId] = useState(null);
  const [error, setError] = useState("");
  const [playing, setPlaying] = useState(null);
  const audioRef = useRef(null);

  useEffect(() => {
    api?.listSounds?.().then((r) => setItems(r?.items || []));
    // Bắt ở pha capture để Escape chỉ đóng hộp thoại này, không đóng luôn hộp thoại Xuất phía sau.
    const onKey = (e) => {
      if (e.key !== "Escape") return;
      e.stopPropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, true);
    return () => {
      window.removeEventListener("keydown", onKey, true);
      audioRef.current?.pause();
    };
  }, [api, onClose]);

  const visible = useMemo(
    () => items.filter((i) => i.kind === kind && (tab === "pack" ? i.source === "pack" : i.source === "mine")),
    [items, kind, tab]
  );
  const groups = useMemo(() => {
    const g = new Map();
    for (const it of visible) g.set(it.category, [...(g.get(it.category) || []), it]);
    return [...g.entries()];
  }, [visible]);
  const missing = items.filter((i) => i.kind === kind && i.source === "pack" && !i.downloaded);

  async function download(ids, busyKey) {
    setBusyId(busyKey);
    setError("");
    const r = await api.downloadSounds(ids);
    setBusyId(null);
    if (!r?.ok) {
      setError(r?.error || "Không tải được âm thanh");
      return null;
    }
    setItems(r.items);
    return r.items;
  }

  async function ensurePath(it) {
    if (it.path) return it.path;
    const list = await download([it.id], it.id);
    return list?.find((x) => x.id === it.id)?.path || null;
  }

  async function play(it) {
    audioRef.current?.pause();
    if (playing === it.id) {
      setPlaying(null);
      return;
    }
    const file = await ensurePath(it);
    if (!file) return;
    const audio = new Audio(await api.readSound(file));
    audio.onended = () => setPlaying(null);
    audioRef.current = audio;
    setPlaying(it.id);
    audio.play().catch(() => setPlaying(null));
  }

  async function choose(it) {
    const file = await ensurePath(it);
    if (file) {
      onPick(file);
      onClose();
    }
  }

  async function addMine() {
    const r = await api.importSounds(kind);
    if (r?.items) setItems(r.items);
    setTab("mine");
  }

  async function removeMine(it) {
    if (!window.confirm(`Xóa "${it.name}" khỏi thư viện cá nhân?`)) return;
    setItems((await api.removeSound(it.path))?.items || []);
  }

  async function pickOther() {
    const file = await api?.pickAudioFile?.();
    if (file) {
      onPick(file);
      onClose();
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal sound-library-modal"
        role="dialog"
        aria-modal="true"
        aria-label={TITLES[kind]}
        onClick={(e) => e.stopPropagation()}
      >
        <h2>{TITLES[kind]}</h2>
        <div className="sound-tabs" role="tablist">
          <button role="tab" aria-selected={tab === "pack"} className={tab === "pack" ? "active" : "ghost"} onClick={() => setTab("pack")}>
            Gói textts (CC0)
          </button>
          <button role="tab" aria-selected={tab === "mine"} className={tab === "mine" ? "active" : "ghost"} onClick={() => setTab("mine")}>
            Thư viện của tôi
          </button>
          <span style={{ flex: 1 }} />
          {tab === "pack" && missing.length > 0 && (
            <button className="ghost" disabled={Boolean(busyId)} onClick={() => download(missing.map((m) => m.id), "all")}>
              {busyId === "all" ? "Đang tải…" : `⬇ Tải cả gói (${missing.length})`}
            </button>
          )}
          {tab === "mine" && (
            <button className="ghost" onClick={addMine}>
              ＋ Thêm file…
            </button>
          )}
        </div>

        {error && <p className="error-text">{error}</p>}
        {tab === "pack" && (
          <p className="muted">Âm do textts tự tạo, phát hành CC0: dùng tự do cho bài giảng, không cần ghi nguồn.</p>
        )}

        <div className="sound-list">
          {groups.length === 0 && (
            <p className="muted">
              {tab === "mine" ? "Chưa có âm nào. Bấm “Thêm file…” để đưa âm của bạn vào thư viện." : "Không có âm nào."}
            </p>
          )}
          {groups.map(([category, list]) => (
            <section key={category}>
              <h3>{category}</h3>
              {list.map((it) => (
                <div className="sound-row" key={it.id}>
                  <button
                    className="ghost"
                    title={playing === it.id ? "Dừng" : "Nghe thử"}
                    aria-label={`Nghe thử ${it.name}`}
                    disabled={busyId === it.id}
                    onClick={() => play(it)}
                  >
                    {playing === it.id ? "■" : "▶"}
                  </button>
                  <span className="sound-name">{it.name}</span>
                  {it.duration && <span className="muted">{it.duration.toFixed(1)} s</span>}
                  {!it.downloaded && <span className="muted">{busyId === it.id ? "đang tải…" : "chưa tải"}</span>}
                  <button disabled={Boolean(busyId)} onClick={() => choose(it)}>
                    Chọn
                  </button>
                  {it.source === "mine" && (
                    <button className="ghost danger" title="Xóa khỏi thư viện" onClick={() => removeMine(it)}>
                      ✕
                    </button>
                  )}
                </div>
              ))}
            </section>
          ))}
        </div>

        <div className="modal-actions">
          <button className="ghost" onClick={pickOther}>
            Chọn file khác trên máy…
          </button>
          <button onClick={onClose}>Đóng</button>
        </div>
      </div>
    </div>
  );
}
