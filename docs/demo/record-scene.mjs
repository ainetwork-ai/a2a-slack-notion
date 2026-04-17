// Per-scene demo recorder. Each scene runs in its own browser context so the
// recordVideo output is one file per scene. Usage:
//
//   node record-scene.mjs <scene-key>
//
// Outputs: docs/demo/scenes/<scene-key>.webm
//
// Scenes (duration in seconds):
//   newsroom    8
//   workflow    14
//   invite      12
//   tee_intro   6
//   tee_answer  18
//   canvas      12

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const SCENES_DIR = path.join(__dirname, "scenes");
const SLACK = "http://localhost:3004";
const TEE = "https://war-desk-source-shield.vercel.app";
const PRIVATE_KEY = "b796e8971f2c5c909a2178fb3fc1970f317adb1e9237d950d8fcdd5f5e1d7e42";
const CANVAS_URL = `${SLACK}/workspace/channel/unblockmedia-test-1?canvas=1`;

const SCENE_DURATIONS = {
  newsroom: 8,
  workflow: 14,
  invite: 12,
  tee_intro: 6,
  tee_answer: 18,
  canvas: 12,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

const HIDE_OVERLAY = `
  nextjs-portal, nextjs-build-watcher, [data-nextjs-toast],
  [class*="__nextjs"], #__next-build-watcher,
  button[aria-label*="Next.js Dev Tools"],
  [class*="nextjs-dev-tools"],
  [data-issues-count], [data-issues-toast] { display: none !important; }
`;

async function hideOverlay(page) {
  await page.addStyleTag({ content: HIDE_OVERLAY }).catch(() => {});
}

async function getAuthCookie() {
  const res = await fetch(`${SLACK}/api/auth/key-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privateKey: PRIVATE_KEY, displayName: "DemoUser" }),
  });
  const raw = res.headers.get("set-cookie") || "";
  const [pair] = raw.split(";");
  if (!pair || !pair.includes("=")) throw new Error("no session cookie");
  const [name, value] = pair.split("=");
  return { name, value, domain: "localhost", path: "/", httpOnly: true, sameSite: "Lax" };
}

async function scene_newsroom(page) {
  await page.goto(`${SLACK}/workspace/channel/unblockmedia-test-1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".message-area", { timeout: 15000 });
  await page.waitForFunction(
    () => !!document.querySelector('[class*="message"]') && document.body.innerText.includes("Damien"),
    { timeout: 15000 },
  );
  await hideOverlay(page);
  await page.evaluate(() => {
    const el = document.querySelector(".message-area");
    if (el) el.scrollTop = el.scrollHeight * 0.55;
  });
  await sleep(300);
}

async function scene_workflow(page) {
  await page.goto(`${SLACK}/workspace/workflows`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Workflow Builder", { timeout: 15000 });
  await hideOverlay(page);
  const editClicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.title === "Edit");
    btn?.click();
    return !!btn;
  });
  if (editClicked) {
    await page.waitForSelector('text="Then do"', { timeout: 8000 }).catch(() => {});
  }
}

async function scene_invite(page) {
  await page.goto(`${SLACK}/workspace/channel/unblockmedia-test-1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".message-area", { timeout: 10000 });
  await hideOverlay(page);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Invite agent",
    );
    btn?.click();
  });
  await page.waitForSelector('[role="dialog"] input', { timeout: 8000 });
  await page.evaluate((url) => {
    const tb = document.querySelector('[role="dialog"] input');
    const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
    setter.call(tb, url);
    tb.dispatchEvent(new Event("input", { bubbles: true }));
  }, `${TEE}/.well-known/agent.json`);
  await sleep(400);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Preview" && !b.disabled,
    );
    btn?.click();
  });
  await page.getByText(/Sealed Witness Agent/i).first().waitFor({ timeout: 25000 });
}

async function scene_tee_intro(page) {
  await page.goto(TEE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 15000 });
}

async function scene_tee_answer(page) {
  await page.goto(TEE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 15000 });
  await page.getByRole("button", { name: /want the war to end/i }).click();
  await page
    .getByText(/Sealed Witness answer|Attestation/i)
    .first()
    .waitFor({ timeout: 12000 })
    .catch(() => {});
}

async function scene_canvas(page) {
  await page.goto(`${SLACK}/workspace/channel/unblockmedia-test-1`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".message-area", { timeout: 15000 });
  await hideOverlay(page);
  // Click the Canvas button in the channel header to open the canvas panel
  await page.locator('button[title="Canvas"]').first().click({ force: true }).catch(() => {});
  await sleep(2500);
  const clicked = await page.evaluate(() => {
    const vw = window.innerWidth;
    const buttons = Array.from(document.querySelectorAll('button'));
    const inRight = buttons.filter((b) => {
      const r = b.getBoundingClientRect();
      return r.left > vw * 0.55 && r.width > 150 && r.height > 30;
    });
    const pref = inRight.find((b) => /Research/i.test(b.textContent ?? ''))
      ?? inRight.find((b) => /ago|just now/i.test(b.textContent ?? ''))
      ?? inRight[0];
    if (pref) { pref.click(); return pref.textContent?.trim().slice(0, 80) ?? ''; }
    return null;
  });
  console.log('[canvas] clicked row:', clicked);
  await sleep(2500);
}

const HANDLERS = {
  newsroom: scene_newsroom,
  workflow: scene_workflow,
  invite: scene_invite,
  tee_intro: scene_tee_intro,
  tee_answer: scene_tee_answer,
  canvas: scene_canvas,
};

async function run(sceneKey) {
  const duration = SCENE_DURATIONS[sceneKey];
  if (!duration) throw new Error(`unknown scene: ${sceneKey}. valid: ${Object.keys(SCENE_DURATIONS).join(", ")}`);

  fs.mkdirSync(SCENES_DIR, { recursive: true });

  const cookie = await getAuthCookie();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    recordVideo: { dir: SCENES_DIR, size: { width: 1600, height: 1000 } },
  });
  await context.addCookies([cookie]);
  const page = await context.newPage();
  page.on("framenavigated", () => hideOverlay(page).catch(() => {}));

  const t0 = Date.now();
  console.log(`[scene] ${sceneKey} — setup`);
  await HANDLERS[sceneKey](page);
  await hideOverlay(page);
  const setupMs = Date.now() - t0;
  const remain = duration * 1000 - setupMs;
  console.log(`[scene] ${sceneKey} — setup done in ${setupMs}ms, holding for ${Math.max(0, remain)}ms to reach ${duration}s`);
  if (remain > 0) await sleep(remain);

  const videoPath = await page.video().path();
  await context.close();
  await browser.close();

  const out = path.join(SCENES_DIR, `${sceneKey}.webm`);
  // If the output file is already there (from a previous run), drop it first.
  if (fs.existsSync(out)) fs.unlinkSync(out);
  fs.renameSync(videoPath, out);
  console.log(`Wrote: ${out}`);
}

const scene = process.argv[2];
if (!scene) {
  console.error("Usage: node record-scene.mjs <scene-key>");
  console.error(`Scenes: ${Object.keys(SCENE_DURATIONS).join(", ")}`);
  process.exit(1);
}

run(scene).catch((err) => {
  console.error(err);
  process.exit(1);
});
