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
