import { expect, test, type Page } from "@playwright/test";
import { execFileSync } from "node:child_process";
import path from "node:path";

/** Fails the test on any console error or uncaught exception in the page. */
function watchErrors(page: Page) {
  const errors: string[] = [];
  page.on("console", (m) => { if (m.type() === "error") errors.push(m.text()); });
  page.on("pageerror", (e) => errors.push(e.message));
  return errors;
}

const PHONE = { width: 360, height: 780 };

test("setup → simulator → guardian approves → call-back → scam lock", async ({ browser }) => {
  // 1. Setup wizard (desktop)
  const setupCtx = await browser.newContext({ viewport: { width: 1280, height: 900 } });
  const setup = await setupCtx.newPage();
  const setupErrors = watchErrors(setup);
  await setup.goto("/setup");
  await setup.getByTestId("fill-demo").click();
  await setup.getByTestId("next").click();
  await setup.getByTestId("next").click();
  const created = setup.waitForResponse((r) => r.url().endsWith("/api/households") && r.request().method() === "POST");
  await setup.getByTestId("create").click();
  const out = await (await created).json();
  await expect(setup.getByTestId("setup-done")).toBeVisible();
  await expect(setup.getByText("Save these links now")).toBeVisible();
  expect(out.guardian_dashboard).toContain("/g#bg_");

  // 2. Parent phone at 360px: the key leaves the URL at once
  const parentCtx = await browser.newContext({ viewport: PHONE });
  const parent = await parentCtx.newPage();
  const parentErrors = watchErrors(parent);
  await parent.goto(out.parent_simulator);
  await expect(parent.getByTestId("parent-phone")).toBeVisible();
  expect(parent.url()).not.toContain("#");
  expect(parent.url()).not.toContain("bp_");
  await parent.getByRole("button", { name: "ಕರೆಂಟ್ ಬಿಲ್ ಕಟ್ಟಬೇಕು" }).click();
  await expect(parent.getByTestId("reply-status").last()).toHaveText("asked guardian");

  // 3. Guardian phone at 360px approves it
  const guardianCtx = await browser.newContext({ viewport: PHONE });
  const guardian = await guardianCtx.newPage();
  const guardianErrors = watchErrors(guardian);
  await guardian.goto(out.guardian_dashboard);
  expect(guardian.url()).not.toContain("bg_");
  const card = guardian.getByTestId("approval-card");
  await expect(card).toContainText("₹2,392");
  await card.getByTestId("approve").click();
  await expect(guardian.getByText(/Approved and done/)).toBeVisible();
  await expect(card).toHaveCount(0);

  // 4. The parent hears back
  await expect(parent.getByTestId("callback")).toBeVisible({ timeout: 15_000 });

  // 5. Scam call → refused, locked, guardian alerted
  await parent.getByTestId("chip-risky").click();
  await expect(parent.getByTestId("reply-status").last()).toHaveText("scam: spending locked");
  await expect(guardian.getByTestId("scam-banner")).toBeVisible({ timeout: 15_000 });
  await expect(guardian.getByTestId("status-pill")).toContainText("Scam lock");
  await expect(guardian.getByRole("link", { name: /1930/ })).toHaveAttribute("href", "tel:1930");

  for (const p of [setup, parent, guardian]) await expectNoOverflow(p);
  expect([...setupErrors, ...parentErrors, ...guardianErrors]).toEqual([]);
  await Promise.all([setupCtx.close(), parentCtx.close(), guardianCtx.close()]);
});

test("one-tap approval link: approve → paid with receipt", async ({ browser }) => {
  const raw = execFileSync(process.env.E2E_PY!, [path.join(process.env.E2E_ROOT!, "scripts", "make_approval_link.py"), "--base", "http://127.0.0.1:8765"],
    { env: { ...process.env, BHAROSA_SQLITE_PATH: process.env.E2E_DB! }, cwd: process.env.E2E_ROOT }).toString();
  const { approval_url } = JSON.parse(raw);
  const ctx = await browser.newContext({ viewport: PHONE });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto(approval_url);
  await expect(page.getByTestId("approve-amount")).toHaveText("₹2,392");
  await page.getByTestId("approve").click();
  await expect(page.getByTestId("approve-final")).toContainText("₹2,392 paid");
  await expect(page.getByTestId("approve-final")).toContainText("Receipt");
  // Single use: reloading shows the final state, not the buttons
  await page.reload();
  await expect(page.getByTestId("approve-final")).toBeVisible();
  await expect(page.getByTestId("approve")).toHaveCount(0);
  // A bad token is refused
  await page.goto(approval_url.replace(/t=[^&]+/, "t=wrong"));
  await expect(page.getByText("This link isn't valid")).toBeVisible();
  await expectNoOverflow(page);
  expect(errors.filter((e) => !e.includes("403"))).toEqual([]);
  await ctx.close();
});

test("demo stage at 1920×1080 shows both live phones", async ({ browser }) => {
  const ctx = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  const errors = watchErrors(page);
  await page.goto("/demo");
  await page.getByTestId("demo-create").click();
  await expect(page.getByTestId("parent-phone")).toBeVisible();
  await expect(page.getByTestId("guardian-app")).toBeVisible();
  await expectNoOverflow(page);
  expect(errors).toEqual([]);
  await ctx.close();
});

test("landing has no horizontal scroll at 360px and 1920px", async ({ browser }) => {
  for (const viewport of [PHONE, { width: 1920, height: 1080 }]) {
    const ctx = await browser.newContext({ viewport });
    const page = await ctx.newPage();
    const errors = watchErrors(page);
    await page.goto("/");
    await expect(page.getByRole("heading", { level: 1 })).toContainText("One number");
    await expectNoOverflow(page);
    expect(errors).toEqual([]);
    await ctx.close();
  }
});

async function expectNoOverflow(page: Page) {
  const [sw, w] = await page.evaluate(() => [document.documentElement.scrollWidth, window.innerWidth]);
  expect(sw, `horizontal overflow on ${page.url()}`).toBeLessThanOrEqual(w);
}
