import { z } from "zod";

export const McpServerConfigSchema = z
  .object({
    id: z.string().min(1),
    name: z.string().min(1),
    /** stdio (default) or SSE HTTP MCP endpoint. */
    transport: z.enum(["stdio", "sse"]).default("stdio"),
    command: z.string().optional(),
    args: z.array(z.string()).default([]),
    env: z.record(z.string()).optional(),
    /** Required when transport is sse (SSE stream URL). */
    url: z.string().url().optional(),
    /** Optional HTTP headers for SSE (e.g. Authorization). */
    headers: z.record(z.string()).optional(),
    enabled: z.boolean().default(true),
  })
  .superRefine((val, ctx) => {
    if (val.transport === "stdio" && !(val.command && val.command.length > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "stdio MCP servers require command",
        path: ["command"],
      });
    }
    if (val.transport === "sse" && !(val.url && val.url.length > 0)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: "sse MCP servers require url",
        path: ["url"],
      });
    }
  });

export const ConnectorsSettingsSchema = z.object({
  /** Enabled built-in / registered connector plugin ids. */
  enabled: z.array(z.string().min(1)).default([
    "workspace",
    "sheets",
    "mail",
    "calendar",
    "notify",
    "skills",
    "team",
  ]),
  /** Slack-compatible incoming webhook URL (notify/slack_webhook). */
  slackWebhookUrl: z.string().default(""),
});

export const SkillStepSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("navigate"), url: z.string().min(1) }),
  z.object({ type: z.literal("wait"), ms: z.number().int().positive().max(60_000) }),
  z.object({ type: z.literal("click"), x: z.number(), y: z.number() }),
  z.object({ type: z.literal("type"), text: z.string() }),
  z.object({ type: z.literal("screenshot") }),
  z.object({ type: z.literal("read_text") }),
]);

export const SkillSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  description: z.string().default(""),
  steps: z.array(SkillStepSchema).default([]),
});

export const ScheduleJobSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  enabled: z.boolean().default(true),
  /** Daily local time HH:MM (24h), or empty if using intervalMinutes. */
  dailyAt: z.string().default(""),
  /** Repeat every N minutes (1–1440). Ignored when dailyAt is set. */
  intervalMinutes: z.number().int().min(1).max(1440).optional(),
  agentId: z.string().min(1),
  prompt: z.string().min(1),
  /** Optional skill id to run before the prompt. */
  skillId: z.string().optional(),
  lastRunAt: z.number().optional(),
});

export const AutomationsSettingsSchema = z.object({
  schedules: z.array(ScheduleJobSchema).default([]),
  skills: z.array(SkillSchema).default([]),
});

export const GatewaySettingsSchema = z.object({
  enabled: z.boolean().default(false),
  /** Bind address — default loopback only. */
  host: z.string().min(1).default("127.0.0.1"),
  port: z.number().int().min(1).max(65535).default(8787),
  /** Required when enabled; desktop may auto-generate. */
  apiKey: z.string().default(""),
});

export const AgentProfileSchema = z.object({
  id: z.string().min(1),
  name: z.string().min(1),
  /** Short blurb shown in Bot Studio / session picker. */
  description: z.string().default(""),
  systemPrompt: z.string().min(1),
  /** Optional model override; empty/undefined uses global model.modelId. */
  modelId: z.string().optional(),
});

export const defaultAgentProfiles = (): z.infer<typeof AgentProfileSchema>[] => [
  {
    id: "default",
    name: "Default",
    description: "General chat assistant — tools only when you ask.",
    systemPrompt:
      "You are Bot Computer’s Default bot: a friendly local assistant. Answer normally in chat. Do not open the browser or call tools unless the user asks for an action.",
  },
  {
    id: "researcher",
    name: "Researcher",
    description: "Web research with sources and proof screenshots.",
    systemPrompt:
      "You are the Researcher bot. When the user asks for research or web facts: browser/open → navigate → screenshot → read_text; save notes with workspace/note_write; cite URLs. For hello/chat with no research ask: text only, no tools.",
  },
  {
    id: "coder",
    name: "Coder",
    description: "Local commands and coding help.",
    systemPrompt:
      "You are the Coder bot. Explain briefly. Use local-exec only when the user wants commands run. Chat questions: text only.",
  },
  {
    id: "computer",
    name: "Computer",
    description: "Drives the Agent Browser when asked to act.",
    systemPrompt:
      "You are the Computer bot. The user watches the Sandbox Computer (isolated browser) in the Live pane. When they ask you to act on the web: browser/open → navigate → screenshot → read_text. Prefer sandbox browser/* over host OS computer-use. If they only say hi: text only — do not open the sandbox.",
  },
  {
    id: "ops",
    name: "Ops",
    description: "Digests, expenses, calendar, Slack pings.",
    systemPrompt:
      "You are the Ops bot. When asked for digests/expenses/ops work: use mail/*, calendar/*, sheets/*, notify/*, workspace/*. Casual chat: text only.",
  },
  {
    id: "sales",
    name: "Sales",
    description: "Lead research and outreach drafts.",
    systemPrompt:
      "You are the Sales bot. When asked to research leads or draft outreach: sheets/* + browser/* + workspace/file_write under drafts/. Never send mail unless asked. Casual chat: text only.",
  },
  {
    id: "qa",
    name: "QA",
    description: "Staging QA and bug reproduction packs.",
    systemPrompt:
      "You are the QA bot. When given a URL or bug to repro: browser/* with screenshots and workspace/file_write for the pack. Casual chat: text only.",
  },
  {
    id: "writer",
    name: "Writer",
    description: "Turns research notes into polished copy.",
    systemPrompt:
      "You are the Writer bot. When asked to write: use workspace notes/files; team/delegate to Researcher only if facts are missing. Casual chat: text only.",
  },
];

export const TeamSettingsSchema = z.object({
  agents: z.array(AgentProfileSchema).default(defaultAgentProfiles()),
});

export const ModelSettingsSchema = z.object({
  baseUrl: z.string().min(1).default("http://127.0.0.1:11434/v1"),
  apiKey: z.string().default(""),
  modelId: z.string().min(1).default("llama3.2"),
});

export const LocalExecSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** Executable basenames allowed for run_argv (e.g. node, git). */
  allowlist: z.array(z.string().min(1)).default(["node", "git"]),
  timeoutMs: z.number().int().positive().max(600_000).default(30_000),
  maxOutputBytes: z.number().int().positive().max(5_000_000).default(200_000),
});

export const SandboxSettingsSchema = z.object({
  /** Grok-like isolated Sandbox Computer (embedded browser). Default on. */
  enabled: z.boolean().default(true),
  /**
   * When sandbox is on, block OS computer-use tools unless the user opts in
   * (keeps the agent inside the sandbox, not the host desktop).
   */
  allowHostDesktop: z.boolean().default(false),
});

export const ComputerUseSettingsSchema = z.object({
  enabled: z.boolean().default(true),
  /** OS click/type — off by default; screenshots can still work. */
  allowInput: z.boolean().default(false),
  /** Max edge length for captured thumbnails (keeps tool results small). */
  maxEdge: z.number().int().positive().max(4096).default(1280),
  /** Stream primary display into the Computer preview pane (host desktop). */
  livePreview: z.boolean().default(false),
  /** Preview capture interval (ms). */
  previewIntervalMs: z
    .number()
    .int()
    .min(250)
    .max(5_000)
    .default(750),
  /**
   * Attach JPEG screenshots to the LLM as multimodal image_url parts
   * (requires a vision-capable OpenAI-compatible model).
   */
  vision: z.boolean().default(false),
});

export const SettingsSchema = z.object({
  model: ModelSettingsSchema.default({
    baseUrl: "http://127.0.0.1:11434/v1",
    apiKey: "",
    modelId: "llama3.2",
  }),
  mcp: z
    .object({
      servers: z.array(McpServerConfigSchema).default([]),
    })
    .default({ servers: [] }),
  permissions: z
    .object({
      alwaysAllow: z.array(z.string()).default([]),
    })
    .default({ alwaysAllow: [] }),
  localExec: LocalExecSettingsSchema.default({
    enabled: true,
    allowlist: ["node", "git"],
    timeoutMs: 30_000,
    maxOutputBytes: 200_000,
  }),
  sandbox: SandboxSettingsSchema.default({
    enabled: true,
    allowHostDesktop: false,
  }),
  computerUse: ComputerUseSettingsSchema.default({
    enabled: true,
    allowInput: false,
    maxEdge: 1280,
    livePreview: false,
    previewIntervalMs: 750,
    vision: false,
  }),
  connectors: ConnectorsSettingsSchema.default({
    enabled: [
      "workspace",
      "sheets",
      "mail",
      "calendar",
      "notify",
      "skills",
      "team",
    ],
    slackWebhookUrl: "",
  }),
  gateway: GatewaySettingsSchema.default({
    enabled: false,
    host: "127.0.0.1",
    port: 8787,
    apiKey: "",
  }),
  team: TeamSettingsSchema.default({
    agents: defaultAgentProfiles(),
  }),
  automations: AutomationsSettingsSchema.default({
    schedules: [],
    skills: [],
  }),
});

export type McpServerConfig = z.infer<typeof McpServerConfigSchema>;
export type ModelSettings = z.infer<typeof ModelSettingsSchema>;
export type LocalExecSettings = z.infer<typeof LocalExecSettingsSchema>;
export type ComputerUseSettings = z.infer<typeof ComputerUseSettingsSchema>;
export type SandboxSettings = z.infer<typeof SandboxSettingsSchema>;
export type ConnectorsSettings = z.infer<typeof ConnectorsSettingsSchema>;
export type GatewaySettings = z.infer<typeof GatewaySettingsSchema>;
export type AgentProfile = z.infer<typeof AgentProfileSchema>;
export type TeamSettings = z.infer<typeof TeamSettingsSchema>;
export type SkillStep = z.infer<typeof SkillStepSchema>;
export type Skill = z.infer<typeof SkillSchema>;
export type ScheduleJob = z.infer<typeof ScheduleJobSchema>;
export type AutomationsSettings = z.infer<typeof AutomationsSettingsSchema>;
export type Settings = z.infer<typeof SettingsSchema>;

export function toolKey(serverId: string, toolName: string): string {
  return `${serverId}/${toolName}`;
}

export function parseToolKey(
  key: string,
): { serverId: string; toolName: string } | null {
  const idx = key.indexOf("/");
  if (idx <= 0 || idx === key.length - 1) return null;
  return { serverId: key.slice(0, idx), toolName: key.slice(idx + 1) };
}

export const defaultSettings = (): Settings => SettingsSchema.parse({});

/** Refresh built-in bot prompts (keeps custom bots; updates Default/Computer/…). */
export function withFreshBuiltinAgents(settings: Settings): Settings {
  const builtins = defaultAgentProfiles();
  const byId = new Map(builtins.map((a) => [a.id, a]));
  const seen = new Set<string>();
  const agents = settings.team.agents.map((a) => {
    seen.add(a.id);
    const fresh = byId.get(a.id);
    if (!fresh) return a;
    return {
      ...a,
      name: fresh.name,
      description: fresh.description,
      systemPrompt: fresh.systemPrompt,
    };
  });
  for (const b of builtins) {
    if (!seen.has(b.id)) agents.push(b);
  }
  return { ...settings, team: { ...settings.team, agents } };
}

export const ChatStreamEventSchema = z.discriminatedUnion("type", [
  z.object({ type: z.literal("token"), text: z.string() }),
  z.object({
    type: z.literal("tool_call"),
    serverId: z.string(),
    toolName: z.string(),
    arguments: z.unknown(),
  }),
  z.object({
    type: z.literal("tool_result"),
    serverId: z.string(),
    toolName: z.string(),
    ok: z.boolean(),
    content: z.string(),
  }),
  z.object({
    type: z.literal("proof_image"),
    dataUrl: z.string(),
    caption: z.string().optional(),
  }),
  z.object({ type: z.literal("error"), message: z.string() }),
  z.object({ type: z.literal("done") }),
]);

export type ChatStreamEvent = z.infer<typeof ChatStreamEventSchema>;

export const PermissionDecisionSchema = z.enum([
  "allow-once",
  "allow-always",
  "deny",
]);
export type PermissionDecision = z.infer<typeof PermissionDecisionSchema>;

/** IPC channel names (designed; RE-inspired roles, not sand: copies). */
export const IpcChannels = {
  settingsGet: "bot:settings:get",
  settingsSet: "bot:settings:set",
  chatSend: "bot:chat:send",
  chatStream: "bot:chat:stream",
  chatCancel: "bot:chat:cancel",
  mcpList: "bot:mcp:list",
  mcpReload: "bot:mcp:reload",
  permissionRequest: "bot:permission:request",
  permissionResolve: "bot:permission:resolve",
  gatewayStatus: "bot:gateway:status",
  previewStart: "bot:preview:start",
  previewStop: "bot:preview:stop",
  previewStatus: "bot:preview:status",
  previewFrame: "bot:preview:frame",
  sessionsList: "bot:sessions:list",
  sessionsCreate: "bot:sessions:create",
  sessionsDelete: "bot:sessions:delete",
  sessionsSetActive: "bot:sessions:set-active",
  sessionsGetActive: "bot:sessions:get-active",
  sessionsTranscript: "bot:sessions:transcript",
  agentsList: "bot:agents:list",
  automationsList: "bot:automations:list",
  automationsSet: "bot:automations:set",
  automationsRunSkill: "bot:automations:run-skill",
  automationsRunJob: "bot:automations:run-job",
  sandboxSetBounds: "bot:sandbox:set-bounds",
  sandboxShow: "bot:sandbox:show",
  sandboxHide: "bot:sandbox:hide",
  sandboxStatus: "bot:sandbox:status",
  /** Main → renderer: please re-report mount bounds. */
  sandboxNeedBounds: "bot:sandbox:need-bounds",
} as const;
