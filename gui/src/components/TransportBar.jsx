import { PlayIcon, PauseIcon, ChevronUpIcon, ChevronDownIcon, SlidersIcon } from "./Icons.jsx";

export default function TransportBar({
  isPlaying,
  currentTime = 0,
  duration = 0,
  onTogglePlay,
  onSeek,
  onGenerate,
  onPreviewAll,
  outputName = "",
  defaultOutputName = "",
  onOutputNameChange,
  isPreview = false,
  onOpenExport,
  onOpenOutputFolder,
  onChooseOutputRoot,
  outputRoot,
  busy,
  lineCount = 0,
  outputStale = false,
  timelineOpen,
  onToggleTimeline,
  lastLogLine,
}) {
  const formatTime = (secs) => {
    if (!Number.isFinite(secs) || secs < 0) secs = 0;
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60);
    const ms = Math.floor((secs % 1) * 10);
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}.${ms}`;
  };

  const progressPercent = duration > 0 ? Math.min(100, (currentTime / duration) * 100) : 0;

  return (
    <footer className="studio-transport-bar">
      {/* Trình phát âm thanh & Điều khiển phát */}
      <div className="transport-left">
        <button
          type="button"
          className="transport-play-btn"
          disabled={duration === 0 || busy}
          onClick={onTogglePlay}
          title={isPlaying ? "Tạm dừng (Phím Space)" : "Phát âm thanh (Phím Space)"}
        >
          {isPlaying ? <PauseIcon size={16} /> : <PlayIcon size={16} />}
        </button>

        <div className="transport-time-display">
          <span className="time-current">{formatTime(currentTime)}</span>
          <span className="time-divider">/</span>
          <span className="time-total">{formatTime(duration)}</span>
        </div>

        {/* Thanh trượt phát nhạc Scrubber */}
        <div className="transport-scrubber-wrap">
          <input
            type="range"
            min={0}
            max={duration || 1}
            step={0.05}
            value={currentTime || 0}
            disabled={duration === 0 || busy}
            className="transport-scrubber"
            onChange={(e) => onSeek?.(Number(e.target.value))}
          />
          <div className="scrubber-fill" style={{ width: `${progressPercent}%` }} />
        </div>

        <button
          type="button"
          className={`transport-timeline-toggle ${timelineOpen ? "active" : ""}`}
          onClick={onToggleTimeline}
          title={timelineOpen ? "Thu gọn thanh sóng âm Timeline" : "Mở rộng thanh sóng âm Timeline"}
        >
          <span>Sóng âm Timeline</span>
          {timelineOpen ? <ChevronDownIcon size={14} /> : <ChevronUpIcon size={14} />}
        </button>
      </div>

      {/* Trạng thái & Thao tác chính */}
      <div className="transport-right">
        {isPreview && !busy && (
          <span className="stale-pill preview-pill" title="Đang nghe bản thử: chưa ghi file nào. Bấm “Tạo & lưu” để lưu.">
            ● Bản nghe thử (chưa lưu)
          </span>
        )}

        {outputStale && (
          <span className="stale-pill" title="Kịch bản có thay đổi. Hãy tạo lại âm thanh để cập nhật">
            ● Bản nghe chưa cập nhật
          </span>
        )}

        {busy && (
          <span className="transport-busy-indicator" role="status">
            <span className="studio-spinner" />
            <span className="busy-text">{lastLogLine || "Đang tổng hợp..."}</span>
          </span>
        )}

        <button
          type="button"
          className="export-trigger-btn"
          disabled={busy}
          onClick={onOpenExport}
          title="Tùy chọn xuất file (SRT, MP3, Chậm 0.8x, Phiếu học tập)"
        >
          Tùy chọn xuất…
        </button>

        <label className="output-name-field" title="Tên file theo giáo trình, ví dụ 1-02 cho ♪1-02. Các file được lưu chung một thư mục mang tên này.">
          <span>Tên file</span>
          <input
            type="text"
            className="output-name-input"
            placeholder={defaultOutputName || "vd. 1-02"}
            value={outputName}
            disabled={busy}
            onChange={(e) => onOutputNameChange?.(e.target.value)}
            aria-label="Tên file xuất"
          />
        </label>

        <button
          type="button"
          className="export-trigger-btn"
          disabled={busy || lineCount === 0}
          onClick={onPreviewAll}
          title="Nghe thử toàn bài với thay đổi hiện tại, không ghi file nào"
        >
          ▶ Nghe thử toàn bài
        </button>

        <button
          type="button"
          className="generate-primary-btn"
          disabled={busy || lineCount === 0}
          onClick={onGenerate}
          title="Tạo và lưu file âm thanh vào thư mục riêng mang tên file (Ctrl+G)"
        >
          {busy ? "Đang xử lý…" : "Tạo & lưu"}
        </button>
      </div>
    </footer>
  );
}
