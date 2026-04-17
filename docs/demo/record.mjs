// README-walkthrough recorder.
// Follows the README story in order, but only shows screens that have
// real populated content so the video never lingers on empty panes.
// Output: docs/demo/raw.webm  (aligned with narration.srt)

import { chromium } from "playwright";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const OUT_DIR = __dirname;
const SLACK = "http://localhost:3004";
const TEE = "https://war-desk-source-shield.vercel.app";
const PRIVATE_KEY = "b796e8971f2c5c909a2178fb3fc1970f317adb1e9237d950d8fcdd5f5e1d7e42";

// Cue schedule (seconds). Narration timings in narration.srt must match.
const CUE = {
  hero: 0,
  problems: 7,
  step1a_invite: 15,
  step1c_workflow: 27,
  step2_newsroom: 38,
  step3_editorial: 47,
  step4_reporter: 56,
  step5_tee_open: 65,
  step5_tee_ask: 71,
  step5_tee_result: 78,
  step6_canvas: 91,
  end: 103,
};

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitUntil = async (t0, sec) => {
  const wait = sec * 1000 - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
};

// CSS to hide Next.js dev-tools overlay and its issue badges.
const HIDE_DEV_OVERLAY = `
  nextjs-portal, nextjs-build-watcher, [data-nextjs-toast],
  [class*="__nextjs"], #__next-build-watcher,
  button[aria-label*="Next.js Dev Tools"],
  [class*="nextjs-dev-tools"],
  [data-issues-count], [data-issues-toast] { display: none !important; visibility: hidden !important; }
`;

async function hideOverlay(page) {
  await page.addStyleTag({ content: HIDE_DEV_OVERLAY }).catch(() => {});
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

async function scrollMessages(page, ratio) {
  await page.evaluate((r) => {
    const el = document.querySelector(".message-area");
    if (el) el.scrollTop = el.scrollHeight * r;
  }, ratio);
}

async function openChannel(page, name) {
  await page.goto(`${SLACK}/workspace/channel/${name}`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector(".message-area", { timeout: 15000 }).catch(() => {});
  await hideOverlay(page);
  await sleep(600);
}

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

  // Hero (0s): newsroom with real agent activity
  await openChannel(page, "unblockmedia-test-1");
  await scrollMessages(page, 0.55);
  await waitUntil(t0, CUE.hero);
  await sleep(6500);

  // Problem 1 + Problem 2 framing (7s): stay in channel
  await scrollMessages(page, 0.3);
  await hideOverlay(page);
  await waitUntil(t0, CUE.problems);
  await sleep(7500);

  // Step 1a Invite Agent (15s): open dialog, preview Sealed Witness
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find(
      (b) => b.textContent?.trim() === "Invite agent",
    );
    btn?.click();
  });
  await page.waitForSelector('[role="dialog"] input', { timeout: 8000 }).catch(() => {});
  await page.evaluate((url) => {
    const tb = document.querySelector('[role="dialog"] input');
    if (!tb) return;
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
  await page.getByText(/Sealed Witness Agent/i).first().waitFor({ timeout: 20000 }).catch(() => {});
  await waitUntil(t0, CUE.step1a_invite);
  await sleep(11500);

  // Step 1c Workflow editor (27s)
  await page.keyboard.press("Escape");
  await page.goto(`${SLACK}/workspace/workflows`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Workflow Builder", { timeout: 8000 }).catch(() => {});
  await hideOverlay(page);
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.title === "Edit");
    btn?.click();
  });
  await page.waitForSelector('text=Then do', { timeout: 6000 }).catch(() => {});
  await waitUntil(t0, CUE.step1c_workflow);
  await sleep(10500);
  await page.keyboard.press("Escape");

  // Step 2 Newsroom channel top (38s)
  await openChannel(page, "unblockmedia-test-1");
  await scrollMessages(page, 0.02);
  await waitUntil(t0, CUE.step2_newsroom);
  await sleep(8500);

  // Step 3 Editorial (47s)
  await scrollMessages(page, 0.1);
  await hideOverlay(page);
  await waitUntil(t0, CUE.step3_editorial);
  await sleep(8500);

  // Step 4 Reporter (56s)
  await scrollMessages(page, 0.7);
  await hideOverlay(page);
  await waitUntil(t0, CUE.step4_reporter);
  await sleep(8500);

  // Step 5 TEE intake (65s)
  await page.goto(TEE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('h1:has-text("Ask the source")', { timeout: 15000 });
  await waitUntil(t0, CUE.step5_tee_open);
  await sleep(5500);

  // Step 5 ask (71s)
  await page.getByRole("button", { name: /red line toward bomb-grade/i }).click();
  await waitUntil(t0, CUE.step5_tee_ask);
  await sleep(6500);

  // Step 5 result (78s)
  try {
    await page.getByText(/Attestation verified/i).first().waitFor({ timeout: 40000 });
  } catch {}
  await waitUntil(t0, CUE.step5_tee_result);
  await sleep(12500);

  // Step 6 Canvas (91s)
  await page.goto(
    `${SLACK}/workspace/channel/unblockmedia-test-1?canvas=20e6ae67-9dde-495b-bcf8-a2457538110a`,
    { waitUntil: "domcontentloaded" },
  );
  await hideOverlay(page);
  await page
    .evaluate(() => {
      const row = Array.from(document.querySelectorAll("*")).find(
        (el) => el.textContent?.trim() === "buidlhack — Research",
      );
      row?.click();
    })
    .catch(() => {});
  await waitUntil(t0, CUE.step6_canvas);
  await sleep(11500);

  await waitUntil(t0, CUE.end);

  const videoPath = await page.video().path();
  await context.close();
  await browser.close();

  const out = path.join(OUT_DIR, "raw.webm");
  fs.renameSync(videoPath, out);
  console.log("Wrote:", out);
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});
