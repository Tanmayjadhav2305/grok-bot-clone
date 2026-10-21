import fs from "node:fs/promises";
import path from "node:path";

/**
 * Shared notes + files bots pass between each other (local agent team board).
 */
export class WorkspaceStore {
  constructor(private readonly root: string) {}

  private notesPath(): string {
    return path.join(this.root, "notes.json");
  }

  private filesDir(): string {
    return path.join(this.root, "files");
  }

  async ensure(): Promise<void> {
    await fs.mkdir(this.filesDir(), { recursive: true });
    try {
      await fs.access(this.notesPath());
    } catch {
      await fs.writeFile(this.notesPath(), "{}", "utf8");
    }
  }

  async listNotes(): Promise<Record<string, string>> {
    await this.ensure();
    const raw = await fs.readFile(this.notesPath(), "utf8");
    try {
      return JSON.parse(raw) as Record<string, string>;
    } catch {
      return {};
    }
  }

  async writeNote(key: string, text: string): Promise<void> {
    await this.ensure();
    const notes = await this.listNotes();
    notes[key] = text;
    await fs.writeFile(this.notesPath(), JSON.stringify(notes, null, 2), "utf8");
  }

  async readNote(key: string): Promise<string | null> {
    const notes = await this.listNotes();
    return notes[key] ?? null;
  }

  async listFiles(): Promise<string[]> {
    await this.ensure();
    const entries = await fs.readdir(this.filesDir(), { withFileTypes: true });
    return entries.filter((e) => e.isFile()).map((e) => e.name);
  }

  async writeFile(name: string, content: string): Promise<string> {
    await this.ensure();
    const safe = name.replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/\.\./g, "");
    const full = path.join(this.filesDir(), safe);
    await fs.mkdir(path.dirname(full), { recursive: true });
    await fs.writeFile(full, content, "utf8");
    return safe;
  }

  async readFile(name: string): Promise<string> {
    const safe = name.replace(/[^a-zA-Z0-9._/-]/g, "_").replace(/\.\./g, "");
    return fs.readFile(path.join(this.filesDir(), safe), "utf8");
  }
}
