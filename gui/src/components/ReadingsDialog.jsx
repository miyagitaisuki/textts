// Hộp thoại quản lý từ điển cách đọc (readings.yaml): Kanji -> Hiragana
import { useEffect, useState } from "react";

export default function ReadingsDialog({ readings = {}, onSave, onApplyToProject, disabled, onClose }) {
  const [word, setWord] = useState("");
  const [kana, setKana] = useState("");
  const [error, setError] = useState("");
  const [list, setList] = useState(() =>
    Object.entries(readings)
      .map(([w, k]) => ({ word: w, kana: k }))
      .sort((a, b) => a.word.localeCompare(b.word))
  );

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  function addEntry() {
    const w = word.trim();
    const k = kana.trim();
    if (!w || !k) {
      setError("Vui lòng điền đủ cả từ và cách đọc kana");
      return;
    }
    // Kiểm tra kana
    if (!/^[぀-ヿー]+$/.test(k)) {
      setError("Cách đọc phải là chữ kana (hiragana/katakana)");
      return;
    }
    const nextList = [...list.filter((it) => it.word !== w), { word: w, kana: k }].sort((a, b) =>
      a.word.localeCompare(b.word)
    );
    setList(nextList);
    setWord("");
    setKana("");
    setError("");
    const dict = Object.fromEntries(nextList.map((it) => [it.word, it.kana]));
    onSave(dict);
  }

  function removeEntry(w) {
    const nextList = list.filter((it) => it.word !== w);
    setList(nextList);
    const dict = Object.fromEntries(nextList.map((it) => [it.word, it.kana]));
    onSave(dict);
  }

  function handleApply() {
    const dict = Object.fromEntries(list.map((it) => [it.word, it.kana]));
    onApplyToProject(dict);
    onClose();
  }

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div
        className="modal readings-modal"
        role="dialog"
        aria-modal="true"
        aria-label="Từ điển cách đọc"
        onClick={(e) => e.stopPropagation()}
      >
        <h2>Từ điển cách đọc (readings.yaml)</h2>
        <p className="muted">
          Quản lý cách đọc Kanji riêng của bạn. Tự động áp dụng khi nhập kịch bản hoặc bấm nút áp dụng.
        </p>

        <div className="readings-form">
          <input
            placeholder="Chữ Hán (ví dụ: 日本語)"
            value={word}
            disabled={disabled}
            onChange={(e) => setWord(e.target.value)}
          />
          <input
            placeholder="Cách đọc kana (ví dụ: にほんご)"
            value={kana}
            disabled={disabled}
            onChange={(e) => setKana(e.target.value)}
          />
          <button className="primary" onClick={addEntry} disabled={disabled || !word || !kana}>
            Thêm
          </button>
        </div>
        {error && <div className="preset-error">{error}</div>}

        <div className="readings-table-wrap">
          {list.length === 0 ? (
            <p className="empty">Chưa có từ nào trong từ điển.</p>
          ) : (
            <table className="readings-table">
              <thead>
                <tr>
                  <th>Từ</th>
                  <th>Cách đọc</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {list.map((it) => (
                  <tr key={it.word}>
                    <td><strong>{it.word}</strong></td>
                    <td>{it.kana}</td>
                    <td>
                      <button
                        className="ghost danger"
                        disabled={disabled}
                        onClick={() => removeEntry(it.word)}
                        title="Xóa từ"
                      >
                        ✕
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        <div className="modal-actions" style={{ justifyContent: "space-between" }}>
          <button
            className="ghost"
            onClick={handleApply}
            disabled={disabled || list.length === 0}
            title="Thêm {かな} cho các từ xuất hiện trong kịch bản"
          >
            Áp dụng vào kịch bản hiện tại
          </button>
          <button onClick={onClose} autoFocus>
            Đóng
          </button>
        </div>
      </div>
    </div>
  );
}
