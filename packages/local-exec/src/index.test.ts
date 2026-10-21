import { describe, expect, it } from "vitest";
import { isAllowlisted, runAllowlistedArgv } from "./index.js";

describe("local-exec", () => {
  it("allowlists by basename ignoring .exe", () => {
    expect(isAllowlisted("node", ["node", "git"])).toBe(true);
    expect(isAllowlisted("C:\\\\foo\\\\node.exe", ["node"])).toBe(true);
    expect(isAllowlisted("python", ["node"])).toBe(false);
  });

  it("rejects empty argv", async () => {
    const result = await runAllowlistedArgv([], {
      allowlist: ["node"],
      timeoutMs: 5000,
      maxOutputBytes: 10_000,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/non-empty/);
  });

  it("rejects non-allowlisted executable", async () => {
    const result = await runAllowlistedArgv(["python", "-c", "print(1)"], {
      allowlist: ["node"],
      timeoutMs: 5000,
      maxOutputBytes: 10_000,
    });
    expect(result.ok).toBe(false);
    expect(result.error).toMatch(/not allowlisted/);
  });

  it("runs allowlisted node -e", async () => {
    const result = await runAllowlistedArgv(
      [process.execPath, "-e", "process.stdout.write('ok')"],
      {
        allowlist: ["node"],
        timeoutMs: 10_000,
        maxOutputBytes: 10_000,
      },
    );
    expect(result.ok).toBe(true);
    expect(result.stdout).toBe("ok");
  });
});
