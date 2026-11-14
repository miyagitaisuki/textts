// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import LineSliders from "./LineSliders.jsx";

afterEach(cleanup);

describe("LineSliders", () => {
  it("hiện 4 slider có giá trị và dấu ?", () => {
    render(<LineSliders attrs={{ post: "500" }} engine="aivis" onChange={() => {}} />);
    expect(screen.getAllByRole("slider")).toHaveLength(4);
    expect(screen.getAllByRole("img").length).toBe(4); // dấu ? có giải thích
    expect(screen.getByLabelText("Lặng sau câu")).toHaveProperty("value", "500");
  });

  it("làm mờ tempo khi engine không hỗ trợ, kèm ghi chú", () => {
    render(<LineSliders attrs={{}} engine="edge" onChange={() => {}} />);
    expect(screen.getByLabelText("Nhịp điệu (tempo)").disabled).toBe(true);
    expect(screen.getByLabelText("Âm lượng").disabled).toBe(false);
    expect(screen.getByText("Chỉ áp dụng khi dùng AivisSpeech.")).toBeTruthy();
  });

  it("kéo slider ghi attrs; nhấp đúp về mặc định thì xoá khoá", () => {
    const onChange = vi.fn();
    render(<LineSliders attrs={{ vol: "-3", fx: "far" }} engine="aivis" onChange={onChange} />);
    fireEvent.change(screen.getByLabelText("Lặng trước câu"), { target: { value: "300" } });
    expect(onChange).toHaveBeenLastCalledWith({ vol: "-3", fx: "far", pre: "300" });
    fireEvent.doubleClick(screen.getByLabelText("Âm lượng"));
    expect(onChange).toHaveBeenLastCalledWith({ fx: "far" });
  });

  it("bấm giá trị để gõ số, Enter thì ghi (có kẹp khoảng)", () => {
    const onChange = vi.fn();
    render(<LineSliders attrs={{}} engine="aivis" onChange={onChange} />);
    fireEvent.click(screen.getAllByTitle("Bấm để nhập số")[0]);
    const input = screen.getByLabelText("Nhập Nhịp điệu (tempo)");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(onChange).toHaveBeenLastCalledWith({ tempo: "2" });
  });
});
