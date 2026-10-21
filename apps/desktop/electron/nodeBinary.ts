import { execFileSync } from "node:child_process";

/**
 * Electron sets process.execPath to the Electron binary. MCP stdio servers must
 * be launched with a real Node.js executable.
 */
export function resolveNodeBinary(): string {
  if (!process.versions.electron) {
    return process.execPath;
  }
  if (process.env.BOT_COMPUTER_NODE?.trim()) {
    return process.env.BOT_COMPUTER_NODE.trim();
  }
  try {
    const cmd = process.platform === "win32" ? "where.exe" : "which";
    const out = execFileSync(cmd, ["node"], {
      encoding: "utf8",
      windowsHide: true,
    });
    const first = out
      .split(/\r?\n/)
      .map((line) => line.trim())
      .find(Boolean);
    if (first) return first;
  } catch {
    /* fall through */
  }
  return "node";
}
