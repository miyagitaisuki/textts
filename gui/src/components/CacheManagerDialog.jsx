// Hộp thoại quản lý bộ nhớ đệm (cache)
import { useEffect, useState } from "react";

export default function CacheManagerDialog({ disabled, onClose }) {
  const [info, setInfo] = useState({ count: 0, sizeMb: 0 });
  const [status, setStatus] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  useEffect(() => {
    refresh();
  }, []);

  async function refresh() {
    if (!window.textts?.getCacheInfo) return;
    const res = await window.textts.getCacheInfo();
    setInfo(res);
  }

  async function handleClear() {
    if (!window.confirm("Bạn có chắc chắn muốn xóa toàn bộ file trong thư mục cache không?")) return;
    setBusy(true);
    setStatus("Đang xóa...");
    const res = await window.textts.clearCache();
    setBusy(false);
    if (res?.ok) {
      setStatus(`Đã xóa thành công ${res.cleared} file cache.`);
      refresh();
    } else {
      setStatus("Không xóa được cache.");
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-label="Quản lý bộ nhớ đệm"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Bộ nhớ đệm âm thanh (Cache)</h2>
        <p className="muted">
          textts lưu kết quả tổng hợp của từng câu thoại vào thư mục cache để không phải tạo lại khi câu thoại không thay đổi.
        </p>

        <div style={{ background: "#0e1014", padding: 12, borderRadius: 6, margin: "8px 0" }}>
          <div>Số file đã cache: <strong>{info.count} file</strong></div>
          <div style={{ marginTop: 4 }}>Dung lượng ổ đĩa: <strong>{info.sizeMb} MB</strong></div>
        </div>

        {status && <div className="preset-error" style={{ color: "#4ade80" }}>{status}</div>}

        <div className="modal-actions" style={{ justifyContent: "space-between" }}>
          <button
            className="ghost danger"
            onClick={handleClear}
            disabled={disabled || busy || info.count === 0}
            title="Xóa mọi file cache"
          >
            Dọn sạch cache
          </button>
          <button onClick={onClose} autoFocus>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
