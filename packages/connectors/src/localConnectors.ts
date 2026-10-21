import fs from "node:fs/promises";
import path from "node:path";
import type { ListedTool, ToolHost } from "@bot-computer/mcp-host";

/** Avoid circular import with index.ts */
export type LocalConnectorContext = {
  userDataPath?: string;
  slackWebhookUrl?: string;
};

type LocalConnector = {
  id: string;
  name: string;
  description: string;
  createHost(ctx: LocalConnectorContext): ToolHost;
};

async function ensureDir(dir: string): Promise<void> {
  await fs.mkdir(dir, { recursive: true });
}

function root(ctx: LocalConnectorContext, ...parts: string[]): string {
  const base = ctx.userDataPath ?? path.join(process.cwd(), ".bot-computer-data");
  return path.join(base, ...parts);
}

function createSheetsHost(ctx: LocalConnectorContext): ToolHost {
  const serverId = "sheets";
  const dir = () => root(ctx, "sheets");
  return {
    async listTools(): Promise<ListedTool[]> {
      return [
        {
          serverId,
          name: "list",
          description: "List local CSV sheets (Google-Sheet stand-in).",
          inputSchema: { type: "object", properties: {} },
        },
        {
          serverId,
          name: "read",
          description: "Read a CSV sheet by name (e.g. leads.csv).",
          inputSchema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
        {
          serverId,
          name: "write",
          description: "Write/overwrite a CSV sheet.",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
              csv: { type: "string" },
            },
            required: ["name", "csv"],
          },
        },
        {
          serverId,
          name: "append_row",
          description: "Append a CSV row (comma-separated values).",
          inputSchema: {
            type: "object",
            properties: {
              name: { type: "string" },
              row: { type: "string" },
            },
            required: ["name", "row"],
          },
        },
      ];
    },
    async callTool(sid, name, args) {
      if (sid !== serverId) return { ok: false, content: `Unknown: ${sid}` };
      const a = (args ?? {}) as Record<string, unknown>;
      try {
        await ensureDir(dir());
        if (name === "list") {
          const files = (await fs.readdir(dir())).filter((f) =>
            f.endsWith(".csv"),
          );
          return { ok: true, content: JSON.stringify({ sheets: files }) };
        }
        const sheet = String(a.name ?? "").replace(/[^a-zA-Z0-9._-]/g, "_");
        if (!sheet) return { ok: false, content: "name required" };
        const file = path.join(
          dir(),
          sheet.endsWith(".csv") ? sheet : `${sheet}.csv`,
        );
        if (name === "read") {
          const csv = await fs.readFile(file, "utf8");
          return {
            ok: true,
            content: JSON.stringify({ name: path.basename(file), csv }, null, 2),
          };
        }
        if (name === "write") {
          await fs.writeFile(file, String(a.csv ?? ""), "utf8");
          return { ok: true, content: JSON.stringify({ written: path.basename(file) }) };
        }
        if (name === "append_row") {
          let existing = "";
          try {
            existing = await fs.readFile(file, "utf8");
          } catch {
            /* new */
          }
          const row = String(a.row ?? "");
          const next =
            existing.length === 0
              ? `${row}\n`
              : existing.endsWith("\n")
                ? `${existing}${row}\n`
                : `${existing}\n${row}\n`;
          await fs.writeFile(file, next, "utf8");
          return { ok: true, content: JSON.stringify({ appended: path.basename(file) }) };
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

function createMailHost(ctx: LocalConnectorContext): ToolHost {
  const serverId = "mail";
  const dir = () => root(ctx, "mail", "inbox");
  return {
    async listTools(): Promise<ListedTool[]> {
      return [
        {
          serverId,
          name: "list",
          description:
            "List messages in the local mail drop folder (drop .json or .eml files).",
          inputSchema: { type: "object", properties: {} },
        },
        {
          serverId,
          name: "read",
          description: "Read a message by filename.",
          inputSchema: {
            type: "object",
            properties: { name: { type: "string" } },
            required: ["name"],
          },
        },
      ];
    },
    async callTool(sid, name, args) {
      if (sid !== serverId) return { ok: false, content: `Unknown: ${sid}` };
      try {
        await ensureDir(dir());
        if (name === "list") {
          const files = await fs.readdir(dir());
          return { ok: true, content: JSON.stringify({ messages: files }) };
        }
        if (name === "read") {
          const n = String(
            (args as { name?: string })?.name ?? "",
          ).replace(/\.\./g, "");
          if (!n) return { ok: false, content: "name required" };
          const body = await fs.readFile(path.join(dir(), n), "utf8");
          return {
            ok: true,
            content: JSON.stringify(
              { name: n, body: body.slice(0, 50_000) },
              null,
              2,
            ),
          };
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

function createCalendarHost(ctx: LocalConnectorContext): ToolHost {
  const serverId = "calendar";
  const file = () => root(ctx, "calendar", "events.ics");
  return {
    async listTools(): Promise<ListedTool[]> {
      return [
        {
          serverId,
          name: "read",
          description: "Read local calendar ICS (drop events.ics into userData/calendar).",
          inputSchema: { type: "object", properties: {} },
        },
        {
          serverId,
          name: "write",
          description: "Overwrite local calendar ICS text.",
          inputSchema: {
            type: "object",
            properties: { ics: { type: "string" } },
            required: ["ics"],
          },
        },
      ];
    },
    async callTool(sid, name, args) {
      if (sid !== serverId) return { ok: false, content: `Unknown: ${sid}` };
      try {
        await ensureDir(path.dirname(file()));
        if (name === "read") {
          try {
            const ics = await fs.readFile(file(), "utf8");
            return {
              ok: true,
              content: JSON.stringify({ ics: ics.slice(0, 50_000) }, null, 2),
            };
          } catch {
            return {
              ok: true,
              content: JSON.stringify({
                ics: "",
                hint: "No events.ics yet — write one or drop a file in userData/calendar/",
              }),
            };
          }
        }
        if (name === "write") {
          const ics = String((args as { ics?: string })?.ics ?? "");
          await fs.writeFile(file(), ics, "utf8");
          return { ok: true, content: JSON.stringify({ written: true }) };
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

function createNotifyHost(ctx: LocalConnectorContext): ToolHost {
  const serverId = "notify";
  return {
    async listTools(): Promise<ListedTool[]> {
      return [
        {
          serverId,
          name: "slack_webhook",
          description:
            "POST a message to a Slack-compatible incoming webhook (set in Settings).",
          inputSchema: {
            type: "object",
            properties: { text: { type: "string" } },
            required: ["text"],
          },
        },
      ];
    },
    async callTool(sid, name, args) {
      if (sid !== serverId) return { ok: false, content: `Unknown: ${sid}` };
      if (name !== "slack_webhook") {
        return { ok: false, content: `Unknown tool: ${name}` };
      }
      const text = String((args as { text?: string })?.text ?? "").trim();
      if (!text) return { ok: false, content: "text required" };
      const url = ctx.slackWebhookUrl?.trim() ?? "";
      if (!url) {
        return {
          ok: false,
          content:
            "No slackWebhookUrl in Settings → Connectors. Message not sent.",
        };
      }
      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ text }),
          signal: AbortSignal.timeout(15_000),
        });
        const body = await res.text();
        return {
          ok: res.ok,
          content: JSON.stringify({ status: res.status, body: body.slice(0, 500) }),
        };
      } catch (err) {
        return {
          ok: false,
          content: err instanceof Error ? err.message : String(err),
        };
      }
    },
  };
}

export const sheetsConnector: LocalConnector = {
  id: "sheets",
  name: "Local Sheets",
  description: "CSV sheets in userData (lead lists, expense logs).",
  createHost(ctx) {
    return createSheetsHost(ctx);
  },
};

export const mailConnector: LocalConnector = {
  id: "mail",
  name: "Local Mail Drop",
  description: "Read messages from userData/mail/inbox drop folder.",
  createHost(ctx) {
    return createMailHost(ctx);
  },
};

export const calendarConnector: LocalConnector = {
  id: "calendar",
  name: "Local Calendar",
  description: "ICS calendar file in userData/calendar.",
  createHost(ctx) {
    return createCalendarHost(ctx);
  },
};

export const notifyConnector: LocalConnector = {
  id: "notify",
  name: "Notify",
  description: "Slack-compatible webhook notifications.",
  createHost(ctx) {
    return createNotifyHost(ctx);
  },
};

export const localConnectors: LocalConnector[] = [
  sheetsConnector,
  mailConnector,
  calendarConnector,
  notifyConnector,
];
