import { scrubSensitiveQueryParams } from "../src/lib/url-security";

describe("scrubSensitiveQueryParams", () => {
  beforeEach(() => {
    window.history.replaceState({}, "", "/");
  });

  it("removes sensitive auth query keys and keeps unrelated params", () => {
    window.history.replaceState({}, "", "/?token=abc123&invitation=xyz&keep=1#section");

    scrubSensitiveQueryParams();

    expect(window.location.pathname).toBe("/");
    expect(window.location.search).toBe("?keep=1");
    expect(window.location.hash).toBe("#section");
  });

  it("supports key-scoped scrubbing", () => {
    window.history.replaceState({}, "", "/?custom=a&keep=1");

    scrubSensitiveQueryParams(["custom"]);

    expect(window.location.search).toBe("?keep=1");
  });
});
