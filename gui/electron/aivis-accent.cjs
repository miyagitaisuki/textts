// Lấy cụm accent của một câu từ AivisSpeech Engine (/accent_phrases), rút gọn cho panel accent:
// [{ moras: ["コ", "ン", ...], accent: 3 }, ...]. Gọi thẳng engine để panel phản hồi nhanh.

const TIMEOUT_MS = 8000;

function simplifyPhrases(phrases) {
  if (!Array.isArray(phrases)) throw new Error("Engine trả về dữ liệu không hợp lệ");
  return phrases.map((p) => ({
    moras: (p.moras || []).map((m) => m.text || ""),
    accent: Number(p.accent) || 0,
  }));
}

async function fetchAccentPhrases({ url, text, speaker, fetchImpl = fetch, timeoutMs = TIMEOUT_MS }) {
  if (!text || !String(text).trim()) return { ok: true, phrases: [] };
  const qs = new URLSearchParams({ text: String(text), speaker: String(speaker) });
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), timeoutMs);
  try {
    const res = await fetchImpl(`${url.replace(/\/$/, "")}/accent_phrases?${qs}`, {
      method: "POST",
      signal: ctrl.signal,
    });
    if (!res.ok) return { ok: false, error: `AivisSpeech trả lỗi HTTP ${res.status}` };
    return { ok: true, phrases: simplifyPhrases(await res.json()) };
  } catch (e) {
    const offline = e?.name === "AbortError" || /ECONNREFUSED|fetch failed/i.test(String(e?.cause?.code || e?.message));
    return { ok: false, offline, error: offline ? "AivisSpeech chưa chạy" : String(e?.message || e) };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { fetchAccentPhrases, simplifyPhrases };
