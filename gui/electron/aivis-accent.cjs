// Lấy cụm accent của một câu từ AivisSpeech Engine (/accent_phrases), rút gọn cho panel accent:
// [{ moras: ["コ", "ン", ...], accent: 3 }, ...]. Gọi thẳng engine để panel phản hồi nhanh.

const TIMEOUT_MS = 8000;

// Giống providers/aivis.py EMOTION_STYLE: cảm xúc -> tên style của nhân vật
const EMOTION_STYLE = {
  neutral: "ノーマル",
  happy: "幸せ",
  sad: "悲しみ",
  angry: "怒り",
  surprised: "驚き",
};

// Như _resolve_style bên Python: tìm nhân vật sở hữu style `voice`, lấy style cùng nhân vật
// mang tên cảm xúc; không có thì giữ nguyên `voice`.
function resolveStyle(speakers, voice, emotion) {
  const target = EMOTION_STYLE[emotion] || "ノーマル";
  for (const spk of speakers || []) {
    const styles = spk.styles || [];
    if (!styles.some((s) => String(s.id) === String(voice))) continue;
    const hit = styles.find((s) => s.name === target);
    return hit ? String(hit.id) : String(voice);
  }
  return String(voice);
}

let speakersCache = null; // { url, speakers }: /speakers ít đổi, chỉ tải lại khi không tìm thấy giọng

async function getSpeakers(url, fetchImpl, signal, voice) {
  const known = speakersCache?.url === url &&
    speakersCache.speakers.some((spk) => (spk.styles || []).some((s) => String(s.id) === String(voice)));
  if (known) return speakersCache.speakers;
  const res = await fetchImpl(`${url}/speakers`, { signal });
  if (!res.ok) return speakersCache?.url === url ? speakersCache.speakers : [];
  const speakers = await res.json();
  speakersCache = { url, speakers: Array.isArray(speakers) ? speakers : [] };
  return speakersCache.speakers;
}

function simplifyPhrases(phrases) {
  if (!Array.isArray(phrases)) throw new Error("Engine trả về dữ liệu không hợp lệ");
  return phrases.map((p) => ({
    moras: (p.moras || []).map((m) => m.text || ""),
    accent: Number(p.accent) || 0,
  }));
}

async function fetchAccentPhrases({ url, text, speaker, emotion = "neutral", fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  if (!text || !String(text).trim()) return { ok: true, phrases: [] };
  const base = url.replace(/\/$/, "");
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const style = emotion && emotion !== "neutral"
      ? resolveStyle(await getSpeakers(base, fetchImpl, ctrl.signal, speaker), speaker, emotion)
      : String(speaker);
    const qs = new URLSearchParams({ text: String(text), speaker: style });
    const res = await fetchImpl(`${base}/accent_phrases?${qs}`, {
      method: "POST",
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `AivisSpeech trả lỗi HTTP ${res.status}` };
    return { ok: true, phrases: simplifyPhrases(await res.json()), style };
  } catch (e) {
    const offline = e?.name === "AbortError" || /ECONNREFUSED|fetch failed/i.test(String(e?.cause?.code || e?.message));
    return { ok: false, offline, error: offline ? "AivisSpeech chưa chạy" : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

function _resetSpeakersCache() {
  speakersCache = null;
}

module.exports = { fetchAccentPhrases, simplifyPhrases, resolveStyle, _resetSpeakersCache };
