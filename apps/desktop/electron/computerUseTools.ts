import fs from "node:fs/promises";
import path from "node:path";
import type { ComputerUseSettings } from "@bot-computer/contracts";
import { win32Click, win32TypeText } from "@bot-computer/computer-use";
import type { ListedTool, ToolHost } from "@bot-computer/mcp-host";
import { capturePrimaryJpeg } from "./screenCapture.js";

const SERVER_ID = "computer-use";

export class ComputerUseToolHost implements ToolHost {
  constructor(
    private readonly getSettings: () => ComputerUseSettings,
    private readonly screenshotsDir: string,
    private readonly onFrame?: (dataUrl: string) => void,
  ) {}

  async listTools(): Promise<ListedTool[]> {
    const settings = this.getSettings();
    if (!settings.enabled) return [];
    const tools: ListedTool[] = [
      {
        serverId: SERVER_ID,
        name: "display_info",
        description: "Return primary display bounds and scale factor.",
        inputSchema: { type: "object", properties: {} },
      },
      {
        serverId: SERVER_ID,
        name: "screenshot",
        description:
          "Capture the primary display to a JPEG under the app screenshots folder. Returns path, size, and optional dataUrl when vision is enabled. Prefer this before click/type, and again after acting so the user can watch the preview.",
        inputSchema: { type: "object", properties: {} },
      },
    ];
    if (settings.allowInput) {
      tools.push(
        {
          serverId: SERVER_ID,
          name: "click",
          description:
            "Move the OS cursor and left-click at absolute screen coordinates (Windows). Follow with screenshot to verify.",
          inputSchema: {
            type: "object",
            properties: {
              x: { type: "number" },
              y: { type: "number" },
            },
            required: ["x", "y"],
          },
        },
        {
          serverId: SERVER_ID,
          name: "type_text",
          description:
            "Type text via OS SendKeys into the focused window (Windows, max 2000 chars). Follow with screenshot to verify.",
          inputSchema: {
            type: "object",
            properties: {
              text: { type: "string" },
            },
            required: ["text"],
          },
        },
      );
    }
    return tools;
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: unknown,
  ): Promise<{ ok: boolean; content: string }> {
    if (serverId !== SERVER_ID) {
      return { ok: false, content: `Unknown server: ${serverId}` };
    }
    const settings = this.getSettings();
    if (!settings.enabled) {
      return { ok: false, content: "computer-use is disabled in settings" };
    }
    try {
      if (toolName === "display_info") {
        const { screen } = await import("electron");
        const d = screen.getPrimaryDisplay();
        return {
          ok: true,
          content: JSON.stringify(
            {
              bounds: d.bounds,
              size: d.size,
              scaleFactor: d.scaleFactor,
            },
            null,
            2,
          ),
        };
      }
      if (toolName === "screenshot") {
        return await this.screenshot(settings);
      }
      if (toolName === "click") {
        if (!settings.allowInput) {
          return { ok: false, content: "Input is disabled (allowInput=false)" };
        }
        const a = (args ?? {}) as { x?: number; y?: number };
        if (typeof a.x !== "number" || typeof a.y !== "number") {
          return { ok: false, content: "click requires numeric x and y" };
        }
        await win32Click(a.x, a.y);
        const verify = await this.screenshot(settings);
        return {
          ok: true,
          content: JSON.stringify(
            {
              clicked: true,
              x: a.x,
              y: a.y,
              verify: safeParse(verify.content),
            },
            null,
            2,
          ),
        };
      }
      if (toolName === "type_text") {
        if (!settings.allowInput) {
          return { ok: false, content: "Input is disabled (allowInput=false)" };
        }
        const a = (args ?? {}) as { text?: string };
        if (typeof a.text !== "string") {
          return { ok: false, content: "type_text requires string text" };
        }
        await win32TypeText(a.text);
        const verify = await this.screenshot(settings);
        return {
          ok: true,
          content: JSON.stringify(
            {
              typed: true,
              length: a.text.length,
              verify: safeParse(verify.content),
            },
            null,
            2,
          ),
        };
      }
      return { ok: false, content: `Unknown tool: ${toolName}` };
    } catch (err) {
      return {
        ok: false,
        content: err instanceof Error ? err.message : String(err),
      };
    }
  }

  private async screenshot(
    settings: ComputerUseSettings,
  ): Promise<{ ok: boolean; content: string }> {
    const frame = await capturePrimaryJpeg(settings.maxEdge, 72);
    if (!frame) {
      return { ok: false, content: "No screen capture source available" };
    }
    this.onFrame?.(frame.dataUrl);
    await fs.mkdir(this.screenshotsDir, { recursive: true });
    const file = path.join(this.screenshotsDir, `shot-${Date.now()}.jpg`);
    await fs.writeFile(file, frame.jpeg);
    const payload: Record<string, unknown> = {
      path: file,
      width: frame.width,
      height: frame.height,
      bytes: frame.jpeg.byteLength,
    };
    if (settings.vision) {
      payload.dataUrl = frame.dataUrl;
    }
    return { ok: true, content: JSON.stringify(payload, null, 2) };
  }
}

function safeParse(text: string): unknown {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}
