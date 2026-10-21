import { desktopCapturer, screen } from "electron";
import { fitWithinMaxEdge } from "@bot-computer/computer-use";

export type CapturedFrame = {
  jpeg: Buffer;
  width: number;
  height: number;
  dataUrl: string;
};

/** Capture the primary display as a JPEG (for preview + vision). */
export async function capturePrimaryJpeg(
  maxEdge: number,
  quality = 70,
): Promise<CapturedFrame | null> {
  const display = screen.getPrimaryDisplay();
  // Cap edge so IPC data-URLs stay under Chromium practical limits.
  const edge = Math.min(maxEdge, 1024);
  const fitted = fitWithinMaxEdge(
    display.size.width,
    display.size.height,
    edge,
  );
  // Electron requires integer thumbnail sizes; avoid 0.
  const thumbnailSize = {
    width: Math.max(2, fitted.width),
    height: Math.max(2, fitted.height),
  };
  const sources = await desktopCapturer.getSources({
    types: ["screen"],
    thumbnailSize,
    fetchWindowIcons: false,
  });
  if (sources.length === 0) return null;

  const primaryId = String(display.id);
  let source =
    sources.find((s) => s.display_id === primaryId) ??
    sources.find((s) => !s.thumbnail.isEmpty()) ??
    sources[0];
  if (!source || source.thumbnail.isEmpty()) {
    // Retry once with a modest fixed size (some GPUs return empty at odd sizes).
    const retry = await desktopCapturer.getSources({
      types: ["screen"],
      thumbnailSize: { width: 960, height: 540 },
      fetchWindowIcons: false,
    });
    source = retry.find((s) => !s.thumbnail.isEmpty()) ?? retry[0];
  }
  if (!source || source.thumbnail.isEmpty()) return null;

  const size = source.thumbnail.getSize();
  const jpeg = source.thumbnail.toJPEG(Math.min(80, Math.max(40, quality)));
  if (!jpeg || jpeg.byteLength < 32) return null;
  const dataUrl = `data:image/jpeg;base64,${jpeg.toString("base64")}`;
  return {
    jpeg,
    width: size.width,
    height: size.height,
    dataUrl,
  };
}
