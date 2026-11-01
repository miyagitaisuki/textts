// Tự cập nhật bản portable từ GitHub Releases.
// electron-updater chỉ dùng để đọc latest.yml (phiên bản mới nhất). electron-updater không hỗ trợ
// cài đặt cho bản portable, nên việc tải và thay file exe được làm ở đây:
//   1. tải exe mới từ GitHub Release về thư mục tạm;
//   2. sau khi người dùng đồng ý, một script .bat đợi app thoát, chép đè exe, rồi mở lại app.
// electron-builder đặt biến PORTABLE_EXECUTABLE_FILE trỏ tới file exe đang chạy.
const { app, dialog, shell } = require("electron");
const fs = require("fs");
const os = require("os");
const path = require("path");
const https = require("https");
const { spawn } = require("child_process");

const { updateErrorText, compareVersions, writeSwapScript } = require("./update-utils.cjs");

const REPO = { owner: "miyagitaisuki", repo: "textts" };
const RELEASES_URL = `https://github.com/${REPO.owner}/${REPO.repo}/releases`;

// Chuyển lỗi kỹ thuật thành câu tiếng Việt cho người dùng cuối.

// So sánh phiên bản theo số chính, phụ, vá: "newer" | "same" | "older".

// Tải file theo chuyển hướng của GitHub (302 tới objects.githubusercontent.com).
function download(url, dest, onProgress, redirects = 5) {
  return new Promise((resolve, reject) => {
    https.get(url, { headers: { "User-Agent": "textts-updater" } }, (res) => {
      if (res.statusCode >= 300 && res.statusCode < 400 && res.headers.location && redirects > 0) {
        res.resume();
        return resolve(download(res.headers.location, dest, onProgress, redirects - 1));
      }
      if (res.statusCode !== 200) {
        res.resume();
        return reject(new Error(`HTTP ${res.statusCode}`));
      }
      const total = Number(res.headers["content-length"]) || 0;
      let got = 0;
      const file = fs.createWriteStream(dest);
      let lastStep = -1;
      res.on("data", (c) => {
        got += c.length;
        if (!total) return;
        const step = Math.floor((got / total) * 4) * 25; // báo mỗi 25%
        if (step !== lastStep) {
          lastStep = step;
          onProgress?.(step);
        }
      });
      res.pipe(file);
      file.on("finish", () => file.close(() => resolve(dest)));
      file.on("error", reject);
      res.on("error", reject);
    }).on("error", reject);
  });
}

// Script .bat: đợi tiến trình hiện tại thoát, chép đè exe, mở lại, rồi tự xóa.

let pendingUpdate = null; // {version, url, file} sau khi đã tải xong
let busy = false;

// Gọi electron-updater để lấy phiên bản mới nhất từ latest.yml trên GitHub.
async function fetchLatest() {
  const { autoUpdater } = require("electron-updater");
  autoUpdater.autoDownload = false;
  autoUpdater.autoInstallOnAppQuit = false;
  const result = await autoUpdater.checkForUpdates();
  const info = result?.updateInfo;
  if (!info?.version) return null;
  const file = info.files?.find((f) => f.url.endsWith(".exe")) ?? { url: info.path };
  const url = `https://github.com/${REPO.owner}/${REPO.repo}/releases/download/v${info.version}/${file.url}`;
  return { version: info.version, url };
}

// Kiểm tra và (nếu có bản mới) tải trong nền, rồi hỏi người dùng có muốn cài không.
async function checkNow(win, log = () => {}) {
  if (!app.isPackaged) {
    return { ok: false, message: "Chỉ kiểm tra cập nhật trong bản đã đóng gói." };
  }
  if (busy) return { ok: true, message: "Đang tải bản cập nhật, vui lòng đợi." };
  if (pendingUpdate) return askInstall(win);
  busy = true;
  try {
    const latest = await fetchLatest();
    if (!latest || compareVersions(latest.version, app.getVersion()) !== "newer") {
      return { ok: true, message: `Đang dùng bản mới nhất (${app.getVersion()}).` };
    }
    const dest = path.join(os.tmpdir(), `textts-${latest.version}.exe`);
    log(`Có bản ${latest.version}, đang tải…`);
    await download(latest.url, dest, (p) => log(`Đang tải bản cập nhật: ${p}%`));
    pendingUpdate = { version: latest.version, file: dest };
    return askInstall(win);
  } catch (err) {
    return { ok: false, message: updateErrorText(err) };
  } finally {
    busy = false;
  }
}

async function askInstall(win) {
  const { version } = pendingUpdate;
  const portablePath = process.env.PORTABLE_EXECUTABLE_FILE;
  if (!portablePath) {
    // Không phải bản portable (ví dụ bản thư mục): mở trang tải về thay vì tự thay file.
    shell.openExternal(RELEASES_URL);
    return { ok: true, message: `Đã mở trang tải bản ${version}.` };
  }
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    buttons: ["Cập nhật và mở lại", "Để sau"],
    defaultId: 0,
    cancelId: 1,
    title: "Có bản cập nhật",
    message: `Đã tải phiên bản ${version}.`,
    detail: "Ứng dụng sẽ đóng, thay bằng bản mới rồi mở lại. Lưu các thay đổi chưa lưu trước khi tiếp tục.",
  });
  if (response !== 0) return { ok: true, message: `Bản ${version} sẽ được cài ở lần mở sau.` };
  const script = writeSwapScript(pendingUpdate.file, portablePath, process.pid);
  spawn("cmd.exe", ["/c", script], { detached: true, stdio: "ignore", windowsHide: true }).unref();
  app.quit();
  return { ok: true, message: `Đang cập nhật lên ${version}…` };
}

// Kiểm tra tự động một lần khi mở app (không làm phiền nếu không có mạng).
function setupUpdater(win, log = () => {}) {
  if (!app.isPackaged) return;
  checkNow(win, log).then((res) => {
    if (res.message && !res.ok) log(res.message);
  });
}

module.exports = { setupUpdater, checkNow };
