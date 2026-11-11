// Ngân hàng giọng: ghi chú của giáo viên cho từng giọng (biệt danh, giới tính, tuổi, chất giọng...)
// để chọn vai nhanh và để AI đọc mà chọn giọng hợp vai. Lưu ở <userData>/voice-bank.json:
// { voices: { "<engine>:<mã giọng>": { label, nickname, gender, age, styles: [], description, favorite, hidden } } }
// và xuất GIONG.md (mục lục dạng văn bản cho AI). Không dùng Electron ở đây để kiểm thử được.
const fs = require("fs");
const path = require("path");

const ENGINES = new Set(["edge", "voicevox", "aivis"]);
const GENDERS = new Set(["", "nam", "nữ"]);
const ENGINE_LABELS = { edge: "Edge TTS", voicevox: "VOICEVOX", aivis: "AivisSpeech" };

const file = (dir) => path.join(dir, "voice-bank.json");

function readBank(dir) {
  try {
    const data = JSON.parse(fs.readFileSync(file(dir), "utf-8"));
    return { voices: data && typeof data.voices === "object" ? data.voices : {} };
  } catch {
    return { voices: {} };
  }
}

function writeBank(dir, bank) {
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(file(dir), JSON.stringify(bank, null, 2) + "\n", "utf-8");
  writeCatalog(dir, bank);
}

const list = (v) =>
  (Array.isArray(v) ? v : String(v ?? "").split(/[,、，]/)).map((x) => String(x).trim()).filter(Boolean);

const MULTI = ["tone", "personality", "suits"];

function cleanMeta(meta = {}, label = "") {
  const age = meta.age === "" || meta.age === null || meta.age === undefined ? null : Number(meta.age);
  const groups = Object.fromEntries(MULTI.map((k) => [k, [...new Set(list(meta[k]))]]));
  // Dữ liệu cũ chỉ có "styles" gõ tay: chuyển vào nhóm Tính cách để vẫn sửa được bằng menu.
  if (MULTI.every((k) => meta[k] === undefined)) groups.personality = [...new Set(list(meta.styles))];
  // styles = mọi giá trị đã chọn, để AI/tìm kiếm chỉ cần đọc một trường
  const styles = [...new Set(MULTI.flatMap((k) => groups[k]))];
  return {
    label: String(label || meta.label || ""),
    nickname: String(meta.nickname ?? "").trim(),
    gender: GENDERS.has(meta.gender) ? meta.gender : "",
    age: Number.isFinite(age) && age >= 0 && age <= 120 ? Math.round(age) : null,
    ...groups,
    styles,
    description: String(meta.description ?? "").trim(),
    favorite: Boolean(meta.favorite),
    hidden: Boolean(meta.hidden),
  };
}

function setVoice(dir, { engine, voice, label, meta }) {
  if (!ENGINES.has(engine)) throw new Error(`Engine không hợp lệ: ${engine}`);
  if (!String(voice ?? "").trim()) throw new Error("Thiếu mã giọng");
  const bank = readBank(dir);
  const key = `${engine}:${voice}`;
  bank.voices[key] = cleanMeta({ ...(bank.voices[key] || {}), ...meta }, label || bank.voices[key]?.label);
  writeBank(dir, bank);
  return bank;
}

// Ghi nhớ tên giọng hiện có của engine (để AI vẫn thấy giọng khi engine đang tắt). Không xóa ghi chú cũ.
function rememberLabels(dir, engine, voices = []) {
  if (!ENGINES.has(engine) || !voices.length) return readBank(dir);
  const bank = readBank(dir);
  let changed = false;
  for (const v of voices) {
    const key = `${engine}:${v.value}`;
    if (!bank.voices[key]) {
      bank.voices[key] = cleanMeta({}, v.label);
      changed = true;
    } else if (v.label && bank.voices[key].label !== v.label) {
      bank.voices[key].label = v.label;
      changed = true;
    }
  }
  if (changed) writeBank(dir, bank);
  return bank;
}

// Nhãn trong ô chọn giọng: ★ biệt danh — tên gốc (nữ, 8 tuổi, vui tươi). Yêu thích lên đầu, ẩn thì bỏ.
function decorateOptions(engine, voices, bank) {
  const out = [];
  for (const v of voices) {
    const m = bank.voices?.[`${engine}:${v.value}`];
    if (m?.hidden) continue;
    const bits = [m?.gender, m?.age !== null && m?.age !== undefined ? `${m.age} tuổi` : "", ...(m?.styles || [])].filter(Boolean);
    const name = m?.nickname ? `${m.nickname} — ${v.label}` : v.label;
    out.push({ ...v, label: `${m?.favorite ? "★ " : ""}${name}${bits.length ? ` (${bits.join(", ")})` : ""}`, favorite: Boolean(m?.favorite) });
  }
  return out.sort((a, b) => Number(b.favorite) - Number(a.favorite));
}

function writeCatalog(dir, bank = readBank(dir)) {
  const cell = (v) => String(v ?? "").replace(/\|/g, "/").replace(/\n/g, " ");
  const lines = [
    "# Ngân hàng giọng (textts)",
    "",
    "Dùng cột 'voice' làm mã giọng trong roles khi tạo bài (đúng engine). Chọn giọng hợp vai theo giới tính,",
    "tuổi và chất giọng; ưu tiên giọng ★ yêu thích. Không dùng giọng bị ẩn.",
    "",
  ];
  for (const engine of ENGINES) {
    const rows = Object.entries(bank.voices)
      .filter(([k, m]) => k.startsWith(`${engine}:`) && !m.hidden)
      .sort(([, a], [, b]) => Number(b.favorite) - Number(a.favorite));
    if (!rows.length) continue;
    lines.push(`## ${ENGINE_LABELS[engine]} (engine: ${engine})`, "", "| voice | Biệt danh | Tên gốc | Giới tính | Tuổi | Chất giọng | Mô tả |", "|---|---|---|---|---|---|---|");
    for (const [k, m] of rows) {
      const voice = k.slice(engine.length + 1);
      lines.push(
        `| ${cell(voice)} | ${m.favorite ? "★ " : ""}${cell(m.nickname)} | ${cell(m.label)} | ${cell(m.gender)} | ${m.age ?? ""} | ${cell((m.styles || []).join(", "))} | ${cell(m.description)} |`
      );
    }
    lines.push("");
  }
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, "GIONG.md"), lines.join("\n"), "utf-8");
}

module.exports = { readBank, setVoice, rememberLabels, decorateOptions, writeCatalog, cleanMeta };
