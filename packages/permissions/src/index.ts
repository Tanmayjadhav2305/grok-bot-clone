import {
  type PermissionDecision,
  toolKey,
} from "@bot-computer/contracts";

export type PermissionRequest = {
  id: string;
  serverId: string;
  toolName: string;
  arguments: unknown;
};

export type AskUser = (
  request: PermissionRequest,
) => Promise<PermissionDecision>;

export class PermissionGate {
  private alwaysAllow: Set<string>;
  private readonly askUser: AskUser;

  constructor(
    alwaysAllow: Iterable<string>,
    askUser: AskUser,
  ) {
    this.alwaysAllow = new Set(alwaysAllow);
    this.askUser = askUser;
  }

  listAlwaysAllow(): string[] {
    return [...this.alwaysAllow].sort();
  }

  setAlwaysAllow(keys: Iterable<string>): void {
    this.alwaysAllow = new Set(keys);
  }

  async authorize(input: {
    serverId: string;
    toolName: string;
    arguments: unknown;
    requestId: string;
  }): Promise<"allow" | "deny"> {
    const key = toolKey(input.serverId, input.toolName);
    if (this.alwaysAllow.has(key)) return "allow";

    const decision = await this.askUser({
      id: input.requestId,
      serverId: input.serverId,
      toolName: input.toolName,
      arguments: input.arguments,
    });

    if (decision === "deny") return "deny";
    if (decision === "allow-always") this.alwaysAllow.add(key);
    return "allow";
  }
}
