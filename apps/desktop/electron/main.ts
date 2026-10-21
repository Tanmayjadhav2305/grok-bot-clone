import {
  app,
  BrowserWindow,
  ipcMain,
  type IpcMainInvokeEvent,
} from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { randomBytes, randomUUID } from "node:crypto";
import {
  AutomationsSettingsSchema,
  IpcChannels,
  SettingsSchema,
  defaultSettings,
  toolKey,
  withFreshBuiltinAgents,
  type AutomationsSettings,
  type McpServerConfig,
  type PermissionDecision,
  type ScheduleJob,
  type Settings,
} from "@bot-computer/contracts";
import {
  JobScheduler,
  WorkspaceStore,
  createSkillsHost,
  createTeamDelegateHost,
  createWorkspaceHost,
  runSkill,
} from "@bot-computer/automations";
import { CompositeToolHost, McpHost } from "@bot-computer/mcp-host";
import { ConnectorRegistry } from "@bot-computer/connectors";
import { GatewayServer } from "@bot-computer/gateway";
import { PermissionGate } from "@bot-computer/permissions";
import { TeamHub } from "@bot-computer/team";
import { resolveNodeBinary } from "./nodeBinary.js";
import { AgentBrowserHost } from "./agentBrowser.js";
import { ComputerUseToolHost } from "./computerUseTools.js";
import { LivePreviewStreamer } from "./previewStream.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const nodeBinary = resolveNodeBinary();

function settingsPath(): string {
  return path.join(app.getPath("userData"), "settings.json");
}

async function readSettings(): Promise<Settings> {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    return withFreshBuiltinAgents(SettingsSchema.parse(JSON.parse(raw)));
  } catch {
    return defaultSettings();
  }
}

async function writeSettings(settings: Settings): Promise<Settings> {
  const parsed = SettingsSchema.parse(settings);
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), JSON.stringify(parsed, null, 2), "utf8");
  return parsed;
}

let mainWindow: BrowserWindow | null = null;
let mcpHost = new McpHost();
const connectorRegistry = new ConnectorRegistry();
let computerUseHost: ComputerUseToolHost | null = null;
let agentBrowserHost: AgentBrowserHost | null = null;
let toolHost: CompositeToolHost | null = null;
let permissions!: PermissionGate;
let uiTeamHub!: TeamHub;
let gatewayTeamHub!: TeamHub;
let gatewayServer: GatewayServer | null = null;
let workspaceStore: WorkspaceStore | null = null;
let jobScheduler: JobScheduler | null = null;
const previewStreamer = new LivePreviewStreamer(() => mainWindow);
const pendingPermissions = new Map<
  string,
  (d: PermissionDecision) => void
>();

let latestSettings = defaultSettings();
let latestComputerUseSettings = defaultSettings().computerUse;

function makeComputerUseHost(): ComputerUseToolHost {
  return new ComputerUseToolHost(
    () => latestComputerUseSettings,
    path.join(app.getPath("userData"), "screenshots"),
    (dataUrl) => pushPreviewFrame(dataUrl),
  );
}

function syncPreview(settings: Settings): void {
  latestComputerUseSettings = settings.computerUse;
  // Host desktop stream only when explicitly enabled (sandbox is the default watch surface).
  const wantHostStream =
    settings.computerUse.livePreview &&
    (!settings.sandbox.enabled || settings.sandbox.allowHostDesktop);
  if (wantHostStream) {
    previewStreamer.start({
      maxEdge: settings.computerUse.maxEdge,
      intervalMs: settings.computerUse.previewIntervalMs,
    });
  } else {
    previewStreamer.stop();
  }
}

function ensureGatewayApiKey(settings: Settings): Settings {
  if (!settings.gateway.enabled) return settings;
  if (settings.gateway.apiKey.length > 0) return settings;
  return {
    ...settings,
    gateway: {
      ...settings.gateway,
      apiKey: randomBytes(24).toString("base64url"),
    },
  };
}

function createPermissionAsk() {
  return (request: {
    id: string;
    serverId: string;
    toolName: string;
    arguments: unknown;
  }) =>
    new Promise<PermissionDecision>((resolve) => {
      pendingPermissions.set(request.id, resolve);
      mainWindow?.webContents.send(IpcChannels.permissionRequest, request);
    });
}

function localExecServerConfig(settings: Settings): McpServerConfig | null {
  if (!settings.localExec.enabled) return null;
  const serverJs = path.join(
    __dirname,
    "..",
    "..",
    "local-exec-mcp",
    "src",
    "server.js",
  );
  return {
    id: "local-exec",
    name: "Local Exec (allowlisted)",
    transport: "stdio",
    command: nodeBinary,
    args: [serverJs],
    env: {
      BOT_COMPUTER_ALLOWLIST: settings.localExec.allowlist.join(","),
      BOT_COMPUTER_EXEC_TIMEOUT_MS: String(settings.localExec.timeoutMs),
      BOT_COMPUTER_EXEC_MAX_OUTPUT: String(settings.localExec.maxOutputBytes),
      ELECTRON_RUN_AS_NODE: "",
    },
    enabled: true,
  };
}

function pushPreviewFrame(dataUrl: string): void {
  mainWindow?.webContents.send(IpcChannels.previewFrame, {
    dataUrl,
    at: Date.now(),
  });
}

function makeAgentBrowserHost(): AgentBrowserHost {
  return new AgentBrowserHost(
    () => mainWindow,
    (dataUrl) => pushPreviewFrame(dataUrl),
    (visible) => {
      mainWindow?.webContents.send(IpcChannels.sandboxStatus, {
        visible,
        sandbox: latestSettings.sandbox.enabled,
      });
    },
    () => {
      mainWindow?.webContents.send(IpcChannels.sandboxNeedBounds, {
        at: Date.now(),
      });
    },
  );
}

function hostDesktopToolsAllowed(settings: Settings): boolean {
  if (!settings.computerUse.enabled) return false;
  if (settings.sandbox.enabled && !settings.sandbox.allowHostDesktop) {
    return false;
  }
  return true;
}

function connectorIdsFor(settings: Settings): string[] {
  // workspace/skills/team are wired in-process below — strip if listed
  return settings.connectors.enabled.filter(
    (id) => id !== "workspace" && id !== "skills" && id !== "team",
  );
}

function buildToolHost(
  settings: Settings,
  computerHost: ComputerUseToolHost,
  browserHost: AgentBrowserHost,
): CompositeToolHost {
  if (!workspaceStore) {
    workspaceStore = new WorkspaceStore(
      path.join(app.getPath("userData"), "workspace"),
    );
  }
  const connectorHosts = connectorRegistry.createHosts(
    connectorIdsFor(settings),
    {
      userDataPath: app.getPath("userData"),
      slackWebhookUrl: settings.connectors.slackWebhookUrl,
    },
  );
  const enabled = new Set(settings.connectors.enabled);
  const extra: ReturnType<typeof createWorkspaceHost>[] = [];
  if (enabled.has("workspace")) {
    extra.push(createWorkspaceHost(workspaceStore));
  }
  if (enabled.has("skills")) {
    extra.push(
      createSkillsHost({
        getSkills: () => latestSettings.automations.skills,
        getBrowser: () => {
          if (!agentBrowserHost) throw new Error("browser not ready");
          return agentBrowserHost;
        },
      }),
    );
  }
  if (enabled.has("team")) {
    extra.push(
      createTeamDelegateHost({
        listAgents: () =>
          (latestSettings.team.agents ?? []).map((a) => ({
            id: a.id,
            name: a.name,
            description: a.description,
          })),
        delegate: async (agentId, prompt) => {
          if (!uiTeamHub) {
            return { ok: false, content: "team hub not ready" };
          }
          return uiTeamHub.delegateToAgent(agentId, prompt);
        },
      }),
    );
  }
  const hosts = [mcpHost, browserHost, ...extra, ...connectorHosts];
  if (hostDesktopToolsAllowed(settings)) {
    hosts.splice(1, 0, computerHost);
  }
  return new CompositeToolHost(hosts);
}

async function runScheduledJob(job: ScheduleJob): Promise<void> {
  if (job.skillId && agentBrowserHost) {
    const skill = latestSettings.automations.skills.find(
      (s) => s.id === job.skillId,
    );
    if (skill) {
      await runSkill(skill, agentBrowserHost);
    }
  }
  const session = uiTeamHub.createSession({
    agentId: job.agentId,
    title: `Schedule: ${job.name}`,
  });
  const turnId = randomUUID();
  for await (const event of uiTeamHub.runTurn(session.id, job.prompt)) {
    mainWindow?.webContents.send(IpcChannels.chatStream, {
      turnId,
      sessionId: session.id,
      event,
    });
    if (event.type === "done" || event.type === "error") break;
  }
}

function syncScheduler(settings: Settings): void {
  jobScheduler?.stop();
  jobScheduler = new JobScheduler(
    () => latestSettings.automations.schedules,
    (job) => runScheduledJob(job),
    async (id, at) => {
      const next = {
        ...latestSettings,
        automations: {
          ...latestSettings.automations,
          schedules: latestSettings.automations.schedules.map((j) =>
            j.id === id ? { ...j, lastRunAt: at } : j,
          ),
        },
      };
      latestSettings = await writeSettings(next);
    },
  );
  jobScheduler.start();
}

function serversForHost(settings: Settings): McpServerConfig[] {
  const builtin = localExecServerConfig(settings);
  const user = settings.mcp.servers.filter((s) => s.id !== "local-exec");
  return builtin ? [builtin, ...user] : user;
}

function rebuildTeamHubs(): void {
  const visionOpts = {
    getVision: () => latestSettings.computerUse.vision,
    getMaxToolSteps: (agent: { id: string }) =>
      agent.id === "computer" ||
      agent.id === "researcher" ||
      latestSettings.computerUse.vision
        ? 20
        : 8,
  };
  uiTeamHub = new TeamHub({
    getToolHost: () => {
      if (!toolHost) throw new Error("tool host not ready");
      return toolHost;
    },
    createPermissions: () => permissions,
    getModel: () => latestSettings.model,
    getAgents: () => latestSettings.team.agents,
    ...visionOpts,
  });
  uiTeamHub.ensureActiveSession();

  gatewayTeamHub = new TeamHub({
    getToolHost: () => {
      if (!toolHost) throw new Error("tool host not ready");
      return toolHost;
    },
    createPermissions: () =>
      new PermissionGate(permissions.listAlwaysAllow(), async () => "deny"),
    getModel: () => latestSettings.model,
    getAgents: () => latestSettings.team.agents,
    ...visionOpts,
  });
}

async function syncGateway(settings: Settings): Promise<void> {
  if (!gatewayServer) {
    gatewayServer = new GatewayServer({
      getTeamHub: () => gatewayTeamHub,
      getToolHost: () => {
        if (!toolHost) throw new Error("tool host not ready");
        return toolHost;
      },
    });
  }
  if (!settings.gateway.enabled) {
    await gatewayServer.stop();
    return;
  }
  if (!settings.gateway.apiKey) {
    console.warn("Gateway enabled but apiKey empty — not starting");
    await gatewayServer.stop();
    return;
  }
  try {
    await gatewayServer.start({
      host: settings.gateway.host,
      port: settings.gateway.port,
      apiKey: settings.gateway.apiKey,
    });
  } catch (err) {
    console.error("Failed to start gateway:", err);
  }
}

async function rebuildRuntime(): Promise<void> {
  const loaded = await readSettings();
  const withKey = ensureGatewayApiKey(loaded);
  const settings =
    withKey.gateway.apiKey !== loaded.gateway.apiKey
      ? await writeSettings(withKey)
      : withKey;
  latestSettings = settings;
  latestComputerUseSettings = settings.computerUse;
  const { failures } = await mcpHost.reload(serversForHost(settings));
  if (failures.length > 0) {
    console.warn(
      "Some MCP servers failed to start:",
      failures.map((f) => `${f.id}: ${f.error}`).join("; "),
    );
  }
  computerUseHost = makeComputerUseHost();
  agentBrowserHost?.dispose();
  agentBrowserHost = makeAgentBrowserHost();
  toolHost = buildToolHost(settings, computerUseHost, agentBrowserHost);
  permissions = new PermissionGate(
    settings.permissions.alwaysAllow,
    createPermissionAsk(),
  );
  rebuildTeamHubs();
  await syncGateway(settings);
  syncPreview(settings);
  syncScheduler(settings);
}

function createWindow(): void {
  mainWindow = new BrowserWindow({
    width: 1440,
    height: 860,
    backgroundColor: "#07080a",
    title: "Bot Computer",
    webPreferences: {
      preload: path.join(__dirname, "preload.mjs"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: false,
    },
  });

  const renderer = path.join(__dirname, "..", "dist-renderer", "index.html");
  void mainWindow.loadFile(renderer);
  mainWindow.on("closed", () => {
    previewStreamer.stop();
    mainWindow = null;
  });
  mainWindow.webContents.on("did-finish-load", () => {
    syncPreview(latestSettings);
  });
}

function registerIpc(): void {
  ipcMain.handle(IpcChannels.settingsGet, async () => readSettings());

  ipcMain.handle(
    IpcChannels.settingsSet,
    async (_e: IpcMainInvokeEvent, next: unknown) => {
      const saved = await writeSettings(
        ensureGatewayApiKey(SettingsSchema.parse(next)),
      );
      latestSettings = saved;
      latestComputerUseSettings = saved.computerUse;
      permissions.setAlwaysAllow(saved.permissions.alwaysAllow);
      await mcpHost.reload(serversForHost(saved));
      computerUseHost = makeComputerUseHost();
      agentBrowserHost?.dispose();
      agentBrowserHost = makeAgentBrowserHost();
      toolHost = buildToolHost(saved, computerUseHost, agentBrowserHost);
      rebuildTeamHubs();
      await syncGateway(saved);
      syncPreview(saved);
      syncScheduler(saved);
      return saved;
    },
  );

  ipcMain.handle(IpcChannels.automationsList, async () => {
    return latestSettings.automations;
  });

  ipcMain.handle(
    IpcChannels.automationsSet,
    async (_e, next: unknown) => {
      const automations = AutomationsSettingsSchema.parse(next);
      const saved = await writeSettings({
        ...latestSettings,
        automations,
      });
      latestSettings = saved;
      syncScheduler(saved);
      // Rebuild tool hosts so skills list updates
      if (computerUseHost && agentBrowserHost) {
        toolHost = buildToolHost(saved, computerUseHost, agentBrowserHost);
        rebuildTeamHubs();
      }
      return saved.automations as AutomationsSettings;
    },
  );

  ipcMain.handle(
    IpcChannels.automationsRunSkill,
    async (_e, payload: { id: string }) => {
      const skill = latestSettings.automations.skills.find(
        (s) => s.id === payload.id,
      );
      if (!skill || !agentBrowserHost) {
        return { ok: false, content: "skill or browser missing" };
      }
      const result = await runSkill(skill, agentBrowserHost);
      return result;
    },
  );

  ipcMain.handle(
    IpcChannels.automationsRunJob,
    async (_e, payload: { id: string }) => {
      if (!jobScheduler) return { ok: false };
      const ok = await jobScheduler.runNow(payload.id);
      return { ok };
    },
  );

  ipcMain.handle(
    IpcChannels.sandboxSetBounds,
    async (
      _e,
      bounds: { x: number; y: number; width: number; height: number },
    ) => {
      agentBrowserHost?.setBounds(bounds);
      return true;
    },
  );

  ipcMain.handle(IpcChannels.sandboxShow, async () => {
    agentBrowserHost?.show();
    return { visible: true };
  });

  ipcMain.handle(IpcChannels.sandboxHide, async () => {
    agentBrowserHost?.hide();
    return { visible: false };
  });

  ipcMain.handle(IpcChannels.sandboxStatus, async () => ({
    visible: agentBrowserHost?.isVisible() ?? false,
    sandbox: latestSettings.sandbox.enabled,
  }));

  ipcMain.handle(IpcChannels.previewStart, async () => {
    syncPreview({
      ...latestSettings,
      computerUse: { ...latestSettings.computerUse, livePreview: true },
    });
    return previewStreamer.status();
  });

  ipcMain.handle(IpcChannels.previewStop, async () => {
    previewStreamer.stop();
    return previewStreamer.status();
  });

  ipcMain.handle(IpcChannels.previewStatus, async () => previewStreamer.status());

  ipcMain.handle(IpcChannels.gatewayStatus, async () => {
    return (
      gatewayServer?.status() ?? {
        listening: false,
        url: null,
        host: null,
        port: null,
      }
    );
  });

  ipcMain.handle(IpcChannels.mcpList, async () => {
    const tools = (await toolHost?.listTools()) ?? [];
    return {
      servers: mcpHost.listServers(),
      tools,
    };
  });

  ipcMain.handle(IpcChannels.mcpReload, async () => {
    await rebuildRuntime();
    return {
      servers: mcpHost.listServers(),
      tools: (await toolHost?.listTools()) ?? [],
    };
  });

  ipcMain.handle(IpcChannels.agentsList, async () => uiTeamHub.listAgents());

  ipcMain.handle(IpcChannels.sessionsList, async () => uiTeamHub.listSessions());

  ipcMain.handle(
    IpcChannels.sessionsCreate,
    async (_e, payload?: { agentId?: string; title?: string }) => {
      return uiTeamHub.createSession(payload);
    },
  );

  ipcMain.handle(
    IpcChannels.sessionsDelete,
    async (_e, payload: { id: string }) => {
      const ok = uiTeamHub.deleteSession(payload.id);
      if (!uiTeamHub.getActiveSessionId()) {
        uiTeamHub.ensureActiveSession();
      }
      return {
        ok,
        activeId: uiTeamHub.getActiveSessionId(),
        sessions: uiTeamHub.listSessions(),
      };
    },
  );

  ipcMain.handle(
    IpcChannels.sessionsSetActive,
    async (_e, payload: { id: string }) => {
      const info = uiTeamHub.setActiveSession(payload.id);
      return info;
    },
  );

  ipcMain.handle(IpcChannels.sessionsGetActive, async () => {
    const id = uiTeamHub.getActiveSessionId();
    if (!id) {
      const created = uiTeamHub.ensureActiveSession();
      return { session: created, transcript: uiTeamHub.getTranscript(created.id) };
    }
    const session = uiTeamHub.listSessions().find((s) => s.id === id) ?? null;
    return {
      session,
      transcript: id ? uiTeamHub.getTranscript(id) : [],
    };
  });

  ipcMain.handle(
    IpcChannels.sessionsTranscript,
    async (_e, payload: { id: string }) => {
      return uiTeamHub.getTranscript(payload.id);
    },
  );

  ipcMain.handle(
    IpcChannels.permissionResolve,
    async (
      _e,
      payload: {
        id: string;
        decision: PermissionDecision;
        serverId?: string;
        toolName?: string;
      },
    ) => {
      const resolve = pendingPermissions.get(payload.id);
      if (!resolve) return false;
      pendingPermissions.delete(payload.id);
      resolve(payload.decision);
      if (
        payload.decision === "allow-always" &&
        payload.serverId &&
        payload.toolName
      ) {
        const settings = await readSettings();
        const key = toolKey(payload.serverId, payload.toolName);
        if (!settings.permissions.alwaysAllow.includes(key)) {
          settings.permissions.alwaysAllow = [
            ...settings.permissions.alwaysAllow,
            key,
          ];
        }
        await writeSettings(settings);
        latestSettings = settings;
        permissions.setAlwaysAllow(settings.permissions.alwaysAllow);
      }
      return true;
    },
  );

  ipcMain.handle(
    IpcChannels.chatSend,
    async (_e, payload: { text: string; sessionId?: string }) => {
      const session =
        (payload.sessionId
          ? uiTeamHub.setActiveSession(payload.sessionId)
          : null) ?? uiTeamHub.ensureActiveSession();
      const turnId = randomUUID();
      const sessionId = session.id;
      void (async () => {
        try {
          for await (const event of uiTeamHub.runTurn(sessionId, payload.text)) {
            mainWindow?.webContents.send(IpcChannels.chatStream, {
              turnId,
              sessionId,
              event,
            });
            if (event.type === "done" || event.type === "error") break;
          }
        } catch (err) {
          mainWindow?.webContents.send(IpcChannels.chatStream, {
            turnId,
            sessionId,
            event: {
              type: "error",
              message: err instanceof Error ? err.message : String(err),
            },
          });
        }
      })();
      return { turnId, sessionId };
    },
  );

  ipcMain.handle(
    IpcChannels.chatCancel,
    async (_e, payload?: { sessionId?: string }) => {
      uiTeamHub.cancel(payload?.sessionId);
      return true;
    },
  );
}

void app
  .whenReady()
  .then(async () => {
    await rebuildRuntime();
    registerIpc();
    createWindow();
  })
  .catch((err) => {
    console.error("Bot Computer failed to start:", err);
    app.quit();
  });

app.on("window-all-closed", () => {
  previewStreamer.stop();
  jobScheduler?.stop();
  jobScheduler = null;
  agentBrowserHost?.dispose();
  agentBrowserHost = null;
  void gatewayServer?.stop();
  void mcpHost.dispose();
  if (process.platform !== "darwin") app.quit();
});

app.on("activate", () => {
  if (BrowserWindow.getAllWindows().length === 0) createWindow();
});
