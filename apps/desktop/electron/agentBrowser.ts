import { BrowserWindow, WebContentsView } from "electron";
import type { ListedTool, ToolHost } from "@bot-computer/mcp-host";
import { resolveNavigateUrl } from "./navigateUrl.js";

const SERVER_ID = "browser";

const START_PAGE = `data:text/html;charset=utf-8,${encodeURIComponent(`<!doctype html>
<html>
<head>
  <meta charset="utf-8" />
  <title>Sandbox Computer</title>
  <style>
    html, body { height: 100%; margin: 0; background: #0b0d10; color: #e8eaef;
      font-family: "Segoe UI", system-ui, sans-serif; }
    main { min-height: 100%; display: grid; place-items: center; padding: 2rem; text-align: center; }
    h1 { font-size: 1.35rem; font-weight: 600; margin: 0 0 0.5rem; }
    p { margin: 0; color: #9aa3b2; line-height: 1.5; max-width: 28rem; }
    code { color: #8ec5ff; }
    .badge { display: inline-block; margin-bottom: 0.75rem; padding: 0.2rem 0.55rem;
      border-radius: 999px; font-size: 0.7rem; letter-spacing: 0.06em; text-transform: uppercase;
      background: rgba(61,214,140,0.12); color: #3dd68c; border: 1px solid rgba(61,214,140,0.35); }
  </style>
</head>
<body>
  <main>
    <div>
      <div class="badge">Sandbox</div>
      <h1>Sandbox Computer ready</h1>
      <p>Isolated browser the bot drives — you watch it here. Waiting for <code>browser/navigate</code>…</p>
    </div>
  </main>
</body>
</html>`)}`;

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type SandboxBounds = {
  x: number;
  y: number;
  width: number;
  height: number;
};

/**
 * Sandbox Computer — isolated Chromium (Slice 10).
 * Embedded as WebContentsView in the Live pane (Grok-like watch surface).
 */
export class AgentBrowserHost implements ToolHost {
  private view: WebContentsView | null = null;
  private started = false;
  private visible = false;
  private lastBounds: SandboxBounds = { x: 0, y: 0, width: 0, height: 0 };

  constructor(
    private readonly getMainWindow: () => BrowserWindow | null,
    private readonly onFrame?: (dataUrl: string) => void,
    private readonly onVisibility?: (visible: boolean) => void,
    private readonly onNeedBounds?: () => void,
  ) {}

  listTools(): Promise<ListedTool[]> {
    return Promise.resolve([
      {
        serverId: SERVER_ID,
        name: "open",
        description:
          "Show the Sandbox Computer. Prefer passing url (e.g. https://mail.google.com or gmail). Without url you only get the start page — that is NOT Gmail. Never for greetings.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "Optional page to load immediately (https URL, domain, or alias like gmail)",
            },
          },
        },
      },
      {
        serverId: SERVER_ID,
        name: "navigate",
        description:
          "Load a URL in the Sandbox Computer (required after open if no url was given). Example: https://mail.google.com or gmail.",
        inputSchema: {
          type: "object",
          properties: {
            url: {
              type: "string",
              description:
                "http(s) URL, domain (news.ycombinator.com), or search query",
            },
            query: {
              type: "string",
              description: "Optional search phrase if url omitted",
            },
          },
        },
      },
      {
        serverId: SERVER_ID,
        name: "screenshot",
        description:
          "Capture the Sandbox Computer as JPEG proof (updates chat proof + live pane).",
        inputSchema: { type: "object", properties: {} },
      },
      {
        serverId: SERVER_ID,
        name: "read_text",
        description: "Read visible text from the sandbox page.",
        inputSchema: {
          type: "object",
          properties: { maxChars: { type: "number" } },
        },
      },
      {
        serverId: SERVER_ID,
        name: "click",
        description: "Click at CSS viewport coordinates in the sandbox.",
        inputSchema: {
          type: "object",
          properties: { x: { type: "number" }, y: { type: "number" } },
          required: ["x", "y"],
        },
      },
      {
        serverId: SERVER_ID,
        name: "type_text",
        description: "Type into the focused element in the sandbox.",
        inputSchema: {
          type: "object",
          properties: { text: { type: "string" } },
          required: ["text"],
        },
      },
    ]);
  }

  async callTool(
    serverId: string,
    toolName: string,
    args: unknown,
  ): Promise<{ ok: boolean; content: string }> {
    if (serverId !== SERVER_ID) {
      return { ok: false, content: `Unknown server: ${serverId}` };
    }
    try {
      if (toolName === "open") {
        const maybeUrl = resolveNavigateUrl(args);
        const wc = await this.ensureView(!maybeUrl.ok);
        this.show();
        this.requestBounds();
        await sleep(100);
        this.applyBounds();

        let navigated: string | null = null;
        if (maybeUrl.ok) {
          await this.loadAndWait(wc, maybeUrl.url);
          navigated = maybeUrl.url;
        }

        const shot = await this.capture(wc);
        return {
          ok: true,
          content: JSON.stringify(
            {
              open: true,
              sandbox: true,
              visibleInLivePane: true,
              url: wc.getURL(),
              title: wc.getTitle(),
              navigated,
              note: navigated
                ? "Sandbox loaded the requested page — look at Sandbox Computer on the right."
                : "Sandbox start page only (NOT Gmail/any site). You MUST call browser/navigate next with a real url like https://mail.google.com",
              ...shot,
            },
            null,
            2,
          ),
        };
      }
      if (toolName === "navigate") {
        const resolved = resolveNavigateUrl(args);
        if (!resolved.ok) return { ok: false, content: resolved.error };
        const wc = await this.ensureView(false);
        this.show();
        this.requestBounds();
        await sleep(100);
        this.applyBounds();
        await this.loadAndWait(wc, resolved.url);
        const shot = await this.capture(wc);
        return {
          ok: true,
          content: JSON.stringify(
            {
              navigated: resolved.url,
              title: wc.getTitle(),
              sandbox: true,
              visibleInLivePane: true,
              note: "Page should now fill the Sandbox Computer pane on the right.",
              ...shot,
            },
            null,
            2,
          ),
        };
      }
      if (toolName === "screenshot") {
        const wc = await this.ensureView(true);
        this.show();
        const shot = await this.capture(wc);
        return {
          ok: true,
          content: JSON.stringify(
            { url: wc.getURL(), title: wc.getTitle(), sandbox: true, ...shot },
            null,
            2,
          ),
        };
      }
      if (toolName === "read_text") {
        const wc = await this.ensureView(true);
        const maxChars =
          args &&
          typeof args === "object" &&
          typeof (args as { maxChars?: unknown }).maxChars === "number"
            ? Math.min(
                80_000,
                Math.max(500, (args as { maxChars: number }).maxChars),
              )
            : 20_000;
        const pageUrl = wc.getURL();
        if (!pageUrl || pageUrl === "about:blank") {
          return {
            ok: false,
            content: "Sandbox has no page yet. Call browser/navigate first.",
          };
        }
        const text = (await wc.executeJavaScript(
          `(() => {
            const t = document.body ? document.body.innerText : '';
            return t.slice(0, ${maxChars});
          })()`,
        )) as string;
        return {
          ok: true,
          content: JSON.stringify(
            {
              url: pageUrl,
              title: wc.getTitle(),
              text,
              length: text.length,
              sandbox: true,
            },
            null,
            2,
          ),
        };
      }
      if (toolName === "click") {
        const a = (args ?? {}) as { x?: number; y?: number };
        if (typeof a.x !== "number" || typeof a.y !== "number") {
          return { ok: false, content: "click requires numeric x and y" };
        }
        const wc = await this.ensureView(true);
        this.show();
        const x = Math.round(a.x);
        const y = Math.round(a.y);
        wc.sendInputEvent({ type: "mouseMove", x, y });
        wc.sendInputEvent({
          type: "mouseDown",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        wc.sendInputEvent({
          type: "mouseUp",
          x,
          y,
          button: "left",
          clickCount: 1,
        });
        await sleep(400);
        const shot = await this.capture(wc);
        return {
          ok: true,
          content: JSON.stringify({ clicked: true, x, y, ...shot }, null, 2),
        };
      }
      if (toolName === "type_text") {
        const text =
          args &&
          typeof args === "object" &&
          typeof (args as { text?: unknown }).text === "string"
            ? (args as { text: string }).text
            : "";
        if (!text) return { ok: false, content: "type_text requires text" };
        if (text.length > 4000) {
          return { ok: false, content: "type_text limited to 4000 chars" };
        }
        const wc = await this.ensureView(true);
        this.show();
        for (const ch of text) {
          wc.sendInputEvent({ type: "keyDown", keyCode: ch });
          wc.sendInputEvent({ type: "char", keyCode: ch });
          wc.sendInputEvent({ type: "keyUp", keyCode: ch });
        }
        await sleep(200);
        const shot = await this.capture(wc);
        return {
          ok: true,
          content: JSON.stringify(
            { typed: true, length: text.length, ...shot },
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

  setBounds(bounds: SandboxBounds): void {
    this.lastBounds = bounds;
    this.applyBounds();
  }

  private applyBounds(): void {
    if (!this.view) return;
    let bounds = this.lastBounds;
    if (this.visible && (bounds.width < 8 || bounds.height < 8)) {
      // Fallback until renderer reports the mount rect
      const main = this.getMainWindow();
      if (main && !main.isDestroyed()) {
        const [cw, ch] = main.getContentSize();
        const w = Math.floor(cw * 0.4);
        bounds = {
          x: cw - w,
          y: 56,
          width: w,
          height: Math.max(120, ch - 56 - 40),
        };
        this.lastBounds = bounds;
      }
    }
    if (!this.visible || bounds.width < 8 || bounds.height < 8) {
      this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
      return;
    }
    this.view.setBounds({
      x: Math.round(bounds.x),
      y: Math.round(bounds.y),
      width: Math.round(bounds.width),
      height: Math.round(bounds.height),
    });
  }

  private requestBounds(): void {
    this.onNeedBounds?.();
  }

  show(): void {
    this.visible = true;
    const main = this.getMainWindow();
    // Keep sandbox view on top of the renderer chrome
    if (this.view && main && !main.isDestroyed()) {
      try {
        main.contentView.removeChildView(this.view);
        main.contentView.addChildView(this.view);
      } catch {
        /* ignore */
      }
    }
    this.applyBounds();
    this.onVisibility?.(true);
  }

  hide(): void {
    this.visible = false;
    if (this.view) {
      this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    }
    this.onVisibility?.(false);
  }

  isVisible(): boolean {
    return this.visible;
  }

  dispose(): void {
    const main = this.getMainWindow();
    if (this.view && main && !main.isDestroyed()) {
      try {
        main.contentView.removeChildView(this.view);
      } catch {
        /* ignore */
      }
    }
    if (this.view) {
      try {
        this.view.webContents.close();
      } catch {
        /* ignore */
      }
    }
    this.view = null;
    this.started = false;
    this.visible = false;
  }

  private async ensureView(loadStartIfNeeded: boolean): Promise<Electron.WebContents> {
    if (this.view) {
      if (loadStartIfNeeded && !this.started) {
        await this.loadAndWait(this.view.webContents, START_PAGE);
        this.started = true;
      }
      return this.view.webContents;
    }

    const main = this.getMainWindow();
    if (!main || main.isDestroyed()) {
      throw new Error("Main window not ready for sandbox");
    }

    this.view = new WebContentsView({
      webPreferences: {
        contextIsolation: true,
        nodeIntegration: false,
        sandbox: true,
        partition: "persist:bot-computer-sandbox",
      },
    });
    main.contentView.addChildView(this.view);
    this.view.setBounds({ x: 0, y: 0, width: 0, height: 0 });
    this.view.webContents.on("destroyed", () => {
      this.view = null;
      this.started = false;
    });

    if (loadStartIfNeeded) {
      await this.loadAndWait(this.view.webContents, START_PAGE);
      this.started = true;
    }
    return this.view.webContents;
  }

  private async loadAndWait(
    wc: Electron.WebContents,
    url: string,
  ): Promise<void> {
    await new Promise<void>((resolve, reject) => {
      const onDone = () => {
        cleanup();
        resolve();
      };
      const onFail = (
        _event: unknown,
        errorCode: number,
        errorDescription: string,
        validatedURL: string,
        isMainFrame: boolean,
      ) => {
        if (errorCode === -3 || !isMainFrame) return;
        cleanup();
        reject(
          new Error(`load failed: ${errorDescription} (${validatedURL})`),
        );
      };
      const cleanup = () => {
        wc.removeListener("did-finish-load", onDone);
        wc.removeListener("did-fail-load", onFail);
      };
      wc.addListener("did-finish-load", onDone);
      wc.addListener("did-fail-load", onFail);
      void wc.loadURL(url).catch((err) => {
        cleanup();
        reject(err);
      });
    });
    await sleep(500);
  }

  private async capture(wc: Electron.WebContents): Promise<{
    width: number;
    height: number;
    bytes: number;
    dataUrl: string;
  }> {
    const image = await wc.capturePage();
    const size = image.getSize();
    const jpeg = image.toJPEG(60);
    const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
    this.onFrame?.(dataUrl);
    return {
      width: size.width,
      height: size.height,
      bytes: jpeg.byteLength,
      dataUrl,
    };
  }
}
