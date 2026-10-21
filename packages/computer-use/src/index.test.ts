import { describe, expect, it } from "vitest";
import { fitWithinMaxEdge } from "./index.js";

describe("fitWithinMaxEdge", () => {
  it("keeps small sizes", () => {
    expect(fitWithinMaxEdge(800, 600, 1280)).toEqual({
      width: 800,
      height: 600,
    });
  });

  it("scales down large sizes", () => {
    expect(fitWithinMaxEdge(3840, 2160, 1280)).toEqual({
      width: 1280,
      height: 720,
    });
  });
});
