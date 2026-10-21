import { contextBridge, ipcRenderer } from "electron";

const IpcChannels = {
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
  sandboxNeedBounds: "bot:sandbox:need-bounds",
} as const;

export type SessionInfo = {
  id: string;
  title: string;
  agentId: string;
  createdAt: number;
  updatedAt: number;
};

export type AgentInfo = {
  id: string;
  name: string;
  systemPrompt: string;
  modelId?: string;
};

export type BotApi = {
  desktop: {
    getSettings: () => Promise<unknown>;
    setSettings: (settings: unknown) => Promise<unknown>;
  };
  agent: {
    send: (
      text: string,
      sessionId?: string,
    ) => Promise<{ turnId: string; sessionId: string }>;
    cancel: (sessionId?: string) => Promise<boolean>;
    onStream: (
      cb: (payload: {
        turnId: string;
        sessionId?: string;
        event: unknown;
      }) => void,
    ) => () => void;
  };
  mcp: {
    list: () => Promise<unknown>;
    reload: () => Promise<unknown>;
  };
  gateway: {
    status: () => Promise<{
      listening: boolean;
      url: string | null;
      host: string | null;
      port: number | null;
    }>;
  };
  preview: {
    start: () => Promise<{ running: boolean; intervalMs: number; maxEdge: number }>;
    stop: () => Promise<{ running: boolean; intervalMs: number; maxEdge: number }>;
    status: () => Promise<{ running: boolean; intervalMs: number; maxEdge: number }>;
    onFrame: (
      cb: (frame: {
        dataUrl?: string;
        error?: string;
        width?: number;
        height?: number;
        at: number;
      }) => void,
    ) => () => void;
  };
  team: {
    listAgents: () => Promise<AgentInfo[]>;
    listSessions: () => Promise<SessionInfo[]>;
    createSession: (payload?: {
      agentId?: string;
      title?: string;
    }) => Promise<SessionInfo>;
    deleteSession: (
      id: string,
    ) => Promise<{ ok: boolean; activeId: string | null; sessions: SessionInfo[] }>;
    setActive: (id: string) => Promise<SessionInfo | null>;
    getActive: () => Promise<{
      session: SessionInfo | null;
      transcript: Array<{ role: string; content: string }>;
    }>;
  };
  permissions: {
    onRequest: (
      cb: (request: {
        id: string;
        serverId: string;
        toolName: string;
        arguments: unknown;
      }) => void,
    ) => () => void;
    resolve: (payload: {
      id: string;
      decision: "allow-once" | "allow-always" | "deny";
      serverId?: string;
      toolName?: string;
    }) => Promise<boolean>;
  };
  automations: {
    list: () => Promise<{
      schedules: Array<Record<string, unknown>>;
      skills: Array<Record<string, unknown>>;
    }>;
    set: (automations: unknown) => Promise<{
      schedules: Array<Record<string, unknown>>;
      skills: Array<Record<string, unknown>>;
    }>;
    runSkill: (id: string) => Promise<unknown>;
    runJob: (id: string) => Promise<{ ok: boolean }>;
  };
  sandbox: {
    setBounds: (bounds: {
      x: number;
      y: number;
      width: number;
      height: number;
    }) => Promise<boolean>;
    show: () => Promise<{ visible: boolean }>;
    hide: () => Promise<{ visible: boolean }>;
    status: () => Promise<{ visible: boolean; sandbox: boolean }>;
    onStatus: (
      cb: (status: { visible: boolean; sandbox: boolean }) => void,
    ) => () => void;
    onNeedBounds: (cb: () => void) => () => void;
  };
};

const api: BotApi = {
  desktop: {
    getSettings: () => ipcRenderer.invoke(IpcChannels.settingsGet),
    setSettings: (settings) =>
      ipcRenderer.invoke(IpcChannels.settingsSet, settings),
  },
  agent: {
    send: (text, sessionId) =>
      ipcRenderer.invoke(IpcChannels.chatSend, { text, sessionId }),
    cancel: (sessionId) =>
      ipcRenderer.invoke(IpcChannels.chatCancel, { sessionId }),
    onStream: (cb) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        payload: { turnId: string; sessionId?: string; event: unknown },
      ) => cb(payload);
      ipcRenderer.on(IpcChannels.chatStream, listener);
      return () => ipcRenderer.removeListener(IpcChannels.chatStream, listener);
    },
  },
  mcp: {
    list: () => ipcRenderer.invoke(IpcChannels.mcpList),
    reload: () => ipcRenderer.invoke(IpcChannels.mcpReload),
  },
  gateway: {
    status: () => ipcRenderer.invoke(IpcChannels.gatewayStatus),
  },
  preview: {
    start: () => ipcRenderer.invoke(IpcChannels.previewStart),
    stop: () => ipcRenderer.invoke(IpcChannels.previewStop),
    status: () => ipcRenderer.invoke(IpcChannels.previewStatus),
    onFrame: (cb) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        frame: {
          dataUrl?: string;
          error?: string;
          width?: number;
          height?: number;
          at: number;
        },
      ) => cb(frame);
      ipcRenderer.on(IpcChannels.previewFrame, listener);
      return () =>
        ipcRenderer.removeListener(IpcChannels.previewFrame, listener);
    },
  },
  team: {
    listAgents: () => ipcRenderer.invoke(IpcChannels.agentsList),
    listSessions: () => ipcRenderer.invoke(IpcChannels.sessionsList),
    createSession: (payload) =>
      ipcRenderer.invoke(IpcChannels.sessionsCreate, payload),
    deleteSession: (id) =>
      ipcRenderer.invoke(IpcChannels.sessionsDelete, { id }),
    setActive: (id) =>
      ipcRenderer.invoke(IpcChannels.sessionsSetActive, { id }),
    getActive: () => ipcRenderer.invoke(IpcChannels.sessionsGetActive),
  },
  permissions: {
    onRequest: (cb) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        request: {
          id: string;
          serverId: string;
          toolName: string;
          arguments: unknown;
        },
      ) => cb(request);
      ipcRenderer.on(IpcChannels.permissionRequest, listener);
      return () =>
        ipcRenderer.removeListener(IpcChannels.permissionRequest, listener);
    },
    resolve: (payload) =>
      ipcRenderer.invoke(IpcChannels.permissionResolve, payload),
  },
  automations: {
    list: () => ipcRenderer.invoke(IpcChannels.automationsList),
    set: (automations) =>
      ipcRenderer.invoke(IpcChannels.automationsSet, automations),
    runSkill: (id) =>
      ipcRenderer.invoke(IpcChannels.automationsRunSkill, { id }),
    runJob: (id) => ipcRenderer.invoke(IpcChannels.automationsRunJob, { id }),
  },
  sandbox: {
    setBounds: (bounds) =>
      ipcRenderer.invoke(IpcChannels.sandboxSetBounds, bounds),
    show: () => ipcRenderer.invoke(IpcChannels.sandboxShow),
    hide: () => ipcRenderer.invoke(IpcChannels.sandboxHide),
    status: () => ipcRenderer.invoke(IpcChannels.sandboxStatus),
    onStatus: (cb) => {
      const listener = (
        _e: Electron.IpcRendererEvent,
        status: { visible: boolean; sandbox: boolean },
      ) => cb(status);
      ipcRenderer.on(IpcChannels.sandboxStatus, listener);
      return () =>
        ipcRenderer.removeListener(IpcChannels.sandboxStatus, listener);
    },
    onNeedBounds: (cb) => {
      const listener = () => cb();
      ipcRenderer.on(IpcChannels.sandboxNeedBounds, listener);
      return () =>
        ipcRenderer.removeListener(IpcChannels.sandboxNeedBounds, listener);
    },
  },
};

contextBridge.exposeInMainWorld("bot", api);
