import type { ScheduleJob } from "@bot-computer/contracts";

function pad2(n: number): string {
  return n.toString().padStart(2, "0");
}

export function localHHMM(d = new Date()): string {
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
}

/** Whether a job should fire now given lastRunAt. */
export function shouldRunJob(
  job: ScheduleJob,
  now = new Date(),
): boolean {
  if (!job.enabled) return false;
  const nowMs = now.getTime();
  const last = job.lastRunAt ?? 0;

  if (job.dailyAt && /^\d{1,2}:\d{2}$/.test(job.dailyAt)) {
    const target = job.dailyAt.length === 4 ? `0${job.dailyAt}` : job.dailyAt;
    if (localHHMM(now) !== target) return false;
    // once per calendar day
    const lastDay = new Date(last);
    return (
      last === 0 ||
      lastDay.getFullYear() !== now.getFullYear() ||
      lastDay.getMonth() !== now.getMonth() ||
      lastDay.getDate() !== now.getDate()
    );
  }

  const interval = job.intervalMinutes ?? 0;
  if (interval <= 0) return false;
  return nowMs - last >= interval * 60_000;
}

export type JobRunner = (job: ScheduleJob) => Promise<void>;

/**
 * Polls every `tickMs` and runs due jobs (local-first cron).
 */
export class JobScheduler {
  private timer: ReturnType<typeof setInterval> | null = null;
  private running = new Set<string>();

  constructor(
    private readonly getJobs: () => ScheduleJob[],
    private readonly onRun: JobRunner,
    private readonly markRan: (id: string, at: number) => void | Promise<void>,
    private readonly tickMs = 30_000,
  ) {}

  start(): void {
    if (this.timer) return;
    void this.tick();
    this.timer = setInterval(() => void this.tick(), this.tickMs);
  }

  stop(): void {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick(now = new Date()): Promise<void> {
    for (const job of this.getJobs()) {
      if (!shouldRunJob(job, now)) continue;
      if (this.running.has(job.id)) continue;
      this.running.add(job.id);
      try {
        await this.onRun(job);
        await this.markRan(job.id, now.getTime());
      } finally {
        this.running.delete(job.id);
      }
    }
  }

  async runNow(jobId: string): Promise<boolean> {
    const job = this.getJobs().find((j) => j.id === jobId);
    if (!job) return false;
    if (this.running.has(job.id)) return false;
    this.running.add(job.id);
    try {
      await this.onRun(job);
      await this.markRan(job.id, Date.now());
      return true;
    } finally {
      this.running.delete(job.id);
    }
  }
}
