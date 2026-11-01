// @vitest-environment jsdom
import { cleanup, render } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import LineTable from "./LineTable.jsx";

afterEach(cleanup);

const LINE = (id, display = "こんにちは") => ({
  id, type: "line", role: "1", display, tts_text: display, plain: display, emotion: "neutral", speed: "normal",
});

function renderTable(props) {
  return render(
    <LineTable
      items={[LINE("L001"), LINE("L002")]}
      selectedId={null} onSelect={() => {}} onPatch={() => {}} onMove={() => {}}
      onDelete={() => {}} onPreview={() => {}} suggestions={{}} onApply={() => {}}
      disabled={false} {...props}
    />,
  );
}

describe("LineTable row state", () => {
  it("marks synthesis-failed rows as error", () => {
    const { container } = renderTable({ errorIds: ["L002"] });
    expect(container.querySelector("#row-L002").className).toContain("error");
    expect(container.querySelector("#row-L001").className).not.toContain("error");
  });

  it("marks lint warnings and shows their message as a tooltip", () => {
    const { container } = renderTable({
      issues: [{ id: "L001", level: "warning", message: "có chữ Hán chưa có cách đọc" }],
    });
    const row = container.querySelector("#row-L001");
    expect(row.className).toContain("warn");
    expect(row.getAttribute("title")).toBe("có chữ Hán chưa có cách đọc");
  });

  it("lint error takes the error class even without a synthesis failure", () => {
    const { container } = renderTable({
      issues: [{ id: "L002", level: "error", message: "không tìm thấy file" }],
    });
    expect(container.querySelector("#row-L002").className).toContain("error");
  });
});
