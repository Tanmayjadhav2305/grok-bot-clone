import type { ListedTool, ToolHost } from "@bot-computer/mcp-host";
import type { Skill } from "@bot-computer/contracts";
import { WorkspaceStore } from "./workspace.js";
import { runSkill } from "./skills.js";

export function createWorkspaceHost(store: WorkspaceStore): ToolHost {
  const serverId = "workspace";
  const tools: ListedTool[] = [
    {
      serverId,
      name: "note_write",
      description: "Write/overwrite a shared team note by key.",
      inputSchema: {
        type: "object",
        properties: {
          key: { type: "string" },
          text: { type: "string" },
        },
        required: ["key", "text"],
      },
    },
    {
      serverId,
      name: "note_read",
      description: "Read a shared team note by key (or list keys if omitted).",
      inputSchema: {
        type: "object",
        properties: { key: { type: "string" } },
      },
    },
    {
      serverId,
      name: "file_write",
      description: "Write a shared workspace file (e.g. drafts/outreach.md).",
      inputSchema: {
        type: "object",
        properties: {
          name: { type: "string" },
          content: { type: "string" },
        },
        required: ["name", "content"],
      },
    },
    {
      serverId,
      name: "file_read",
      description: "Read a shared workspace file.",
      inputSchema: {
        type: "object",
        properties: { name: { type: "string" } },
        required: ["name"],
      },
    },
    {
      serverId,
      name: "file_list",
      description: "List shared workspace files.",
      inputSchema: { type: "object", properties: {} },
    },
  ];

  return {
    async listTools() {
      return tools;
    },
    async callTool(sid, name, args) {
      if (sid !== serverId) return { ok: false, content: `Unknown server: ${sid}` };
      const a = (args ?? {}) as Record<string, unknown>;
      try {
        if (name === "note_write") {
          const key = String(a.key ?? "").trim();
          const text = String(a.text ?? "");
          if (!key) return { ok: false, content: "key required" };
          await store.writeNote(key, text);
          return { ok: true, content: JSON.stringify({ written: key }) };
        }
        if (name === "note_read") {
          const key = typeof a.key === "string" ? a.key.trim() : "";
          if (!key) {
            const notes = await store.listNotes();
            return {
              ok: true,
              content: JSON.stringify({ keys: Object.keys(notes) }, null, 2),
            };
          }
          const text = await store.readNote(key);
          return {
            ok: text !== null,
            content: JSON.stringify({ key, text }, null, 2),
          };
        }
        if (name === "file_write") {
          const nameArg = String(a.name ?? "").trim();
          const content = String(a.content ?? "");
          if (!nameArg) return { ok: false, content: "name required" };
          const saved = await store.writeFile(nameArg, content);
          return { ok: true, content: JSON.stringify({ written: saved }) };
        }
        if (name === "file_read") {
          const nameArg = String(a.name ?? "").trim();
          if (!nameArg) return { ok: false, content: "name required" };
          const content = await store.readFile(nameArg);
          return {
            ok: true,
            content: JSON.stringify(
              {
                name: nameArg,
                content: content.slice(0, 80_000),
              },
              null,
              2,
            ),
          };
        }
        if (name === "file_list") {
          const files = await store.listFiles();
          return { ok: true, content: JSON.stringify({ files }, null, 2) };
        }
        return { ok: false, content: `Unknown tool: ${name}` };
      } catch (err) {
        return {
          ok: false,
          content: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

export function createSkillsHost(deps: {
  getSkills: () => Skill[];
  getBrowser: () => ToolHost;
}): ToolHost {
  const serverId = "skills";
  return {
    async listTools() {
      return [
        {
          serverId,
          name: "list",
          description: "List saved browser skills / routines.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          serverId,
          name: "run",
          description:
            "Replay a saved skill (browser step sequence). Observe & repeat.",
          inputSchema: {
            type: "object",
            properties: { id: { type: "string" } },
            required: ["id"],
          },
        },
      ];
    },
    async callTool(sid, name, args) {
      if (sid !== serverId) return { ok: false, content: `Unknown server: ${sid}` };
      if (name === "list") {
        const skills = deps.getSkills().map((s) => ({
          id: s.id,
          name: s.name,
          description: s.description,
          steps: s.steps.length,
        }));
        return { ok: true, content: JSON.stringify({ skills }, null, 2) };
      }
      if (name === "run") {
        const id =
          args && typeof args === "object"
            ? String((args as { id?: unknown }).id ?? "")
            : "";
        const skill = deps.getSkills().find((s) => s.id === id);
        if (!skill) return { ok: false, content: `Unknown skill: ${id}` };
        const result = await runSkill(skill, deps.getBrowser());
        return {
          ok: result.ok,
          content: JSON.stringify(result, null, 2),
        };
      }
      return { ok: false, content: `Unknown tool: ${name}` };
    },
  };
}

export function createTeamDelegateHost(deps: {
  delegate: (
    agentId: string,
    prompt: string,
  ) => Promise<{ ok: boolean; content: string }>;
  listAgents: () => Array<{ id: string; name: string; description?: string }>;
}): ToolHost {
  const serverId = "team";
  return {
    async listTools() {
      return [
        {
          serverId,
          name: "list_agents",
          description: "List bots available for delegation.",
          inputSchema: { type: "object", properties: {} },
        },
        {
          serverId,
          name: "delegate",
          description:
            "Hand a sub-task to another bot; returns their reply (shared computer / workspace).",
          inputSchema: {
            type: "object",
            properties: {
              agentId: { type: "string" },
              prompt: { type: "string" },
            },
            required: ["agentId", "prompt"],
          },
        },
      ];
    },
    async callTool(sid, name, args) {
      if (sid !== serverId) return { ok: false, content: `Unknown server: ${sid}` };
      if (name === "list_agents") {
        return {
          ok: true,
          content: JSON.stringify({ agents: deps.listAgents() }, null, 2),
        };
      }
      if (name === "delegate") {
        const a = (args ?? {}) as { agentId?: string; prompt?: string };
        if (!a.agentId || !a.prompt) {
          return { ok: false, content: "agentId and prompt required" };
        }
        return deps.delegate(a.agentId, a.prompt);
      }
      return { ok: false, content: `Unknown tool: ${name}` };
    },
  };
}
