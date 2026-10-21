import type { BrowserWindow } from "electron";
import { IpcChannels } from "@bot-computer/contracts";
import { capturePrimaryJpeg } from "./screenCapture.js";

export type PreviewStreamOptions = {
  maxEdge: number;
  intervalMs: number;
};

export class LivePreviewStreamer {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = false;
  private opts: PreviewStreamOptions = { maxEdge: 1280, intervalMs: 750 };
  private capturing = false;

  constructor(private readonly getWindow: () => BrowserWindow | null) {}

  status(): { running: boolean; intervalMs: number; maxEdge: number } {
    return {
      running: this.running,
      intervalMs: this.opts.intervalMs,
      maxEdge: this.opts.maxEdge,
    };
  }

  start(opts: PreviewStreamOptions): void {
    this.opts = opts;
    this.stop();
    this.running = true;
    void this.tick();
    this.timer = setInterval(() => {
      void this.tick();
    }, Math.max(250, opts.intervalMs));
  }

  stop(): void {
    this.running = false;
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  /** Push one fresh frame immediately (e.g. after click/type). */
  async pushNow(): Promise<void> {
    await this.tick(true);
  }

  private async tick(force = false): Promise<void> {
    if (!this.running && !force) return;
    if (this.capturing) return;
    const win = this.getWindow();
    if (!win || win.isDestroyed()) return;
    this.capturing = true;
    try {
      const frame = await capturePrimaryJpeg(
        Math.min(this.opts.maxEdge, 960),
        55,
      );
      if (!frame) {
        win.webContents.send(IpcChannels.previewFrame, {
          error: "capture_empty",
          at: Date.now(),
        });
        return;
      }
      win.webContents.send(IpcChannels.previewFrame, {
        dataUrl: frame.dataUrl,
        width: frame.width,
        height: frame.height,
        at: Date.now(),
      });
    } catch (err) {
      console.warn("preview capture failed:", err);
      win.webContents.send(IpcChannels.previewFrame, {
        error: err instanceof Error ? err.message : String(err),
        at: Date.now(),
      });
    } finally {
      this.capturing = false;
    }
  }
}
