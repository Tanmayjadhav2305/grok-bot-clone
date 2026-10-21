import { useEffect, useMemo, useRef, useState } from "react";

type AgentProfile = {
  id: string;
  name: string;
  description: string;
  systemPrompt: string;
  modelId?: string;
};

type Settings = {
  model: { baseUrl: string; apiKey: string; modelId: string };
  mcp: {
    servers: Array<{
      id: string;
      name: string;
      command?: string;
      args?: string[];
      transport?: string;
      url?: string;
      enabled: boolean;
    }>;
  };
  permissions: { alwaysAllow: string[] };
  localExec: {
    enabled: boolean;
    allowlist: string[];
    timeoutMs: number;
    maxOutputBytes: number;
  };
  sandbox?: {
    enabled: boolean;
    allowHostDesktop: boolean;
  };
  computerUse: {
    enabled: boolean;
    allowInput: boolean;
    maxEdge: number;
    livePreview: boolean;
    previewIntervalMs: number;
    vision: boolean;
  };
  connectors: {
    enabled: string[];
    slackWebhookUrl?: string;
  };
  gateway: {
    enabled: boolean;
    host: string;
    port: number;
    apiKey: string;
  };
  team: {
    agents: AgentProfile[];
  };
  automations?: {
    schedules: Array<{
      id: string;
      name: string;
      enabled: boolean;
      dailyAt: string;
      intervalMinutes?: number;
      agentId: string;
      prompt: string;
      skillId?: string;
      lastRunAt?: number;
    }>;
    skills: Array<{
      id: string;
      name: string;
      description: string;
      steps: unknown[];
    }>;
  };
};

type AutomationsState = NonNullable<Settings["automations"]>;

type ChatItem =
  | { kind: "user"; text: string }
  | { kind: "assistant"; text: string }
  | { kind: "tool"; text: string }
  | { kind: "proof"; dataUrl: string; caption?: string }
  | { kind: "error"; text: string };

type PermissionRequest = {
  id: string;
  serverId: string;
  toolName: string;
  arguments: unknown;
};

type SessionInfo = {
  id: string;
  title: string;
  agentId: string;
  createdAt: number;
  updatedAt: number;
};

type AgentInfo = {
  id: string;
  name: string;
  description?: string;
  systemPrompt: string;
  modelId?: string;
};

function messageText(content: unknown): string {
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content
      .map((p) =>
        p && typeof p === "object" && "text" in p
          ? String((p as { text: unknown }).text)
          : "",
      )
      .filter(Boolean)
      .join("\n");
  }
  return "";
}

function transcriptToItems(
  transcript: Array<{ role: string; content: unknown }>,
): ChatItem[] {
  const items: ChatItem[] = [];
  for (const m of transcript) {
    const text = messageText(m.content);
    if (m.role === "user" && text) items.push({ kind: "user", text });
    else if (m.role === "assistant" && text)
      items.push({ kind: "assistant", text });
    else if (m.role === "tool" && text) items.push({ kind: "tool", text });
  }
  return items;
}

function slugify(name: string): string {
  return (
    name
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "")
      .slice(0, 40) || `bot-${Date.now().toString(36)}`
  );
}

export function App() {
  const [tab, setTab] = useState<"chat" | "bots" | "automations" | "settings">(
    "chat",
  );
  const [automations, setAutomations] = useState<AutomationsState>({
    schedules: [],
    skills: [],
  });
  const [schedulesJson, setSchedulesJson] = useState("[]");
  const [skillsJson, setSkillsJson] = useState("[]");
  const [settings, setSettings] = useState<Settings | null>(null);
  const [mcpJson, setMcpJson] = useState("[]");
  const [allowlistText, setAllowlistText] = useState("node, git");
  const [items, setItems] = useState<ChatItem[]>([]);
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [respondingLabel, setRespondingLabel] = useState("Thinking…");
  const [permission, setPermission] = useState<PermissionRequest | null>(null);
  const [status, setStatus] = useState("");
  const messagesEndRef = useRef<HTMLDivElement | null>(null);
  const [gatewayStatus, setGatewayStatus] = useState<{
    listening: boolean;
    url: string | null;
  }>({ listening: false, url: null });
  const [sessions, setSessions] = useState<SessionInfo[]>([]);
  const [agents, setAgents] = useState<AgentInfo[]>([]);
  const [activeSessionId, setActiveSessionId] = useState<string | null>(null);
  const [newAgentId, setNewAgentId] = useState("computer");
  const [showPreview, setShowPreview] = useState(true);
  const [previewFrame, setPreviewFrame] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);
  const [previewLive, setPreviewLive] = useState(false);
  const [sandboxVisible, setSandboxVisible] = useState(false);
  const sandboxMountRef = useRef<HTMLDivElement | null>(null);
  const [editingBotId, setEditingBotId] = useState<string | null>(null);
  const [botDraft, setBotDraft] = useState<AgentProfile>({
    id: "",
    name: "",
    description: "",
    systemPrompt: "",
    modelId: "",
  });
  const activeSessionIdRef = useRef<string | null>(null);
  activeSessionIdRef.current = activeSessionId;

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [items, busy]);

  useEffect(() => {
    const el = sandboxMountRef.current;
    if (!el || !showPreview) {
      void window.bot.sandbox.hide();
      return;
    }
    const report = () => {
      const r = el.getBoundingClientRect();
      if (r.width < 8 || r.height < 8) return;
      void window.bot.sandbox.setBounds({
        x: r.x,
        y: r.y,
        width: r.width,
        height: r.height,
      });
    };
    report();
    const ro = new ResizeObserver(report);
    ro.observe(el);
    window.addEventListener("resize", report);
    const offStatus = window.bot.sandbox.onStatus((s) =>
      setSandboxVisible(s.visible),
    );
    const offNeed = window.bot.sandbox.onNeedBounds(() => report());
    void window.bot.sandbox.status().then((s) => setSandboxVisible(s.visible));
    return () => {
      ro.disconnect();
      window.removeEventListener("resize", report);
      offStatus();
      offNeed();
      void window.bot.sandbox.hide();
    };
  }, [showPreview, tab]);

  async function refreshTeam() {
    const [agentList, sessionList, active] = await Promise.all([
      window.bot.team.listAgents(),
      window.bot.team.listSessions(),
      window.bot.team.getActive(),
    ]);
    setAgents(agentList);
    setSessions(sessionList);
    setActiveSessionId(active.session?.id ?? null);
    if (active.session) {
      setItems(transcriptToItems(active.transcript));
    }
    if (agentList[0] && !agentList.some((a) => a.id === newAgentId)) {
      setNewAgentId(agentList[0].id);
    }
  }

  useEffect(() => {
    void window.bot.desktop.getSettings().then((s) => {
      const settings = s as Settings;
      setSettings(settings);
      setMcpJson(JSON.stringify(settings.mcp.servers, null, 2));
      setAllowlistText(
        (settings.localExec?.allowlist ?? ["node", "git"]).join(", "),
      );
    });
    void window.bot.gateway.status().then((s) =>
      setGatewayStatus({ listening: s.listening, url: s.url }),
    );
    void window.bot.preview.status().then((s) => setPreviewLive(s.running));
    void window.bot.automations.list().then((a) => {
      const auto = a as AutomationsState;
      setAutomations(auto);
      setSchedulesJson(JSON.stringify(auto.schedules ?? [], null, 2));
      setSkillsJson(JSON.stringify(auto.skills ?? [], null, 2));
    });
    void refreshTeam();

    const offFrame = window.bot.preview.onFrame((frame) => {
      if (frame.error) {
        setPreviewError(frame.error);
        return;
      }
      if (frame.dataUrl) {
        setPreviewFrame(frame.dataUrl);
        setPreviewError(null);
        setPreviewLive(true);
      }
    });

    const offStream = window.bot.agent.onStream(({ sessionId, event }) => {
      if (
        sessionId &&
        activeSessionIdRef.current &&
        sessionId !== activeSessionIdRef.current
      ) {
        return;
      }
      const ev = event as {
        type: string;
        text?: string;
        message?: string;
        serverId?: string;
        toolName?: string;
        content?: string;
        ok?: boolean;
        dataUrl?: string;
        caption?: string;
      };
      if (ev.type === "token" && ev.text) {
        setRespondingLabel("Writing…");
        setItems((prev) => {
          const last = prev[prev.length - 1];
          if (last?.kind === "assistant") {
            return [
              ...prev.slice(0, -1),
              { kind: "assistant", text: last.text + ev.text },
            ];
          }
          return [...prev, { kind: "assistant", text: ev.text! }];
        });
      } else if (ev.type === "tool_call") {
        setRespondingLabel(
          `Using ${ev.serverId}/${ev.toolName}…`,
        );
        setItems((prev) => [
          ...prev,
          { kind: "tool", text: `→ ${ev.serverId}/${ev.toolName}` },
        ]);
      } else if (ev.type === "tool_result") {
        setRespondingLabel("Thinking…");
        const snippet = (ev.content ?? "").slice(0, 280);
        setItems((prev) => [
          ...prev,
          {
            kind: "tool",
            text: `${ev.ok ? "ok" : "err"} ${ev.serverId}/${ev.toolName}${
              snippet ? `: ${snippet}` : ""
            }`,
          },
        ]);
      } else if (ev.type === "proof_image" && ev.dataUrl) {
        setPreviewFrame(ev.dataUrl);
        setPreviewLive(true);
        setItems((prev) => [
          ...prev,
          {
            kind: "proof",
            dataUrl: ev.dataUrl!,
            caption: ev.caption,
          },
        ]);
      } else if (ev.type === "error") {
        setBusy(false);
        setRespondingLabel("Thinking…");
        setItems((prev) => [
          ...prev,
          { kind: "error", text: ev.message ?? "error" },
        ]);
      } else if (ev.type === "done") {
        setBusy(false);
        setRespondingLabel("Thinking…");
        void window.bot.team.listSessions().then(setSessions);
      }
    });
    const offPerm = window.bot.permissions.onRequest((req) =>
      setPermission(req),
    );
    return () => {
      offStream();
      offPerm();
      offFrame();
    };
  }, []);

  async function togglePreview() {
    if (showPreview) {
      await window.bot.sandbox.hide();
      await window.bot.preview.stop();
      setPreviewLive(false);
      setSandboxVisible(false);
      setShowPreview(false);
      return;
    }
    setShowPreview(true);
    await window.bot.sandbox.show();
  }

  const modelFields = useMemo(() => settings?.model, [settings]);
  const activeSession = sessions.find((s) => s.id === activeSessionId) ?? null;
  const activeAgentName =
    agents.find((a) => a.id === activeSession?.agentId)?.name ??
    activeSession?.agentId ??
    "—";

  async function persistAgents(nextAgents: AgentProfile[]): Promise<boolean> {
    if (!settings) return false;
    const next = {
      ...settings,
      team: { agents: nextAgents },
    };
    const saved = (await window.bot.desktop.setSettings(next)) as Settings;
    setSettings(saved);
    await refreshTeam();
    return true;
  }

  async function saveSettings() {
    if (!settings) return;
    let servers = settings.mcp.servers;
    try {
      servers = JSON.parse(mcpJson) as Settings["mcp"]["servers"];
    } catch {
      setStatus("MCP servers JSON is invalid");
      return;
    }
    const allowlist = allowlistText
      .split(/[,;\n]/)
      .map((s) => s.trim())
      .filter(Boolean);
    const next = {
      ...settings,
      mcp: { servers },
      localExec: {
        ...settings.localExec,
        allowlist,
      },
      sandbox: settings.sandbox ?? { enabled: true, allowHostDesktop: false },
      computerUse: settings.computerUse,
      connectors: settings.connectors ?? {
        enabled: [],
        slackWebhookUrl: "",
      },
      gateway: settings.gateway ?? {
        enabled: false,
        host: "127.0.0.1",
        port: 8787,
        apiKey: "",
      },
      team: settings.team,
      automations: settings.automations ?? automations,
    };
    const saved = (await window.bot.desktop.setSettings(next)) as Settings;
    setSettings(saved);
    setMcpJson(JSON.stringify(saved.mcp.servers, null, 2));
    setAllowlistText(saved.localExec.allowlist.join(", "));
    const gs = await window.bot.gateway.status();
    setGatewayStatus({ listening: gs.listening, url: gs.url });
    await refreshTeam();
    setStatus("Settings saved");
  }

  function startCreateBot() {
    setEditingBotId("new");
    setBotDraft({
      id: "",
      name: "",
      description: "",
      systemPrompt:
        "You are a Bot Computer agent. Use browser/* tools for web tasks with screenshots as proof. Be concise.",
      modelId: "",
    });
  }

  function startEditBot(agent: AgentInfo) {
    setEditingBotId(agent.id);
    setBotDraft({
      id: agent.id,
      name: agent.name,
      description: agent.description ?? "",
      systemPrompt: agent.systemPrompt,
      modelId: agent.modelId ?? "",
    });
  }

  async function saveBot() {
    if (!settings) return;
    const name = botDraft.name.trim();
    const systemPrompt = botDraft.systemPrompt.trim();
    if (!name || !systemPrompt) {
      setStatus("Bot name and instructions are required");
      return;
    }
    const id =
      editingBotId && editingBotId !== "new"
        ? editingBotId
        : slugify(botDraft.id.trim() || name);
    const profile: AgentProfile = {
      id,
      name,
      description: botDraft.description.trim(),
      systemPrompt,
      ...(botDraft.modelId?.trim()
        ? { modelId: botDraft.modelId.trim() }
        : {}),
    };
    const existing = settings.team.agents;
    const next =
      editingBotId && editingBotId !== "new"
        ? existing.map((a) => (a.id === editingBotId ? profile : a))
        : existing.some((a) => a.id === id)
          ? existing.map((a) => (a.id === id ? profile : a))
          : [...existing, profile];
    const ok = await persistAgents(next);
    if (ok) {
      setEditingBotId(null);
      setStatus(`Saved bot “${name}”`);
      setNewAgentId(id);
    }
  }

  async function deleteBot(id: string) {
    if (!settings) return;
    if (settings.team.agents.length <= 1) {
      setStatus("Keep at least one bot");
      return;
    }
    const next = settings.team.agents.filter((a) => a.id !== id);
    const ok = await persistAgents(next);
    if (ok) {
      if (editingBotId === id) setEditingBotId(null);
      setStatus("Bot deleted");
    }
  }

  async function send() {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft("");
    setBusy(true);
    setRespondingLabel("Thinking…");
    setItems((prev) => [...prev, { kind: "user", text }]);
    const result = await window.bot.agent.send(
      text,
      activeSessionId ?? undefined,
    );
    setActiveSessionId(result.sessionId);
  }

  async function stop() {
    await window.bot.agent.cancel(activeSessionId ?? undefined);
    setBusy(false);
    setRespondingLabel("Thinking…");
  }

  async function switchSession(id: string) {
    const info = await window.bot.team.setActive(id);
    if (!info) return;
    setActiveSessionId(info.id);
    const transcript = await window.bot.team.getActive();
    setItems(transcriptToItems(transcript.transcript));
    setSessions(await window.bot.team.listSessions());
  }

  async function createSession() {
    const session = await window.bot.team.createSession({
      agentId: newAgentId,
    });
    setSessions(await window.bot.team.listSessions());
    setActiveSessionId(session.id);
    setItems([]);
  }

  async function deleteSession(id: string) {
    const result = await window.bot.team.deleteSession(id);
    setSessions(result.sessions);
    setActiveSessionId(result.activeId);
    const active = await window.bot.team.getActive();
    setItems(transcriptToItems(active.transcript));
  }

  return (
    <div className="shell">
      <aside className="nav">
        <div className="brand" title="Bot Computer">
          <div className="brand-mark">BC</div>
        </div>
        <button
          className={tab === "chat" ? "active" : ""}
          onClick={() => setTab("chat")}
          type="button"
        >
          <span className="nav-icon">⌘</span>
          Chat
        </button>
        <button
          className={tab === "bots" ? "active" : ""}
          onClick={() => setTab("bots")}
          type="button"
        >
          <span className="nav-icon">◈</span>
          Bots
        </button>
        <button
          className={tab === "automations" ? "active" : ""}
          onClick={() => setTab("automations")}
          type="button"
        >
          <span className="nav-icon">↻</span>
          Auto
        </button>
        <button
          className={tab === "settings" ? "active" : ""}
          onClick={() => setTab("settings")}
          type="button"
        >
          <span className="nav-icon">⚙</span>
          Settings
        </button>
        <p className="nav-foot">Local-first agent desktop</p>
      </aside>

      <section className="main">
        {tab === "chat" ? (
          <div
            className={
              showPreview ? "chat-layout with-preview" : "chat-layout"
            }
          >
            <aside className="sessions">
              <div className="sessions-head">
                <h2>Sessions</h2>
                <div className="sessions-toolbar">
                  <select
                    value={newAgentId}
                    onChange={(e) => setNewAgentId(e.target.value)}
                    aria-label="Bot for new session"
                  >
                    {agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name}
                      </option>
                    ))}
                  </select>
                  <button type="button" onClick={() => void createSession()}>
                    New
                  </button>
                </div>
              </div>
              <ul className="session-list">
                {sessions.map((s) => (
                  <li key={s.id}>
                    <button
                      type="button"
                      className={
                        s.id === activeSessionId ? "session active" : "session"
                      }
                      onClick={() => void switchSession(s.id)}
                    >
                      <span className="session-title">{s.title}</span>
                      <span className="session-meta">
                        {agents.find((a) => a.id === s.agentId)?.name ??
                          s.agentId}
                      </span>
                    </button>
                    <button
                      type="button"
                      className="session-delete"
                      title="Delete session"
                      onClick={() => void deleteSession(s.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
            </aside>
            <div className="chat-pane">
              <div className="chat-header">
                <div className="chat-header-title">
                  <strong>{activeAgentName}</strong>
                  <span>
                    {activeSession?.title ?? "New conversation"} · Agent Browser
                    + tools
                  </span>
                </div>
                <button
                  type="button"
                  className="preview-toggle"
                  onClick={() => void togglePreview()}
                >
                  {showPreview ? "Hide sandbox" : "Show sandbox"}
                </button>
              </div>
              <div className="messages">
                {items.length === 0 && !busy && (
                  <div className="empty-state">
                    <h3>Give it a real task</h3>
                    <p>
                      Create or pick a bot in <strong>Bots</strong>, start a
                      session with <strong>Computer</strong> or{" "}
                      <strong>Researcher</strong>, then try: “Open the Agent
                      Browser and find 5 AI news articles from today — show proof
                      screenshots.” Always-allow <code>browser/*</code> tools when
                      prompted.
                    </p>
                  </div>
                )}
                {items.map((item, i) =>
                  item.kind === "proof" ? (
                    <div key={i} className="bubble proof">
                      {item.caption && (
                        <div className="proof-caption">{item.caption}</div>
                      )}
                      <img src={item.dataUrl} alt={item.caption ?? "Proof"} />
                    </div>
                  ) : (
                    <div key={i} className={`bubble ${item.kind}`}>
                      {item.text}
                    </div>
                  ),
                )}
                {busy && (
                  <div className="bubble responding" aria-live="polite">
                    <span className="responding-dots" aria-hidden>
                      <i />
                      <i />
                      <i />
                    </span>
                    <span className="responding-label">{respondingLabel}</span>
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
              <div className="composer-wrap">
                <div className={`composer-box${busy ? " is-busy" : ""}`}>
                  <textarea
                    value={draft}
                    onChange={(e) => setDraft(e.target.value)}
                    placeholder={
                      busy
                        ? `${activeAgentName} is responding…`
                        : `Message ${activeAgentName}…`
                    }
                    disabled={busy}
                    rows={1}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" && !e.shiftKey) {
                        e.preventDefault();
                        if (!busy) void send();
                      }
                    }}
                  />
                  {busy ? (
                    <button
                      type="button"
                      className="composer-action stop"
                      title="Stop generating"
                      aria-label="Stop generating"
                      onClick={() => void stop()}
                    >
                      <span className="stop-icon" />
                    </button>
                  ) : (
                    <button
                      type="button"
                      className="composer-action send"
                      title="Send message"
                      aria-label="Send message"
                      disabled={!draft.trim()}
                      onClick={() => void send()}
                    >
                      <svg
                        viewBox="0 0 24 24"
                        width="18"
                        height="18"
                        fill="currentColor"
                        aria-hidden
                      >
                        <path d="M3.4 20.6 21 12 3.4 3.4 3 10.5 15 12 3 13.5z" />
                      </svg>
                    </button>
                  )}
                </div>
                <p className="composer-hint">
                  {busy
                    ? "Stop anytime · Enter sends when idle · Shift+Enter for newline"
                    : "Enter to send · Shift+Enter for newline"}
                </p>
              </div>
            </div>
            {showPreview && (
              <aside className="computer-preview">
                <div className="preview-header">
                  <div className="preview-header-left">
                    <strong>Sandbox Computer</strong>
                    <span
                      className={
                        sandboxVisible || previewFrame
                          ? "preview-status live"
                          : "preview-status"
                      }
                    >
                      <span className="dot" />
                      {sandboxVisible
                        ? "isolated browser · live"
                        : previewFrame
                          ? "proof frame"
                          : "idle — ask the bot to browse"}
                    </span>
                  </div>
                </div>
                <div className="preview-stage sandbox-stage">
                  <div
                    ref={sandboxMountRef}
                    className="sandbox-mount"
                    aria-label="Sandbox Computer viewport"
                  />
                  {!sandboxVisible && (
                    <div className="sandbox-idle">
                      {previewFrame ? (
                        <img src={previewFrame} alt="Sandbox proof frame" />
                      ) : (
                        <p className="preview-placeholder">
                          Grok-like watch pane: when the bot uses{" "}
                          <code>browser/*</code>, the Sandbox Computer appears
                          here (isolated — not your whole PC).
                        </p>
                      )}
                    </div>
                  )}
                </div>
                <p className="preview-footnote">
                  Local sandbox (open-source stand-in for cloud VM). Host OS
                  control stays off unless Settings → Allow host desktop.
                </p>
              </aside>
            )}
          </div>
        ) : tab === "automations" ? (
          <div className="settings">
            <h2>Automations (Slice 9)</h2>
            <p className="hint">
              Schedules run bots on a timer. Skills are saved Agent Browser
              step sequences (observe &amp; repeat). Shared{" "}
              <code>workspace/*</code>, <code>team/delegate</code>, sheets/mail
              connectors unlock ops/sales/QA workflows.
            </p>
            <h2>Schedules</h2>
            <p className="hint">
              Example:{" "}
              <code>{`{"id":"morning","name":"Digest","enabled":true,"dailyAt":"08:00","agentId":"ops","prompt":"Read mail + calendar and summarize priorities. Notify Slack if configured."}`}</code>
            </p>
            <textarea
              value={schedulesJson}
              onChange={(e) => setSchedulesJson(e.target.value)}
            />
            <h2>Skills</h2>
            <p className="hint">
              Steps: navigate, wait, click, type, screenshot, read_text. Example:{" "}
              <code>{`{"id":"hn","name":"Open HN","description":"","steps":[{"type":"navigate","url":"https://news.ycombinator.com"},{"type":"screenshot"}]}`}</code>
            </p>
            <textarea
              value={skillsJson}
              onChange={(e) => setSkillsJson(e.target.value)}
            />
            <p style={{ marginTop: "1rem" }}>
              <button
                type="button"
                onClick={async () => {
                  try {
                    const schedules = JSON.parse(schedulesJson);
                    const skills = JSON.parse(skillsJson);
                    const saved = (await window.bot.automations.set({
                      schedules,
                      skills,
                    })) as AutomationsState;
                    setAutomations(saved);
                    setSchedulesJson(
                      JSON.stringify(saved.schedules ?? [], null, 2),
                    );
                    setSkillsJson(JSON.stringify(saved.skills ?? [], null, 2));
                    setStatus("Automations saved");
                  } catch (err) {
                    setStatus(
                      err instanceof Error ? err.message : "Invalid JSON",
                    );
                  }
                }}
              >
                Save automations
              </button>{" "}
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  const first = automations.skills[0];
                  if (!first) {
                    setStatus("Add a skill first");
                    return;
                  }
                  const result = await window.bot.automations.runSkill(first.id);
                  setStatus(`Skill run: ${JSON.stringify(result).slice(0, 200)}`);
                }}
              >
                Run first skill
              </button>{" "}
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  const first = automations.schedules[0];
                  if (!first) {
                    setStatus("Add a schedule first");
                    return;
                  }
                  const result = await window.bot.automations.runJob(first.id);
                  setStatus(
                    result.ok
                      ? `Job “${first.name}” started — check Chat sessions`
                      : "Job failed to start",
                  );
                }}
              >
                Run first schedule now
              </button>
            </p>
            {status && <p className="hint">{status}</p>}
          </div>
        ) : tab === "bots" ? (
          <div className="bots-studio">
            <div className="bots-head">
              <div>
                <h2>Bot Studio</h2>
                <p className="hint">
                  Name bots, describe what they do, set instructions — then chat
                  with them. Computer / Researcher prefer the Agent Browser.
                </p>
              </div>
              <button type="button" onClick={startCreateBot}>
                Create bot
              </button>
            </div>
            <div className="bots-grid">
              <ul className="bot-list">
                {(settings?.team.agents ?? agents).map((a) => (
                  <li key={a.id}>
                    <button
                      type="button"
                      className={
                        editingBotId === a.id ? "bot-card active" : "bot-card"
                      }
                      onClick={() => startEditBot(a)}
                    >
                      <strong>{a.name}</strong>
                      <span>{a.description || a.systemPrompt.slice(0, 90)}</span>
                    </button>
                    <button
                      type="button"
                      className="session-delete"
                      title="Delete bot"
                      onClick={() => void deleteBot(a.id)}
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>
              <div className="bot-editor">
                {editingBotId ? (
                  <>
                    <h3>
                      {editingBotId === "new" ? "New bot" : "Edit bot"}
                    </h3>
                    <label>Name</label>
                    <input
                      value={botDraft.name}
                      onChange={(e) =>
                        setBotDraft((d) => ({ ...d, name: e.target.value }))
                      }
                      placeholder="e.g. News Scout"
                    />
                    <label>Description</label>
                    <input
                      value={botDraft.description}
                      onChange={(e) =>
                        setBotDraft((d) => ({
                          ...d,
                          description: e.target.value,
                        }))
                      }
                      placeholder="Short blurb shown in the picker"
                    />
                    {editingBotId === "new" && (
                      <>
                        <label>Id (optional)</label>
                        <input
                          value={botDraft.id}
                          onChange={(e) =>
                            setBotDraft((d) => ({ ...d, id: e.target.value }))
                          }
                          placeholder="auto from name"
                        />
                      </>
                    )}
                    <label>Instructions</label>
                    <textarea
                      value={botDraft.systemPrompt}
                      onChange={(e) =>
                        setBotDraft((d) => ({
                          ...d,
                          systemPrompt: e.target.value,
                        }))
                      }
                      placeholder="System prompt — how this bot should work"
                    />
                    <label>Model override (optional)</label>
                    <input
                      value={botDraft.modelId ?? ""}
                      onChange={(e) =>
                        setBotDraft((d) => ({ ...d, modelId: e.target.value }))
                      }
                      placeholder="Leave empty for global model"
                    />
                    <div className="bot-editor-actions">
                      <button
                        type="button"
                        className="secondary"
                        onClick={() => setEditingBotId(null)}
                      >
                        Cancel
                      </button>
                      <button type="button" onClick={() => void saveBot()}>
                        Save bot
                      </button>
                    </div>
                  </>
                ) : (
                  <div className="empty-state">
                    <h3>Select a bot</h3>
                    <p>
                      Or create one for a job — research, coding, or driving the
                      Agent Browser with proof.
                    </p>
                  </div>
                )}
                {status && <p className="hint">{status}</p>}
              </div>
            </div>
          </div>
        ) : (
          <div className="settings">
            <h2>Model</h2>
            <p className="hint">
              OpenAI-compatible endpoint (Ollama default: http://127.0.0.1:11434/v1).
            </p>
            <label>Base URL</label>
            <input
              value={modelFields?.baseUrl ?? ""}
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? { ...s, model: { ...s.model, baseUrl: e.target.value } }
                    : s,
                )
              }
            />
            <label>Model ID</label>
            <input
              value={modelFields?.modelId ?? ""}
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? { ...s, model: { ...s.model, modelId: e.target.value } }
                    : s,
                )
              }
            />
            <label>API key (optional)</label>
            <input
              type="password"
              value={modelFields?.apiKey ?? ""}
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? { ...s, model: { ...s.model, apiKey: e.target.value } }
                    : s,
                )
              }
            />

            <h2>Gateway (Slice 5)</h2>
            <p className="hint">
              Optional local HTTP API. Tools over HTTP only run if already in{" "}
              <strong>Always allow</strong>.
            </p>
            <label>
              <input
                type="checkbox"
                checked={settings?.gateway?.enabled ?? false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          gateway: {
                            ...(s.gateway ?? {
                              host: "127.0.0.1",
                              port: 8787,
                              apiKey: "",
                            }),
                            enabled: e.target.checked,
                          },
                        }
                      : s,
                  )
                }
              />{" "}
              Enable self-hosted gateway
            </label>
            <label>Host</label>
            <input
              value={settings?.gateway?.host ?? "127.0.0.1"}
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? {
                        ...s,
                        gateway: {
                          ...(s.gateway ?? {
                            enabled: false,
                            port: 8787,
                            apiKey: "",
                          }),
                          host: e.target.value,
                        },
                      }
                    : s,
                )
              }
            />
            <label>Port</label>
            <input
              type="number"
              value={settings?.gateway?.port ?? 8787}
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? {
                        ...s,
                        gateway: {
                          ...(s.gateway ?? {
                            enabled: false,
                            host: "127.0.0.1",
                            apiKey: "",
                          }),
                          port: Number(e.target.value) || 8787,
                        },
                      }
                    : s,
                )
              }
            />
            <label>API key</label>
            <input
              type="password"
              value={settings?.gateway?.apiKey ?? ""}
              placeholder="auto-generated on save if empty"
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? {
                        ...s,
                        gateway: {
                          ...(s.gateway ?? {
                            enabled: false,
                            host: "127.0.0.1",
                            port: 8787,
                          }),
                          apiKey: e.target.value,
                        },
                      }
                    : s,
                )
              }
            />
            <p className="hint">
              Status:{" "}
              {gatewayStatus.listening
                ? `listening at ${gatewayStatus.url}`
                : "stopped"}
            </p>

            <h2>Sandbox Computer (Slice 10)</h2>
            <p className="hint">
              Grok-like isolated browser in the Live pane. Not a cloud VM — local
              Chromium with its own cookies/profile.
            </p>
            <label>
              <input
                type="checkbox"
                checked={settings?.sandbox?.enabled ?? true}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          sandbox: {
                            enabled: e.target.checked,
                            allowHostDesktop:
                              s.sandbox?.allowHostDesktop ?? false,
                          },
                        }
                      : s,
                  )
                }
              />{" "}
              Enable Sandbox Computer (browser/*)
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings?.sandbox?.allowHostDesktop ?? false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          sandbox: {
                            enabled: s.sandbox?.enabled ?? true,
                            allowHostDesktop: e.target.checked,
                          },
                        }
                      : s,
                  )
                }
              />{" "}
              Allow host desktop tools (OS computer-use) while sandbox is on
            </label>
            <h2>Host desktop (optional)</h2>
            <label>
              <input
                type="checkbox"
                checked={settings?.computerUse?.enabled ?? true}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          computerUse: {
                            ...s.computerUse,
                            enabled: e.target.checked,
                          },
                        }
                      : s,
                  )
                }
              />{" "}
              Enable OS computer-use tools (when host desktop allowed)
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings?.computerUse?.livePreview ?? false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          computerUse: {
                            ...s.computerUse,
                            livePreview: e.target.checked,
                          },
                        }
                      : s,
                  )
                }
              />{" "}
              Stream primary display (host) into Live pane
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings?.computerUse?.allowInput ?? false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          computerUse: {
                            ...s.computerUse,
                            allowInput: e.target.checked,
                          },
                        }
                      : s,
                  )
                }
              />{" "}
              Allow OS click / type_text (Windows)
            </label>
            <label>
              <input
                type="checkbox"
                checked={settings?.computerUse?.vision ?? false}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          computerUse: {
                            ...s.computerUse,
                            vision: e.target.checked,
                          },
                        }
                      : s,
                  )
                }
              />{" "}
              Vision: send screenshots to the model
            </label>

            <h2>Local exec allowlist</h2>
            <label>Allowlist</label>
            <input
              value={allowlistText}
              onChange={(e) => setAllowlistText(e.target.value)}
              placeholder="node, git"
            />
            <label>
              <input
                type="checkbox"
                checked={settings?.localExec?.enabled ?? true}
                onChange={(e) =>
                  setSettings((s) =>
                    s
                      ? {
                          ...s,
                          localExec: {
                            ...s.localExec,
                            enabled: e.target.checked,
                          },
                        }
                      : s,
                  )
                }
              />{" "}
              Enable built-in local-exec MCP
            </label>

            <h2>Connectors (Slice 9)</h2>
            <p className="hint">
              Local sheets/mail/calendar + Slack webhook + workspace/skills/team
              (enabled by default). Drop files into Electron userData folders.
            </p>
            {(
              [
                ["http-fetch", "HTTP Fetch"],
                ["sheets", "Local Sheets (CSV)"],
                ["mail", "Mail drop folder"],
                ["calendar", "Calendar ICS"],
                ["notify", "Slack webhook notify"],
                ["workspace", "Shared workspace notes/files"],
                ["skills", "Skills runner"],
                ["team", "Multi-bot delegate"],
              ] as const
            ).map(([id, label]) => (
              <label key={id}>
                <input
                  type="checkbox"
                  checked={
                    settings?.connectors?.enabled?.includes(id) ?? false
                  }
                  onChange={(e) =>
                    setSettings((s) => {
                      if (!s) return s;
                      const enabled = new Set(s.connectors?.enabled ?? []);
                      if (e.target.checked) enabled.add(id);
                      else enabled.delete(id);
                      return {
                        ...s,
                        connectors: {
                          ...s.connectors,
                          enabled: [...enabled],
                        },
                      };
                    })
                  }
                />{" "}
                {label}
              </label>
            ))}
            <label>Slack webhook URL</label>
            <input
              value={settings?.connectors?.slackWebhookUrl ?? ""}
              onChange={(e) =>
                setSettings((s) =>
                  s
                    ? {
                        ...s,
                        connectors: {
                          ...s.connectors,
                          slackWebhookUrl: e.target.value,
                        },
                      }
                    : s,
                )
              }
              placeholder="https://hooks.slack.com/services/…"
            />

            <h2>MCP servers (JSON)</h2>
            <textarea value={mcpJson} onChange={(e) => setMcpJson(e.target.value)} />
            <p style={{ marginTop: "1rem" }}>
              <button type="button" onClick={() => void saveSettings()}>
                Save settings
              </button>{" "}
              <button
                type="button"
                className="secondary"
                onClick={async () => {
                  const listed = await window.bot.mcp.reload();
                  setStatus(`MCP reloaded: ${JSON.stringify(listed)}`);
                  await refreshTeam();
                }}
              >
                Reload MCP
              </button>
            </p>
            {status && <p className="hint">{status}</p>}
          </div>
        )}
      </section>

      {permission && (
        <div className="modal-backdrop">
          <div className="modal">
            <h3>Allow tool?</h3>
            <p>
              <strong>
                {permission.serverId}/{permission.toolName}
              </strong>
            </p>
            <p className="hint">Runs on this machine.</p>
            <pre>{JSON.stringify(permission.arguments, null, 2)}</pre>
            <div className="modal-actions">
              <button
                type="button"
                className="danger"
                onClick={() => {
                  void window.bot.permissions.resolve({
                    id: permission.id,
                    decision: "deny",
                  });
                  setPermission(null);
                }}
              >
                Deny
              </button>
              <button
                type="button"
                className="secondary"
                onClick={() => {
                  void window.bot.permissions.resolve({
                    id: permission.id,
                    decision: "allow-once",
                    serverId: permission.serverId,
                    toolName: permission.toolName,
                  });
                  setPermission(null);
                }}
              >
                Allow once
              </button>
              <button
                type="button"
                onClick={() => {
                  void window.bot.permissions.resolve({
                    id: permission.id,
                    decision: "allow-always",
                    serverId: permission.serverId,
                    toolName: permission.toolName,
                  });
                  setPermission(null);
                }}
              >
                Always allow
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
