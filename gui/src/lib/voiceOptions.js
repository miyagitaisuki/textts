// Các lựa chọn có sẵn cho Ngân hàng giọng (chọn bằng menu, không phải gõ).
export const GENDERS = [
  ["", "— chưa chọn —"],
  ["nữ", "Nữ"],
  ["nam", "Nam"],
];

// Nhóm tuổi: lưu một số tuổi đại diện để AI so khớp được cả "8 tuổi" lẫn "trẻ con".
export const AGE_GROUPS = [
  { age: null, label: "— chưa chọn —" },
  { age: 5, label: "Mầm non (3–6)" },
  { age: 9, label: "Tiểu học (7–11)" },
  { age: 14, label: "Trung học (12–17)" },
  { age: 21, label: "Sinh viên (18–24)" },
  { age: 30, label: "Thanh niên (25–34)" },
  { age: 40, label: "Người lớn (35–49)" },
  { age: 55, label: "Trung niên (50–64)" },
  { age: 72, label: "Người già (65+)" },
];

export function ageGroupOf(age) {
  if (age === null || age === undefined || age === "") return AGE_GROUPS[0];
  const n = Number(age);
  // nhóm có tuổi đại diện gần nhất
  return AGE_GROUPS.slice(1).reduce((best, g) => (Math.abs(g.age - n) < Math.abs(best.age - n) ? g : best));
}

// Các mục chọn nhiều giá trị (có nút ＋ để thêm).
export const MULTI_FIELDS = [
  {
    key: "tone",
    label: "Chất giọng",
    options: ["trong trẻo", "cao", "trầm", "ấm áp", "dày", "mỏng", "khàn", "ngọt ngào", "mạnh mẽ", "nhẹ nhàng", "thì thầm", "rõ ràng", "nhanh", "chậm rãi"],
  },
  {
    key: "personality",
    label: "Tính cách / cảm xúc",
    options: ["vui tươi", "năng động", "dễ thương", "tinh nghịch", "hiền lành", "điềm tĩnh", "nghiêm túc", "lịch sự", "thân thiện", "tự tin", "rụt rè", "lạnh lùng", "nóng nảy", "buồn", "lo lắng", "hài hước"],
  },
  {
    key: "suits",
    label: "Vai phù hợp",
    options: ["trẻ con", "học sinh", "sinh viên", "giáo viên", "nhân viên", "khách hàng", "nhân viên bán hàng", "bác sĩ", "bố / mẹ", "ông / bà", "bạn bè", "sếp", "người kể chuyện", "phát thanh viên", "nhân vật hoạt hình"],
  },
];
