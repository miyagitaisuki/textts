// Thanh trạng thái dưới cùng (như Premiere/Audition): trạng thái lưu, số câu, thời lượng, engine, nơi lưu.
export default function StatusBar({ dirty, hasProject, lineCount, durationMs, engineLabel, engineOk, outputRoot, isPreview, onOpenPalette, onChooseOutputRoot }) {
  const dur = durationMs ? `${(durationMs / 1000).toFixed(1)} s` : "—";
  return (
    <footer className="status-bar" role="status">
      {hasProject ? (
        <span className={`sb-item ${dirty ? "sb-dirty" : "sb-ok"}`}>{dirty ? "● Chưa lưu" : "✓ Đã lưu"}</span>
      ) : (
        <span className="sb-item">Chưa mở dự án</span>
      )}
      {hasProject && <span className="sb-item">{lineCount} câu thoại</span>}
      {hasProject && <span className="sb-item">Thời lượng: {dur}{isPreview ? " (bản nghe thử)" : ""}</span>}
      {engineLabel && (
        <span className="sb-item" title={engineOk ? "Engine đang chạy" : "Engine chưa bật"}>
          <span className={`status-dot ${engineOk ? "dot-green" : "dot-yellow"}`} /> {engineLabel}
        </span>
      )}
      <span className="sb-spacer" />
      <button type="button" className="sb-item" onClick={onChooseOutputRoot} title={`Thư mục xuất: ${outputRoot || "chưa chọn"} — nhấp để đổi`}>
        Lưu tại: {outputRoot || "chưa chọn"}
      </button>
      <button type="button" className="sb-item" onClick={onOpenPalette} title="Tìm mọi thao tác">
        Bảng lệnh <kbd>Ctrl+K</kbd>
      </button>
    </footer>
  );
}
