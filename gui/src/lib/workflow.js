// Logic thuần cho thanh "quy trình" và trạng thái nút Tạo âm thanh. Không phụ thuộc React.

export const WORKFLOW_STEPS = [
  { key: "import", label: "Nhập kịch bản", hint: "Mở file .txt hoặc dán nội dung" },
  { key: "edit", label: "Chỉnh vai & câu", hint: "Chọn giọng, sửa chữ và cách đọc" },
  { key: "generate", label: "Tạo âm thanh", hint: "Xuất MP3/WAV và phụ đề" },
  { key: "listen", label: "Nghe & dùng", hint: "Mở thư mục để lấy file" },
];

/**
 * Bước hiện tại (1-4), tức là việc tiếp theo người dùng cần làm.
 * 1: chưa có câu thoại · 2: có câu, chưa tạo âm thanh
 * 3: đã tạo nhưng đã sửa sau đó (cần tạo lại) · 4: bản xuất còn mới
 */
export function getWorkflowStep({ hasProject, lineCount = 0, hasOutput = false, outputStale = false }) {
  if (!hasProject || lineCount === 0) return 1;
  if (!hasOutput) return 2;
  if (outputStale) return 3;
  return 4;
}

/**
 * Lý do nút "Tạo âm thanh" đang bị khóa, để hiện cho người dùng biết cần làm gì.
 * Trả về chuỗi rỗng khi nút được phép bấm.
 */
export function generateBlockReason({ hasProject, lineCount = 0, busy = false }) {
  if (busy) return "Đang xử lý, vui lòng đợi";
  if (!hasProject) return "Hãy mở hoặc nhập kịch bản trước";
  if (lineCount === 0) return "Kịch bản chưa có câu thoại nào";
  return "";
}

/** Gợi ý ngắn cho bước hiện tại, hiển thị dưới thanh quy trình. */
export function stepGuidance(step, { dirty = false } = {}) {
  switch (step) {
    case 1:
      return "Bắt đầu: mở file kịch bản .txt, hoặc bấm “Dán văn bản” rồi dán nội dung.";
    case 2:
      return dirty
        ? "Bạn có thay đổi chưa lưu. Bấm “Lưu” (Ctrl+S) rồi “Tạo âm thanh”."
        : "Kiểm tra vai và câu thoại bên dưới, rồi bấm “Tạo âm thanh”.";
    case 3:
      return "Bạn đã sửa sau lần tạo gần nhất. Bấm “Tạo âm thanh” để cập nhật file.";
    default:
      return "Xong. Bấm “▶ Nghe” trên từng câu, hoặc “Mở thư mục dự án” để lấy file.";
  }
}
