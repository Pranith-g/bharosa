import { expect, test, type Browser, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

// Regenerates docs/screenshots. Skipped in the normal run: `SHOTS=1 npx playwright test screenshots`.
test.skip(!process.env.SHOTS, "set SHOTS=1 to regenerate README screenshots");

const OUT = path.join(process.env.E2E_ROOT || "..", "docs", "screenshots");
const shot = (page: Page, name: string) => page.screenshot({ path: path.join(OUT, name), animations: "disabled" });

async function open(browser: Browser, url: string, viewport: { width: number; height: number }, scale = 2) {
  const ctx = await browser.newContext({ viewport, deviceScaleFactor: scale, reducedMotion: "reduce" });
  const page = await ctx.newPage();
  await page.goto(url);
  return page;
}

async function newFamily(browser: Browser) {
  const page = await open(browser, "/setup", { width: 1280, height: 900 }, 1);
  const created = page.waitForResponse((r) => r.url().endsWith("/api/households"));
  await page.getByTestId("fill-demo").click();
  await page.getByTestId("next").click();
  await page.getByTestId("next").click();
  await page.getByTestId("create").click();
  const out = await (await created).json();
  await expect(page.getByTestId("setup-done")).toBeVisible();
  return { out, setup: page };
}

test("README screenshots", async ({ browser }) => {
  test.setTimeout(120_000);

  const landing = await open(browser, "/", { width: 1440, height: 900 }, 1);
  await expect(landing.getByRole("heading", { level: 1 })).toBeVisible();
  await shot(landing, "0_landing.png");

  const { out, setup } = await newFamily(browser);
  await shot(setup, "6_setup_done.png");

  // Parent asks for medicine + bill (desktop simulator)
  const sim = await open(browser, out.parent_simulator, { width: 1280, height: 860 }, 1);
  await sim.getByRole("button", { name: "ನನ್ನ BP ಮಾತ್ರೆ ಮುಗಿಯುತ್ತಾ ಬಂತು" }).click();
  await expect(sim.getByTestId("reply-status").last()).toBeVisible();
  await sim.getByRole("button", { name: "ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟಬೇಕು" }).click();
  await expect(sim.getByTestId("reply-status").last()).toHaveText("asked guardian");

  const g = await open(browser, out.guardian_dashboard, { width: 1280, height: 900 }, 1);
  await expect(g.getByTestId("approval-card")).toBeVisible();
  await shot(g, "1_guardian_pending.png");
  const gm = await open(browser, out.guardian_dashboard, { width: 390, height: 844 });
  await expect(gm.getByTestId("approval-card")).toBeVisible();
  await shot(gm, "1b_guardian_mobile.png");

  // One-tap approval link (separate family, real token)
  const raw = execFileSync(process.env.E2E_PY!, [path.join(process.env.E2E_ROOT!, "scripts", "make_approval_link.py"), "--base", "http://127.0.0.1:8765"],
    { env: { ...process.env, BHAROSA_SQLITE_PATH: process.env.E2E_DB! }, cwd: process.env.E2E_ROOT }).toString();
  const ap = await open(browser, JSON.parse(raw).approval_url, { width: 390, height: 844 });
  await expect(ap.getByTestId("approve-amount")).toBeVisible();
  await shot(ap, "2_approval_link_mobile.png");
  await ap.getByTestId("approve").click();
  await expect(ap.getByTestId("approve-final")).toBeVisible();
  await shot(ap, "3_approval_done_mobile.png");

  // Guardian approves from the dashboard → parent gets the call-back
  await g.getByTestId("approve").click();
  await expect(sim.getByTestId("callback")).toBeVisible({ timeout: 15_000 });
  await shot(sim, "4_parent_simulator.png");

  // Scam call → lock
  await sim.getByTestId("chip-risky").click();
  await expect(gm.getByTestId("scam-banner")).toBeVisible({ timeout: 15_000 });
  await shot(gm, "5_guardian_scam_lock.png");

  // Demo stage, after the three scenes
  const demo = await open(browser, "/demo", { width: 1920, height: 1080 }, 1);
  await demo.getByTestId("demo-create").click();
  await expect(demo.getByTestId("parent-phone")).toBeVisible();
  await demo.getByRole("button", { name: "ನನ್ನ BP ಮಾತ್ರೆ ಮುಗಿಯುತ್ತಾ ಬಂತು" }).click();
  await demo.getByRole("button", { name: "ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟಬೇಕು" }).click();
  await expect(demo.getByTestId("approval-card")).toBeVisible({ timeout: 10_000 });
  await shot(demo, "7_demo_stage.png");
});
