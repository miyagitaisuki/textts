// Thanh menu: mục Trợ giúp có "Báo lỗi…". Không dùng token: mở trang tạo issue trên GitHub
// với nội dung đã điền sẵn; người dùng xem lại rồi tự bấm gửi.
const fs = require("fs");
const { app, dialog, Menu, shell, clipboard } = require("electron");
const { getLogDir, getLogFile, log } = require("./logger.cjs");

const ISSUES_URL = "https://github.com/miyagitaisuki/textts/issues/new";
// Trình duyệt giới hạn độ dài URL: chỉ đính kèm phần cuối của nhật ký trong trang tạo issue.
const MAX_LOG_CHARS_IN_URL = 2000;

function readLogTail() {
  try {
    const text = fs.readFileSync(getLogFile(), "utf-8");
    return text.slice(-MAX_LOG_CHARS_IN_URL);
  } catch {
    return "(chưa có nhật ký)";
  }
}

function buildIssueUrl() {
  const body = [
    "**Mô tả lỗi** (làm gì thì xảy ra lỗi, mong đợi điều gì):",
    "",
    "",
    "**Môi trường**",
    `- textts ${app.getVersion()}`,
    `- ${process.platform} ${process.arch}`,
    "",
    "**Nhật ký gần đây** (đính kèm đủ file `textts.log` nếu có thể — kéo thả file vào ô bên dưới):",
    "```",
    readLogTail(),
    "```",
  ].join("\n");
  const params = new URLSearchParams({ title: "[Lỗi] ", body });
  return `${ISSUES_URL}?${params.toString()}`;
}

async function showBugReport(win) {
  const { response } = await dialog.showMessageBox(win, {
    type: "info",
    buttons: ["Gửi lỗi trên GitHub", "Mở thư mục nhật ký", "Sao chép đường dẫn", "Đóng"],
    defaultId: 0,
    cancelId: 3,
    title: "Báo lỗi",
    message: "Gửi lỗi cho người phát triển",
    detail: `Trình duyệt sẽ mở trang tạo issue đã điền sẵn mô tả và phần cuối nhật ký. Nhật ký có thể chứa đường dẫn trên máy bạn. Hãy kiểm tra trước khi bấm gửi.\n\nFile nhật ký đầy đủ: ${getLogFile()}`,
  });
  if (response === 0) {
    await shell.openExternal(buildIssueUrl());
  } else if (response === 1) {
    const err = await shell.openPath(getLogDir());
    if (err) log("ERROR", `Không mở được thư mục nhật ký: ${err}`);
  } else if (response === 2) {
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

module.exports = { buildMenu, showBugReport, buildIssueUrl };
