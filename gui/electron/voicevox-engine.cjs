// Tự khởi động VOICEVOX ENGINE đi kèm bộ cài (resources/voicevox/run.exe) và tắt khi thoát app.
// Không tách phần dùng Electron ở đây: mọi phụ thuộc (ping, spawn, log, sleep) được truyền vào để kiểm thử được.
const path = require("path");
const fs = require("fs");
const { spawnSync } = require("child_process");

const DEFAULT_PORT = 50021;
const READY_TIMEOUT_MS = 60_000;
const POLL_INTERVAL_MS = 1_000;

// Trả về đường dẫn run.exe nếu bộ cài có kèm engine, ngược lại null (ví dụ khi chạy từ mã nguồn).
function resolveEngineExe(resourcesDir) {
  const exe = path.join(resourcesDir, "voicevox", "run.exe");
  return fs.existsSync(exe) ? exe : null;
}

// Cổng lấy từ URL (mặc định 50021). Trả về số cổng hợp lệ hoặc DEFAULT_PORT.
function portFromUrl(url) {
  try {
    const port = Number(new URL(url).port);
    return Number.isInteger(port) && port > 0 ? port : DEFAULT_PORT;
  } catch {
    return DEFAULT_PORT;
  }
}

// Chờ /version phản hồi. Dừng sớm nếu tiến trình đã thoát. Trả về true khi sẵn sàng.
async function waitUntilReady({ ping, versionUrl, isAlive, sleep, timeoutMs, intervalMs }) {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (!isAlive()) return false;
    if (await ping(versionUrl)) return true;
    await sleep(intervalMs);
  }
  return false;
}

// Khởi động engine nếu chưa có ai chạy ở URL đó.
// Trả về { ready, managed, child }: managed = true khi chính textts khởi động (sẽ được tắt khi thoát).
async function startEngine({
  url,
  exe,
  ping,
  spawn,
  log,
  onSpawn,
  sleep = (ms) => new Promise((r) => setTimeout(r, ms)),
  timeoutMs = READY_TIMEOUT_MS,
  intervalMs = POLL_INTERVAL_MS,
}) {
  const versionUrl = `${url}/version`;
  if (await ping(versionUrl)) {
    log("INFO", "VOICEVOX đã chạy sẵn, textts sẽ không tắt engine này khi thoát");
    return { ready: true, managed: false, child: null };
  }
  if (!exe) return { ready: false, managed: false, child: null };

  const port = portFromUrl(url);
  let alive = true;
  let child;
  try {
    child = spawn(exe, ["--host", "127.0.0.1", "--port", String(port)], {
      cwd: path.dirname(exe),
      windowsHide: true,
      stdio: ["ignore", "pipe", "pipe"],
    });
  } catch (err) {
    log("ERROR", `[VOICEVOX] Không khởi động được run.exe: ${err.message}`);
    return { ready: false, managed: false, child: null };
  }
  // Báo ngay khi đã spawn để app có thể tắt engine kể cả khi thoát lúc đang chờ sẵn sàng.
  onSpawn?.(child);

  child.stdout?.on("data", (chunk) => log("INFO", `[VOICEVOX] ${chunk.toString().trim()}`));
  child.stderr?.on("data", (chunk) => log("ERROR", `[VOICEVOX] ${chunk.toString().trim()}`));
  child.on("error", (err) => {
    alive = false;
    log("ERROR", `[VOICEVOX] Lỗi tiến trình: ${err.message}`);
  });
  child.on("exit", (code) => {
    alive = false;
    log("INFO", `[VOICEVOX] Tiến trình kết thúc (mã ${code})`);
  });

  const ready = await waitUntilReady({
    ping,
    versionUrl,
    isAlive: () => alive,
    sleep,
    timeoutMs,
    intervalMs,
  });
  if (ready) {
    log("INFO", `VOICEVOX đã sẵn sàng tại ${url}`);
  } else {
    log("ERROR", `VOICEVOX chưa phản hồi tại ${url} sau ${Math.round(timeoutMs / 1000)} giây`);
  }
  return { ready, managed: true, child };
}

// Tắt engine do textts khởi động (cả cây tiến trình trên Windows). Đồng bộ để chắc chắn chạy xong trước khi app thoát.
function stopEngine(engine, { platform = process.platform, exec = spawnSync } = {}) {
  const child = engine?.child;
  if (!engine?.managed || !child || child.exitCode !== null || child.signalCode !== null) return;
  try {
    if (platform === "win32") {
      exec("taskkill", ["/pid", String(child.pid), "/T", "/F"], { windowsHide: true });
    } else {
      child.kill();
    }
  } catch {
    // Bỏ qua lỗi khi thoát
  }
}

module.exports = { resolveEngineExe, portFromUrl, waitUntilReady, startEngine, stopEngine, DEFAULT_PORT };
