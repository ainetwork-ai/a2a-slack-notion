// Demo recorder: 6 scenes, each gated by a content-visible check so the
// narration never plays over a loading/empty pane. Narration timings in
// narration.srt must match the cumulative durations below.
//
// Output: docs/demo/raw.webm

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const SLACK = "http://localhost:3004";
const TEE = "https://war-desk-source-shield.vercel.app";
const PRIVATE_KEY = "b796e8971f2c5c909a2178fb3fc1970f317adb1e9237d950d8fcdd5f5e1d7e42";
const CANVAS_URL = `${SLACK}/workspace/channel/unblockmedia?canvas=20e6ae67-9dde-495b-bcf8-a2457538110a`;

// Each scene starts at absolute time `start` (seconds from recording start).
// The scene's setup runs BEFORE `start`, so narration stays synced even if
// setup takes longer than expected.
const SCENES = [
  { key: "newsroom", start: 0, end: 8 },
  { key: "workflow", start: 8, end: 22 },
  { key: "invite", start: 22, end: 34 },
  { key: "tee_intro", start: 34, end: 40 },
  { key: "tee_answer", start: 40, end: 58 },
  { key: "canvas", start: 58, end: 70 },
];

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
  await page.goto(`${SLACK}/workspace/channel/unblockmedia`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".message-area", { timeout: 15000 });
  // Make sure an agent message is actually rendered before we count the scene stable.
  await page.waitForFunction(
    () => !!document.querySelector('[class*="message"]') &&
      document.body.innerText.includes("Damien"),
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
  // Open first workflow's editor and wait for the step list to render
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
  // Hard-close any open dialog
  await page.evaluate(() => {
    document.querySelectorAll('[role="dialog"]').forEach((d) => d.remove());
  });
  await sleep(300);
  await page.goto(`${SLACK}/workspace/channel/unblockmedia`, {
    waitUntil: "domcontentloaded",
  });
  await page.waitForSelector(".message-area", { timeout: 10000 });
  await hideOverlay(page);
  // Open Invite Agent dialog
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Invite agent",
    );
    btn?.click();
  });
  await page.waitForSelector('[role="dialog"] input', { timeout: 8000 });
  // Fill URL + click Preview
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
  await page.keyboard.press("Escape");
  await sleep(300);
  await page.goto(TEE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("h1", { timeout: 15000 });
}

async function scene_tee_answer(page) {
  await page.getByRole("button", { name: /want the war to end/i }).click();
  // Poll with a hard cap; if nothing arrives in ~12s we still record the
  // "Enclave is computing" state and let the post-process fast-forward.
  await page
    .getByText(/Sealed Witness answer|Attestation/i)
    .first()
    .waitFor({ timeout: 12000 })
    .catch(() => {});
}

async function scene_canvas(page) {
  await page.goto(CANVAS_URL, { waitUntil: "domcontentloaded" });
  await hideOverlay(page);
  await page.waitForSelector("text=#unblockmedia", { timeout: 10000 }).catch(() => {});
  await page.evaluate(() => {
    const row = Array.from(document.querySelectorAll("*")).find(
      (el) => el.textContent?.trim() === "buidlhack — Research",
    );
    row?.click();
  });
  // Wait for article body text to render
  await page.waitForSelector("text=Market Research", { timeout: 15000 }).catch(() => {});
}

const HANDLERS = {
  newsroom: scene_newsroom,
  workflow: scene_workflow,
  invite: scene_invite,
  tee_intro: scene_tee_intro,
  tee_answer: scene_tee_answer,
  canvas: scene_canvas,
};

async function run() {
  const cookie = await getAuthCookie();
  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({
    viewport: { width: 1600, height: 1000 },
    recordVideo: { dir: OUT_DIR, size: { width: 1600, height: 1000 } },
  });
  await context.addCookies([cookie]);
  const page = await context.newPage();
  page.on("framenavigated", () => hideOverlay(page).catch(() => {}));

  const t0 = Date.now();
  const waitUntilAbs = async (sec) => {
    const wait = sec * 1000 - (Date.now() - t0);
    if (wait > 0) await sleep(wait);
  };

  for (const scene of SCENES) {
    const elapsed = ((Date.now() - t0) / 1000).toFixed(1);
    console.log(`[scene] ${scene.key} (start=${scene.start}s, currently ${elapsed}s)`);
    await HANDLERS[scene.key](page);
    await hideOverlay(page);
    await waitUntilAbs(scene.end);
  }

  const video = page.video();
  const out = path.join(OUT_DIR, "raw.webm");
  // Must close the page/context first so the file is flushed, then saveAs.
  await page.close();
  await video.saveAs(out);
  await context.close();
  await browser.close();
  console.log("Wrote:", out);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
