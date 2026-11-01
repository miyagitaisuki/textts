// Chuyển thông báo lỗi Python thô thành gợi ý cài đặt bằng tiếng Việt (hàm thuần, dễ kiểm thử).

// Tên module Python -> tên gói pip (chỉ các gói trong requirements.txt có tên module khác tên gói).
const MODULE_TO_PACKAGE = {
  yaml: "pyyaml",
  edge_tts: "edge-tts",
  pyopenjtalk: "pyopenjtalk",
  pyloudnorm: "pyloudnorm",
  pydub: "pydub",
  numpy: "numpy",
  pydantic: "pydantic",
  tenacity: "tenacity",
};

// Trả về thông báo gợi ý nếu log có ModuleNotFoundError, nếu không thì trả về log gốc.
function friendlyPythonError(log, pythonCmd) {
  const text = String(log ?? "").trim();
  const match = text.match(/ModuleNotFoundError: No module named '([^'.]+)/);
  if (!match) return text;
  const moduleName = match[1];
  const pkg = MODULE_TO_PACKAGE[moduleName] ?? moduleName;
  return (
    `Python (${pythonCmd}) chưa cài thư viện "${moduleName}".\n` +
    `Hãy cài đủ thư viện bằng lệnh:\n` +
    `    ${pythonCmd} -m pip install -r requirements.txt\n` +
    `(chạy trong thư mục mã nguồn textts; hoặc chỉ cài gói "${pkg}").\n` +
    `Nếu máy có nhiều Python, đặt biến môi trường TEXTTS_PYTHON trỏ đến Python đã cài thư viện.`
  );
}

module.exports = { friendlyPythonError };
