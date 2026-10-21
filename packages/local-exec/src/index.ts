import { spawn } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

export type LocalExecOptions = {
  allowlist: string[];
  timeoutMs: number;
  maxOutputBytes: number;
  cwd?: string;
  env?: Record<string, string>;
};

export type LocalExecResult = {
  ok: boolean;
  code: number | null;
  signal: NodeJS.Signals | null;
  stdout: string;
  stderr: string;
  truncated: boolean;
  error?: string;
};

function normalizeAllowEntry(name: string): string {
  return path.basename(name).toLowerCase().replace(/\.exe$/i, "");
}

export function isAllowlisted(
  executable: string,
  allowlist: string[],
): boolean {
  const base = normalizeAllowEntry(executable);
  return allowlist.some((entry) => normalizeAllowEntry(entry) === base);
}

/** Resolve argv[0] to an absolute path when possible. */
export function resolveExecutable(command: string): string {
  if (path.isAbsolute(command) && fs.existsSync(command)) return command;
  if (command.includes(path.sep) || command.includes("/")) {
    const resolved = path.resolve(command);
    if (fs.existsSync(resolved)) return resolved;
  }
  return command;
}

export async function runAllowlistedArgv(
  argv: string[],
  options: LocalExecOptions,
): Promise<LocalExecResult> {
  if (!Array.isArray(argv) || argv.length === 0 || !argv[0]?.trim()) {
    return {
      ok: false,
      code: null,
      signal: null,
      stdout: "",
      stderr: "",
      truncated: false,
      error: "argv must be a non-empty array",
    };
  }

  const command = argv[0]!;
  if (!isAllowlisted(command, options.allowlist)) {
    return {
      ok: false,
      code: null,
      signal: null,
      stdout: "",
      stderr: "",
      truncated: false,
      error: `executable not allowlisted: ${path.basename(command)}`,
    };
  }

  const resolved = resolveExecutable(command);
  const args = argv.slice(1);
  const max = options.maxOutputBytes;

  return await new Promise((resolve) => {
    let stdout = Buffer.alloc(0);
    let stderr = Buffer.alloc(0);
    let truncated = false;
    let settled = false;

    const child = spawn(resolved, args, {
      cwd: options.cwd,
      env: options.env ? { ...process.env, ...options.env } : process.env,
      windowsHide: true,
      shell: false,
    });

    const finish = (result: LocalExecResult) => {
      if (settled) return;
      settled = true;
      resolve(result);
    };

    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      finish({
        ok: false,
        code: null,
        signal: "SIGTERM",
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        truncated,
        error: `timeout after ${options.timeoutMs}ms`,
      });
    }, options.timeoutMs);

    const append = (which: "stdout" | "stderr", chunk: Buffer) => {
      const current = which === "stdout" ? stdout : stderr;
      if (current.length >= max) {
        truncated = true;
        return;
      }
      const next = Buffer.concat([current, chunk]);
      if (next.length > max) {
        truncated = true;
        const sliced = next.subarray(0, max);
        if (which === "stdout") stdout = sliced;
        else stderr = sliced;
      } else if (which === "stdout") {
        stdout = next;
      } else {
        stderr = next;
      }
    };

    child.stdout?.on("data", (c: Buffer) => append("stdout", c));
    child.stderr?.on("data", (c: Buffer) => append("stderr", c));
    child.on("error", (err) => {
      clearTimeout(timer);
      finish({
        ok: false,
        code: null,
        signal: null,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        truncated,
        error: err.message,
      });
    });
    child.on("close", (code, signal) => {
      clearTimeout(timer);
      finish({
        ok: code === 0,
        code,
        signal,
        stdout: stdout.toString("utf8"),
        stderr: stderr.toString("utf8"),
        truncated,
      });
    });
  });
}
