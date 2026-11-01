// Sinh release/latest.yml cho bản portable. electron-builder không tạo file này cho target portable,
// nhưng electron-updater cần nó để biết phiên bản mới nhất trên GitHub Releases.
const fs = require("fs");
const path = require("path");
const crypto = require("crypto");

const releaseDir = path.join(__dirname, "..", "release");
const pkg = JSON.parse(fs.readFileSync(path.join(__dirname, "..", "package.json"), "utf-8"));
const file = `textts-${pkg.version}-portable.exe`;
const filePath = path.join(releaseDir, file);
if (!fs.existsSync(filePath)) {
  console.error(`Không thấy ${filePath}. Hãy build bản portable trước.`);
  process.exit(1);
}
const data = fs.readFileSync(filePath);
const sha512 = crypto.createHash("sha512").update(data).digest("base64");
const yml = [
  `version: ${pkg.version}`,
  "files:",
  `  - url: ${file}`,
  `    sha512: ${sha512}`,
  `    size: ${data.length}`,
  `path: ${file}`,
  `sha512: ${sha512}`,
  `releaseDate: '${new Date().toISOString()}'`,
  "",
].join("\n");
fs.writeFileSync(path.join(releaseDir, "latest.yml"), yml);
console.log(`Đã ghi latest.yml cho ${file}`);
