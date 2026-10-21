import { execFile } from "node:child_process";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

export function fitWithinMaxEdge(
  width: number,
  height: number,
  maxEdge: number,
): { width: number; height: number } {
  if (width <= 0 || height <= 0) return { width: 1, height: 1 };
  const scale = Math.min(1, maxEdge / Math.max(width, height));
  return {
    width: Math.max(1, Math.round(width * scale)),
    height: Math.max(1, Math.round(height * scale)),
  };
}

export async function win32Click(x: number, y: number): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("click is only implemented on Windows in Slice 3");
  }
  const xi = Math.round(x);
  const yi = Math.round(y);
  const script = `
Add-Type @"
using System;
using System.Runtime.InteropServices;
public class BotComputerInput {
  [DllImport("user32.dll")] public static extern bool SetCursorPos(int X, int Y);
  [DllImport("user32.dll")] public static extern void mouse_event(int flags, int dx, int dy, int data, int extra);
}
"@
[BotComputerInput]::SetCursorPos(${xi}, ${yi}) | Out-Null
[BotComputerInput]::mouse_event(0x0002, 0, 0, 0, 0)
[BotComputerInput]::mouse_event(0x0004, 0, 0, 0, 0)
`;
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 10_000 },
  );
}

export async function win32TypeText(text: string): Promise<void> {
  if (process.platform !== "win32") {
    throw new Error("type_text is only implemented on Windows in Slice 3");
  }
  if (text.length > 2000) {
    throw new Error("type_text limited to 2000 characters in Slice 3");
  }
  // SendKeys-safe escaping
  const escaped = text
    .replace(/\{/g, "{{}")
    .replace(/\}/g, "{}}")
    .replace(/\+/g, "{+}")
    .replace(/\^/g, "{^}")
    .replace(/%/g, "{%}")
    .replace(/~/g, "{~}")
    .replace(/\(/g, "{(}")
    .replace(/\)/g, "{)}")
    .replace(/\[/g, "{[}")
    .replace(/\]/g, "{]}");
  const script = `
Add-Type -AssemblyName System.Windows.Forms
[System.Windows.Forms.SendKeys]::SendWait(@'
${escaped}
'@)
`;
  await execFileAsync(
    "powershell.exe",
    ["-NoProfile", "-NonInteractive", "-Command", script],
    { windowsHide: true, timeout: 15_000 },
  );
}
