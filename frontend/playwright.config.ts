import { defineConfig } from "@playwright/test";
import { mkdirSync, rmSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const HERE = path.dirname(fileURLToPath(import.meta.url));

// Runs the real FastAPI server (serving the built app from bharosa/web/dist) on a throwaway SQLite file.
// Build first: `npm run build`, then `npm run test:e2e`.
const PORT = 8765;
const ROOT = path.resolve(HERE, "..");
const DB = path.join(HERE, "e2e", ".tmp", "e2e.db");
const PY = process.env.BHAROSA_PYTHON || path.join(ROOT, ".venv", process.platform === "win32" ? "Scripts/python.exe" : "bin/python");

if (!process.env.TEST_WORKER_INDEX) {
  mkdirSync(path.dirname(DB), { recursive: true });
  for (const f of [DB, `${DB}-wal`, `${DB}-shm`]) rmSync(f, { force: true });
}
process.env.E2E_DB = DB;
process.env.E2E_PY = PY;
process.env.E2E_ROOT = ROOT;

export default defineConfig({
  testDir: "e2e",
  timeout: 60_000,
  expect: { timeout: 10_000 },
  workers: 1,
  reporter: [["list"]],
  use: {
    baseURL: `http://127.0.0.1:${PORT}`,
    channel: process.env.PW_CHANNEL ?? "chrome",   // the installed Chrome; set PW_CHANNEL="" to use Playwright's Chromium
    headless: true,
    trace: "retain-on-failure",
  },
  webServer: {
    command: `"${PY}" -m bharosa.cli serve --host 127.0.0.1 --port ${PORT}`,
    cwd: ROOT,
    url: `http://127.0.0.1:${PORT}/health`,
    reuseExistingServer: false,
    timeout: 60_000,
    env: { BHAROSA_SQLITE_PATH: DB, BHAROSA_BASE_URL: `http://127.0.0.1:${PORT}`, BHAROSA_ADMIN_TOKEN: "" },
  },
});
