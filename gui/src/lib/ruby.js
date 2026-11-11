// Chú âm furigana trong văn bản hiển thị: 漢字{かな}, 漢字(かな) hoặc 漢字（かな）.
// Khớp với RUBY_RE trong core/parser.py.
const RUBY_SOURCE = "([一-鿿々]+)(?:\\{([぀-ヿー]+)\\}|[(（]([぀-ヿー]+)[)）])";

// Regex mới mỗi lần gọi (cờ g có trạng thái lastIndex).
export function rubyRegex(flags = "g") {
  return new RegExp(RUBY_SOURCE, flags);
}

export function hasRuby(text = "") {
  return rubyRegex("").test(text);
}

// Chuỗi gửi engine: chỉ giữ phần kana của mỗi chú âm.
export function toTtsText(display = "") {
  return display.replace(rubyRegex(), (_m, _base, a, b) => a || b);
}

// Tách văn bản thành các đoạn thường và đoạn chú âm { base, reading }.
export function splitRuby(text = "") {
  const re = rubyRegex();
  const parts = [];
  let last = 0;
  let m;
  while ((m = re.exec(text)) !== null) {
    if (m.index > last) parts.push(text.slice(last, m.index));
    parts.push({ base: m[1], reading: m[2] || m[3], index: m.index });
    last = re.lastIndex;
  }
  if (last < text.length) parts.push(text.slice(last));
  return parts;
}
