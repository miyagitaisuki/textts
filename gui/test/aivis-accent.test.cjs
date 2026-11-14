const test = require("node:test");
const assert = require("node:assert/strict");
const { fetchAccentPhrases, simplifyPhrases } = require("../electron/aivis-accent.cjs");

test("rút gọn accent_phrases của engine", () => {
  const out = simplifyPhrases([{ moras: [{ text: "コ" }, { text: "ン" }], accent: 1, pause_mora: null }]);
  assert.deepEqual(out, [{ moras: ["コ", "ン"], accent: 1 }]);
});

test("gọi POST /accent_phrases với text và speaker", async () => {
  let called;
  const fetchImpl = async (url, opts) => {
    called = { url, opts };
    return { ok: true, json: async () => [{ moras: [{ text: "ア" }], accent: 0 }] };
  };
  const res = await fetchAccentPhrases({ url: "http://127.0.0.1:10101/", text: "あ", speaker: 5, fetchImpl });
  assert.equal(res.ok, true);
  assert.deepEqual(res.phrases, [{ moras: ["ア"], accent: 0 }]);
  assert.equal(called.opts.method, "POST");
  assert.match(called.url, /^http:\/\/127\.0\.0\.1:10101\/accent_phrases\?text=%E3%81%82&speaker=5$/);
});

test("engine không chạy: báo offline, không ném lỗi", async () => {
  const fetchImpl = async () => {
    const e = new TypeError("fetch failed");
    e.cause = { code: "ECONNREFUSED" };
    throw e;
  };
  const res = await fetchAccentPhrases({ url: "http://127.0.0.1:1", text: "あ", speaker: 1, fetchImpl });
  assert.deepEqual(res, { ok: false, offline: true, error: "AivisSpeech chưa chạy" });
});

test("câu trống: không gọi engine", async () => {
  const res = await fetchAccentPhrases({ url: "x", text: "  ", speaker: 1, fetchImpl: () => assert.fail() });
  assert.deepEqual(res, { ok: true, phrases: [] });
});

const { resolveStyle, _resetSpeakersCache } = require("../electron/aivis-accent.cjs");

const SPEAKERS = [
  { name: "jvnv-F1", styles: [{ name: "ノーマル", id: 100 }, { name: "幸せ", id: 101 }, { name: "怒り", id: 103 }] },
  { name: "jvnv-M1", styles: [{ name: "ノーマル", id: 200 }] },
];

test("chọn style cảm xúc cùng nhân vật như Python _resolve_style", () => {
  assert.equal(resolveStyle(SPEAKERS, "100", "happy"), "101");
  assert.equal(resolveStyle(SPEAKERS, 100, "angry"), "103");
  assert.equal(resolveStyle(SPEAKERS, "100", "sad"), "100"); // không có style 悲しみ: giữ giọng gốc
  assert.equal(resolveStyle(SPEAKERS, "200", "happy"), "200");
  assert.equal(resolveStyle(SPEAKERS, "999", "happy"), "999"); // giọng lạ: giữ nguyên
});

test("có cảm xúc: tra /speakers rồi gọi /accent_phrases bằng style cảm xúc", async () => {
  _resetSpeakersCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    if (url.endsWith("/speakers")) return { ok: true, json: async () => SPEAKERS };
    return { ok: true, json: async () => [] };
  };
  const res = await fetchAccentPhrases({ url: "http://e", text: "あ", speaker: "100", emotion: "happy", fetchImpl });
  assert.equal(res.style, "101");
  assert.deepEqual(calls.map((u) => u.replace(/\?.*/, "")), ["http://e/speakers", "http://e/accent_phrases"]);
  assert.match(calls[1], /speaker=101$/);

  // Lần sau dùng lại danh sách nhân vật đã tải
  calls.length = 0;
  await fetchAccentPhrases({ url: "http://e", text: "い", speaker: "100", emotion: "angry", fetchImpl });
  assert.deepEqual(calls.map((u) => u.replace(/\?.*/, "")), ["http://e/accent_phrases"]);
  assert.match(calls[0], /speaker=103$/);
});

test("neutral: không cần tra /speakers", async () => {
  _resetSpeakersCache();
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return { ok: true, json: async () => [] };
  };
  await fetchAccentPhrases({ url: "http://e", text: "あ", speaker: "100", emotion: "neutral", fetchImpl });
  assert.equal(calls.length, 1);
  assert.match(calls[0], /accent_phrases\?.*speaker=100$/);
});
