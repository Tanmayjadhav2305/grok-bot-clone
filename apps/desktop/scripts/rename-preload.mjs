import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const dir = path.join(path.dirname(fileURLToPath(import.meta.url)), "..", "dist-electron");
const from = path.join(dir, "preload.js");
const to = path.join(dir, "preload.mjs");
if (fs.existsSync(from)) {
  fs.renameSync(from, to);
}
