// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Ribbon, { RibbonButton, RibbonGroup } from "./Ribbon.jsx";

afterEach(cleanup);
beforeEach(() => window.localStorage.clear());

function renderRibbon(onOpen = () => {}) {
  return render(
    <Ribbon
      tabs={[
        { id: "home", label: "Trang chủ", content: <RibbonGroup label="Dự án"><RibbonButton label="Mở dự án" onClick={onOpen} /></RibbonGroup> },
        { id: "tools", label: "Công cụ", content: <RibbonGroup label="Cách đọc"><RibbonButton label="Từ điển" /></RibbonGroup> },
      ]}
    />,
  );
}

describe("Ribbon", () => {
  it("shows the first tab and switches tabs", () => {
    const onOpen = vi.fn();
    renderRibbon(onOpen);
    fireEvent.click(screen.getByRole("button", { name: "Mở dự án" }));
    expect(onOpen).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("tab", { name: "Công cụ" }));
    expect(screen.getByRole("button", { name: "Từ điển" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Mở dự án" })).toBeNull();
  });

  it("collapses the body and peeks it when a tab is clicked", () => {
    renderRibbon();
    fireEvent.click(screen.getByRole("button", { name: "Thu gọn ribbon" }));
    expect(screen.queryByRole("tabpanel")).toBeNull();
    fireEvent.click(screen.getByRole("tab", { name: "Trang chủ" }));
    expect(screen.getByRole("tabpanel")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Mở dự án" }));
    expect(screen.queryByRole("tabpanel")).toBeNull();
  });
});
