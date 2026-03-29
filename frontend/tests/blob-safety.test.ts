import { openBlobSafely } from "../src/lib/blob-safety";

describe("openBlobSafely", () => {
  const openSpy = vi.fn();
  const createObjectURLSpy = vi.fn(() => "blob:mock");
  const revokeObjectURLSpy = vi.fn();

  beforeAll(() => {
    Object.defineProperty(window, "open", {
      value: openSpy,
      writable: true,
    });
    Object.defineProperty(URL, "createObjectURL", {
      value: createObjectURLSpy,
      writable: true,
    });
    Object.defineProperty(URL, "revokeObjectURL", {
      value: revokeObjectURLSpy,
      writable: true,
    });
  });

  beforeEach(() => {
    openSpy.mockClear();
    createObjectURLSpy.mockClear();
    revokeObjectURLSpy.mockClear();
  });

  it("opens safe inline MIME types in a new tab", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const blob = new Blob(["pdf"], { type: "application/pdf" });

    const result = openBlobSafely(blob, "file.pdf");

    expect(result).toBe("opened");
    expect(openSpy).toHaveBeenCalledTimes(1);
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("blocks active content MIME types", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const blob = new Blob(["<html></html>"], { type: "text/html" });

    const result = openBlobSafely(blob, "file.html");

    expect(result).toBe("blocked");
    expect(openSpy).not.toHaveBeenCalled();
    expect(createObjectURLSpy).not.toHaveBeenCalled();
    expect(clickSpy).not.toHaveBeenCalled();
    clickSpy.mockRestore();
  });

  it("downloads unknown MIME types instead of opening inline", () => {
    const clickSpy = vi.spyOn(HTMLAnchorElement.prototype, "click").mockImplementation(() => undefined);
    const blob = new Blob(["raw"], { type: "application/octet-stream" });

    const result = openBlobSafely(blob, "file.bin");

    expect(result).toBe("downloaded");
    expect(openSpy).not.toHaveBeenCalled();
    expect(createObjectURLSpy).toHaveBeenCalledTimes(1);
    expect(clickSpy).toHaveBeenCalledTimes(1);
    clickSpy.mockRestore();
  });
});
