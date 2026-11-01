// Thanh menu: mục Trợ giúp có "Báo lỗi…" mở thư mục nhật ký để người dùng gửi kèm khi báo lỗi.
const { app, dialog, Menu, shell, clipboard } = require("electron");
const { getLogDir, getLogFile, log } = require("./logger.cjs");

async function showBugReport(win) {
  const dir = getLogDir();
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    buttons: ["Mở thư mục nhật ký", "Sao chép đường dẫn", "Đóng"],
    defaultId: 0,
    cancelId: 2,
    title: "Báo lỗi",
    message: "Gửi kèm file nhật ký khi báo lỗi.",
    detail: `File nhật ký: ${getLogFile()}\n\nMở thư mục, lấy file textts.log (và textts.log.1 nếu có) rồi đính kèm vào báo lỗi.`,
  });
  if (response === 0) {
    const err = await shell.openPath(dir);
    if (err) log("ERROR", `Không mở được thư mục nhật ký: ${err}`);
  } else if (response === 1) {
    clipboard.writeText(getLogFile());
  }
}

function buildMenu({ getWindow, onCheckUpdates }) {
  const template = [
    {
      label: "Trợ giúp",
      submenu: [
        { label: "Báo lỗi…", click: () => showBugReport(getWindow()) },
        { label: "Mở thư mục nhật ký", click: async () => {
          const err = await shell.openPath(getLogDir());
          if (err) log("ERROR", `Không mở được thư mục nhật ký: ${err}`);
        } },
        { type: "separator" },
        { label: "Kiểm tra cập nhật", click: () => onCheckUpdates() },
        { type: "separator" },
        { label: `Giới thiệu (phiên bản ${app.getVersion()})`, enabled: false },
      ],
    },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

module.exports = { buildMenu, showBugReport };
