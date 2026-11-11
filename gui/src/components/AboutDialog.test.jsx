// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import AboutDialog from "./AboutDialog.jsx";

afterEach(cleanup);

describe("AboutDialog", () => {
  it("renders with CLI tab active by default", () => {
    render(<AboutDialog onClose={() => {}} />);
    expect(screen.getByText("Chạy textts bằng dòng lệnh (Không cần GUI)")).toBeTruthy();
    expect(screen.getAllByText(/python tts.py/).length).toBeGreaterThan(0);
  });

  it("switches tabs between CLI, AI, Syntax, and About", () => {
    render(<AboutDialog onClose={() => {}} docsUrl="http://127.0.0.1:8000/docs" />);
    
    // Switch to AI tab
    fireEvent.click(screen.getByRole("tab", { name: "🤖 Kết nối với AI" }));
    expect(screen.getByText("Kết nối với AI (ChatGPT, Claude & AI Agents)")).toBeTruthy();
    expect(screen.getByText(/Custom GPT Actions/)).toBeTruthy();

    // Switch to Syntax tab
    fireEvent.click(screen.getByRole("tab", { name: "📝 Cú pháp & Furigana" }));
    expect(screen.getByText("Quy tắc kịch bản & Chú âm Furigana")).toBeTruthy();

    // Switch to About tab
    fireEvent.click(screen.getByRole("tab", { name: "ℹ Về textts" }));
    expect(screen.getByText("Giới thiệu ứng dụng textts")).toBeTruthy();
    expect(screen.getByText(/ThS\. Nguyễn Thanh Quang/)).toBeTruthy();
    expect(screen.getByText(/1.1.0/)).toBeTruthy();
  });

  it("shows the Claude Desktop MCP config with this machine's paths", async () => {
    const cfg = JSON.stringify({ mcpServers: { textts: { command: "C:\\py\\python.exe", args: ["C:\\e\\ai_tools\\mcp_server.py"] } } }, null, 2);
    window.textts = { getMcpConfig: vi.fn(async () => cfg) };
    render(<AboutDialog onClose={() => {}} />);
    fireEvent.click(screen.getByRole("tab", { name: "🤖 Kết nối với AI" }));
    expect(await screen.findByText(/C:\\\\e\\\\ai_tools\\\\mcp_server\.py/)).toBeTruthy();
    expect(screen.getByText(/Claude Desktop \(khuyên dùng\)/)).toBeTruthy();
    delete window.textts;
  });

  it("triggers onClose on Escape key or close button click", () => {
    const onClose = vi.fn();
    render(<AboutDialog onClose={onClose} />);
    const closeButtons = screen.getAllByRole("button", { name: "Đóng" });
    fireEvent.click(closeButtons[0]);
    expect(onClose).toHaveBeenCalledTimes(1);

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });
});
