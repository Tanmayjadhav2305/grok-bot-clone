import type { Skill, SkillStep } from "@bot-computer/contracts";
import type { ToolHost } from "@bot-computer/mcp-host";

function sleep(ms: number): Promise<void> {
  return new Promise((r) => setTimeout(r, ms));
}

export type SkillRunResult = {
  ok: boolean;
  steps: Array<{ step: SkillStep; ok: boolean; content: string }>;
};

/**
 * Replay a saved skill against the Agent Browser tool host.
 */
export async function runSkill(
  skill: Skill,
  browser: ToolHost,
): Promise<SkillRunResult> {
  const steps: SkillRunResult["steps"] = [];
  await browser.callTool("browser", "open", {});

  for (const step of skill.steps) {
    let result: { ok: boolean; content: string };
    if (step.type === "wait") {
      await sleep(step.ms);
      result = { ok: true, content: `waited ${step.ms}ms` };
    } else if (step.type === "navigate") {
      result = await browser.callTool("browser", "navigate", { url: step.url });
    } else if (step.type === "click") {
      result = await browser.callTool("browser", "click", {
        x: step.x,
        y: step.y,
      });
    } else if (step.type === "type") {
      result = await browser.callTool("browser", "type_text", {
        text: step.text,
      });
    } else if (step.type === "screenshot") {
      result = await browser.callTool("browser", "screenshot", {});
    } else if (step.type === "read_text") {
      result = await browser.callTool("browser", "read_text", {});
    } else {
      result = { ok: false, content: "unknown step" };
    }
    steps.push({ step, ok: result.ok, content: result.content.slice(0, 2000) });
    if (!result.ok) {
      return { ok: false, steps };
    }
  }
  return { ok: true, steps };
}
