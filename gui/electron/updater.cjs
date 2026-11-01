// Tự cập nhật theo luồng chuẩn của electron-updater (bản cài NSIS, phát hành trên GitHub Releases).
// Khi mở app và khi bấm "Kiểm tra cập nhật": tải bản mới trong nền. Khi tải xong, hỏi người dùng;
// nếu đồng ý thì quitAndInstall() chạy bộ cài đặt im lặng và mở lại app.
const { app, dialog } = require("electron");
const { updateErrorText } = require("./update-utils.cjs");
const logger = require("./logger.cjs");

let autoUpdater = null;
let listening = false;
let readyToInstall = false;

// Nhật ký của electron-updater đi vào cùng file textts.log.
function getUpdater() {
  if (!autoUpdater) {
    ({ autoUpdater } = require("electron-updater"));
    autoUpdater.autoDownload = true;
    autoUpdater.autoInstallOnAppQuit = false; // chỉ cài khi người dùng đồng ý
    autoUpdater.logger = {
      info: (m) => logger.log("INFO", `[updater] ${m}`),
      warn: (m) => logger.log("WARN", `[updater] ${m}`),
      error: (m) => logger.log("ERROR", `[updater] ${m}`),
      debug: () => {},
    };
  }
  return autoUpdater;
}

// Gắn sự kiện một lần khi khởi động. win: cửa sổ chính để gắn hộp thoại; log: ghi thông báo lên giao diện.
function setupUpdater(win, log = () => {}) {
  if (!app.isPackaged) return;
  const updater = getUpdater();
  if (!listening) {
    listening = true;
    updater.on("update-downloaded", async (info) => {
      readyToInstall = true;
      log(`Đã tải xong bản ${info.version}.`);
      const { response } = await dialog.showMessageBox(win, {
        type: "info",
        buttons: ["Khởi động lại và cập nhật", "Để sau"],
        defaultId: 0,
        cancelId: 1,
        title: "Có bản cập nhật",
        message: `Đã tải phiên bản ${info.version}.`,
        detail: "Ứng dụng sẽ đóng, cài bản mới rồi mở lại. Lưu các thay đổi chưa lưu trước khi tiếp tục.",
      });
      if (response === 0) updater.quitAndInstall();
    });
    updater.on("error", (err) => log(updateErrorText(err)));
  }
  updater.checkForUpdates().catch((err) => log(updateErrorText(err)));
}

// Kiểm tra bấm tay (menu hoặc nút). Trả về thông báo để hiển thị.
async function checkNow(log = () => {}) {
  if (!app.isPackaged) {
    return { ok: false, message: "Chỉ kiểm tra cập nhật trong bản đã cài đặt." };
  }
  if (readyToInstall) return { ok: true, message: "Bản mới đã tải xong. Hãy khởi động lại để cập nhật." };
  try {
    const result = await getUpdater().checkForUpdates();
    if (!result?.isUpdateAvailable) {
      return { ok: true, message: `Đang dùng bản mới nhất (${app.getVersion()}).` };
    }
    log(`Có bản ${result.updateInfo.version}, đang tải…`);
    return { ok: true, message: `Có bản ${result.updateInfo.version}, đang tải trong nền…` };
  } catch (err) {
    return { ok: false, message: updateErrorText(err) };
  }
}

module.exports = { setupUpdater, checkNow };
