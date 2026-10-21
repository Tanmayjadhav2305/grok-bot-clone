import { describe, expect, it } from "vitest";
import { resolveNavigateUrl } from "./navigateUrl.js";

describe("resolveNavigateUrl", () => {
  it("accepts full https urls", () => {
    expect(resolveNavigateUrl({ url: "https://example.com/path" })).toEqual({
      ok: true,
      url: "https://example.com/path",
    });
  });

  it("adds https to bare domains", () => {
    expect(resolveNavigateUrl({ url: "news.ycombinator.com" })).toEqual({
      ok: true,
      url: "https://news.ycombinator.com/",
    });
  });

  it("turns search phrases into duckduckgo", () => {
    const r = resolveNavigateUrl({ url: "famous AI articles today" });
    expect(r.ok).toBe(true);
    if (r.ok) {
      expect(r.url).toContain("duckduckgo.com");
      expect(r.url).toContain("famous");
    }
  });

  it("maps gmail alias to mail.google.com", () => {
    expect(resolveNavigateUrl({ url: "gmail" })).toEqual({
      ok: true,
      url: "https://mail.google.com/",
    });
  });

  it("accepts query field", () => {
    const r = resolveNavigateUrl({ query: "tech news" });
    expect(r.ok).toBe(true);
    if (r.ok) expect(r.url).toContain("duckduckgo.com");
  });

  it("errors when missing", () => {
    const r = resolveNavigateUrl({});
    expect(r.ok).toBe(false);
  });
});
