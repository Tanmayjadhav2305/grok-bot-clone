import { describe, expect, it } from "vitest";
import { shouldRunJob, localHHMM } from "./scheduler.js";

describe("shouldRunJob", () => {
  it("runs interval jobs when enough time passed", () => {
    const now = new Date("2026-10-21T12:00:00");
    expect(
      shouldRunJob(
        {
          id: "1",
          name: "t",
          enabled: true,
          dailyAt: "",
          intervalMinutes: 30,
          agentId: "ops",
          prompt: "hi",
          lastRunAt: now.getTime() - 31 * 60_000,
        },
        now,
      ),
    ).toBe(true);
  });

  it("runs dailyAt once per day", () => {
    const now = new Date(`2026-10-21T${localHHMM()}:00`);
    // Force match by constructing with current HH:MM
    const hhmm = localHHMM(now);
    expect(
      shouldRunJob(
        {
          id: "1",
          name: "morning",
          enabled: true,
          dailyAt: hhmm,
          agentId: "ops",
          prompt: "digest",
        },
        now,
      ),
    ).toBe(true);
  });

  it("skips disabled", () => {
    expect(
      shouldRunJob({
        id: "1",
        name: "t",
        enabled: false,
        dailyAt: "",
        intervalMinutes: 1,
        agentId: "ops",
        prompt: "x",
      }),
    ).toBe(false);
  });
});
