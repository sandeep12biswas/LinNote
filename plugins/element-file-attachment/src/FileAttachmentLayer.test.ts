import { describe, expect, it } from "vitest";
import { basenameFromPath, extensionFromFileName, nextZIndex } from "./FileAttachmentLayer";

describe("basenameFromPath", () => {
  it("returns the final segment of a POSIX path", () => {
    expect(basenameFromPath("/home/sandeep/Documents/report.docx")).toBe("report.docx");
  });

  it("returns the final segment of a Windows path", () => {
    expect(basenameFromPath("C:\\Users\\sandeep\\Documents\\report.docx")).toBe("report.docx");
  });

  it("returns the input unchanged when it has no path separator", () => {
    expect(basenameFromPath("report.docx")).toBe("report.docx");
  });
});

describe("extensionFromFileName", () => {
  it("lower-cases a mixed-case extension", () => {
    expect(extensionFromFileName("Report.DOCX")).toBe("docx");
  });

  it("returns an empty string for a file name with no extension", () => {
    expect(extensionFromFileName("README")).toBe("");
  });

  it("treats a leading dot as hidden-file marker, not an extension separator", () => {
    expect(extensionFromFileName(".gitignore")).toBe("");
  });

  it("returns an empty string when the dot is the file name's last character", () => {
    expect(extensionFromFileName("trailing.")).toBe("");
  });
});

describe("nextZIndex", () => {
  it("returns 1 for an empty list", () => {
    expect(nextZIndex([])).toBe(1);
  });

  it("returns one past the highest existing zIndex", () => {
    expect(nextZIndex([{ zIndex: 3 }, { zIndex: 7 }, { zIndex: 1 }])).toBe(8);
  });
});
