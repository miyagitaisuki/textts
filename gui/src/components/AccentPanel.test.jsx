// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AccentPanel from "./AccentPanel.jsx";

const PHRASES = [
  { moras: ["オ", "ハ", "ヨ", "ウ"], accent: 0 },
  { moras: ["ゴ", "ザ", "イ", "マ", "ス"], accent: 4 },
];

const line = (attrs = {}) => ({ id: "L001", type: "line", role: "1", display: "おはようございます", attrs });

function renderPanel(props = {}) {
  const handlers = { onChangeAttrs: vi.fn(), onPreview: vi.fn(), onNotice: vi.fn() };
  render(<AccentPanel item={line()} engine="aivis" speaker="888753760" {...handlers} {...props} />);
  return handlers;
}

beforeEach(() => {
  window.textts = { getAccentPhrases: vi.fn().mockResolvedValue({ ok: true, phrases: PHRASES }) };
});
afterEach(() => {
  cleanup();
  delete window.textts;
});

describe("AccentPanel", () => {
  it("lấy cụm từ engine bằng chữ đọc và giọng của vai", async () => {
    renderPanel();
    await screen.findByText("ゴ");
    expect(window.textts.getAccentPhrases).toHaveBeenCalledWith("おはようございます", "888753760");
    expect(screen.getAllByRole("button", { pressed: true })).toHaveLength(1); // chỉ cụm 2 có accent ≠ 0
  });

  it("bấm mora ghi accent=…; bấm lại về 0", async () => {
    const h = renderPanel();
    fireEvent.click(await screen.findByTitle("Đặt accent sau 「ハ」"));
    expect(h.onChangeAttrs).toHaveBeenLastCalledWith({ accent: "2/4" });
  });

  it("đặt trùng accent của engine thì xoá khoá", async () => {
    const h = renderPanel({ item: line({ accent: "1/4", fx: "far" }) });
    fireEvent.click((await screen.findAllByTitle("Bấm để về bằng (0)"))[0]);
    // cụm 1 đang 1 -> bấm 「オ」 lần nữa về 0 = trùng engine
    expect(h.onChangeAttrs).toHaveBeenLastCalledWith({ fx: "far" });
  });

  it("số cụm lệch sau khi sửa câu: xoá accent và báo", async () => {
    const h = renderPanel({ item: line({ accent: "1/2/3" }) });
    await waitFor(() => expect(h.onChangeAttrs).toHaveBeenCalledWith({}));
    expect(h.onNotice).toHaveBeenCalledWith(expect.stringContaining("Đã xoá accent của câu L001"));
  });

  it("engine tắt: hiện thông báo, không lỗi", async () => {
    window.textts.getAccentPhrases.mockResolvedValue({ ok: false, offline: true, error: "AivisSpeech chưa chạy" });
    renderPanel();
    expect(await screen.findByText("AivisSpeech chưa chạy")).toBeTruthy();
    expect(screen.getByText("▶ Nghe").disabled).toBe(true);
  });

  it("không phải AivisSpeech: chỉ ghi chú, không gọi engine", () => {
    renderPanel({ engine: "voicevox" });
    expect(screen.getByText("Bảng accent chỉ dùng với engine AivisSpeech.")).toBeTruthy();
    expect(window.textts.getAccentPhrases).not.toHaveBeenCalled();
  });

  it("nút Nghe gọi preview câu đang chọn", async () => {
    const h = renderPanel();
    await screen.findByText("ゴ");
    fireEvent.click(screen.getByText("▶ Nghe"));
    expect(h.onPreview).toHaveBeenCalledWith("L001");
  });
});
