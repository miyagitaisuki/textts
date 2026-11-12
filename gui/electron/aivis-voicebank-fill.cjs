// Tự điền giới tính/tuổi/tính cách cho các giọng AivisHub trong ngân hàng giọng (voice-bank.json),
// dựa trên catalog công khai của AivisHub (voice_timbre, tags, description). Chỉ điền trường còn
// trống, trừ khi overwrite=true; khớp giọng bằng tên gốc sau khi bỏ hậu tố kiểu nói "(...)".
const { readBank, setVoice } = require("./voice-bank.cjs");
const { fetchCatalog } = require("./aivis-install.cjs");

// voice_timbre của AivisHub -> [giới tính, tuổi ước lượng (trung điểm nhóm tuổi)].
const TIMBRE = {
  YoungFemale: ["nữ", 10],
  YoungMale: ["nam", 10],
  YouthfulFemale: ["nữ", 20],
  YouthfulMale: ["nam", 20],
  AdultFemale: ["nữ", 30],
  AdultMale: ["nam", 30],
  MiddleAgedFemale: ["nữ", 45],
  MiddleAgedMale: ["nam", 45],
  ElderlyFemale: ["nữ", 65],
  ElderlyMale: ["nam", 65],
};

// "まお (ノーマル)" -> "まお": bỏ hậu tố kiểu nói do engine thêm vào nhãn hiển thị.
function baseName(label = "") {
  return String(label).replace(/\s*[\(（][^)）]*[\)）]\s*$/, "").trim();
}

async function fillAivisVoiceBank({ dir, fetchImpl = fetch, catalog, overwrite = false, log = () => {} }) {
  const models = await (catalog ?? (() => fetchCatalog({ fetchImpl })))();
  const byName = new Map();
  for (const m of models) if (!byName.has(m.title)) byName.set(m.title, m);

  const bank = readBank(dir);
  let filled = 0;
  const unmatched = [];
  for (const [key, meta] of Object.entries(bank.voices)) {
    if (!key.startsWith("aivis:")) continue;
    const m = byName.get(baseName(meta.label));
    if (!m) {
      unmatched.push(meta.label);
      continue;
    }
    const [gender, age] = TIMBRE[m.voiceTimbre] ?? ["", null];
    const patch = {};
    if (overwrite || !meta.gender) patch.gender = gender;
    if (overwrite || meta.age === null || meta.age === undefined) patch.age = age;
    if ((overwrite || !(meta.personality ?? []).length) && m.tags?.length) patch.personality = m.tags;
    if ((overwrite || !meta.description) && m.description) patch.description = m.description.slice(0, 160);
    if (!Object.keys(patch).length) continue;
    setVoice(dir, { engine: "aivis", voice: key.slice("aivis:".length), meta: patch });
    filled += 1;
  }
  if (unmatched.length) {
    log("WARN", `[AivisSpeech] Không khớp được với catalog AivisHub: ${unmatched.join(", ")}`);
  }
  log("INFO", `[AivisSpeech] Đã tự điền giới tính/tuổi/tính cách cho ${filled} giọng`);
  return { filled, unmatched };
}

module.exports = { fillAivisVoiceBank, baseName, TIMBRE };
