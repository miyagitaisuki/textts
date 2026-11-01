// Kiểm thử hàm thuần của bộ tự cập nhật (không cần Electron chạy thật).
const test = require("node:test");
const assert = require("node:assert/strict");
const { compareVersions, updateErrorText } = require("../electron/update-utils.cjs");

test("so sánh phiên bản theo số chính, phụ, vá", () => {
  assert.equal(compareVersions("0.2.0", "0.1.9"), "newer");
  assert.equal(compareVersions("0.1.10", "0.1.9"), "newer");
  assert.equal(compareVersions("0.1.0", "0.1.0"), "same");
  assert.equal(compareVersions("0.0.9", "0.1.0"), "older");
  assert.equal(compareVersions("1.0", "0.9.9"), "newer");
});

test("lỗi mạng hiển thị bằng tiếng Việt", () => {
  assert.match(updateErrorText(new Error("getaddrinfo ENOTFOUND github.com")), /Không kết nối/);
  assert.match(updateErrorText(new Error("bad yaml")), /Không kiểm tra được cập nhật: bad yaml/);
});

test("script thay exe đợi tiến trình cũ thoát rồi chép đè và mở lại", () => {
  const fs = require("node:fs");
  const { writeSwapScript } = require("../electron/update-utils.cjs");
  const script = writeSwapScript("C:\\tmp\\new.exe", "C:\\apps\\textts.exe", 4242);
  const text = fs.readFileSync(script, "utf-8");
  fs.rmSync(script, { force: true });
  assert.match(text, /PID eq 4242/);
  assert.match(text, /copy \/Y "C:\\tmp\\new\.exe" "C:\\apps\\textts\.exe"/);
  assert.match(text, /goto copy/);
  assert.match(text, /start "" "C:\\apps\\textts\.exe"/);
});

test("tải file theo chuyển hướng và báo lỗi khi HTTP không thành công", async () => {
  const http = require("node:http");
  const fs = require("node:fs");
  const os = require("node:os");
  const path = require("node:path");
  const { download } = require("../electron/update-utils.cjs");
  const server = http.createServer((req, res) => {
    if (req.url === "/old") { res.writeHead(302, { location: "/file" }); return res.end(); }
    if (req.url === "/file") { res.writeHead(200, { "content-length": 3 }); return res.end("abc"); }
    res.writeHead(404); res.end();
  });
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  const base = `http://127.0.0.1:${server.address().port}`;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "dl-test-"));
  try {
    const dest = path.join(dir, "a.exe");
    const progress = [];
    await download(`${base}/old`, dest, (p) => progress.push(p));
    assert.equal(fs.readFileSync(dest, "utf-8"), "abc");
    assert.ok(progress.length >= 1);
    await assert.rejects(download(`${base}/missing`, path.join(dir, "b.exe")), /HTTP 404/);
  } finally {
    server.close();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
