// README-walkthrough recorder. Follows the flow:
//   Hero → Principles → Problem 1 → Problem 2 → Demo steps (1a invite, 1b build,
//   1c workflow, 2 newsroom, 3 editorial, 4 reporter, 5 TEE, 6 canvas, 7 Slack Connect, 8 corroborate).
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

// Cue schedule (s). Each cue is the *start* of the corresponding narration line.
const CUE = {
  hero: 0,
  problem1: 7,
  problem2: 14,
  step1a_invite: 22,
  step1b_build: 32,
  step1c_workflow: 40,
  step2_newsroom: 48,
  step3_editorial: 55,
  step4_reporter: 63,
  step5_tee_open: 71,
  step5_tee_ask: 77,
  step5_tee_result: 83,
  step6_canvas: 93,
  step7_connect: 101,
  step8_corroborate: 108,
  end: 116,
};
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const waitUntil = async (t0, sec) => {
  const wait = sec * 1000 - (Date.now() - t0);
  if (wait > 0) await sleep(wait);
};

async function getAuthCookie() {
  const res = await fetch(`${SLACK}/api/auth/key-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privateKey: PRIVATE_KEY, displayName: "DemoUser" }),
  });
  const raw = res.headers.get("set-cookie") || "";
  const [pair] = raw.split(";");
  if (!pair || !pair.includes("=")) throw new Error("no session cookie returned");
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

  const t0 = Date.now();

  // Hero (0s): #unblockmedia-test-1 with active agent pipeline
  await openChannel(page, "unblockmedia-test-1");
  await scrollMessages(page, 0.55);
  await waitUntil(t0, CUE.hero);
  await sleep(5800);

  // Problem 1 (7s): scroll to show more agent activity
  await scrollMessages(page, 0.3);
  await waitUntil(t0, CUE.problem1);
  await sleep(5800);

  // Problem 2 (14s): show war-desk channel (will become the cross-org TEE receiver)
  await openChannel(page, "war-desk");
  await waitUntil(t0, CUE.problem2);
  await sleep(6800);

  // Step 1a Invite Agent (22s)
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
  await waitUntil(t0, CUE.step1a_invite);
  await sleep(9800);

  // Step 1b Build Agent DM (32s)
  await page.keyboard.press("Escape");
  await page.goto(`${SLACK}/workspace/dm/builder`, { waitUntil: "domcontentloaded" });
  await waitUntil(t0, CUE.step1b_build);
  await sleep(7800);

  // Step 1c Workflow editor (40s)
  await page.goto(`${SLACK}/workspace/workflows`, { waitUntil: "domcontentloaded" });
  await page.waitForSelector("text=Workflow Builder", { timeout: 8000 }).catch(() => {});
  await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) => b.title === "Edit");
    btn?.click();
  });
  await waitUntil(t0, CUE.step1c_workflow);
  await sleep(7800);
  await page.keyboard.press("Escape");

  // Step 2 Newsroom channel (48s)
  await openChannel(page, "unblockmedia-test-1");
  await scrollMessages(page, 0);
  await waitUntil(t0, CUE.step2_newsroom);
  await sleep(6800);

  // Step 3 Editorial (55s)
  await scrollMessages(page, 0.08);
  await waitUntil(t0, CUE.step3_editorial);
  await sleep(7800);

  // Step 4 Reporter (63s)
  await scrollMessages(page, 0.7);
  await waitUntil(t0, CUE.step4_reporter);
  await sleep(7800);

  // Step 5 TEE intake (71s): open
  await page.goto(TEE, { waitUntil: "domcontentloaded" });
  await page.waitForSelector('h1:has-text("Ask the source")', { timeout: 15000 });
  await waitUntil(t0, CUE.step5_tee_open);
  await sleep(5800);

  // Step 5 ask (77s)
  await page.getByRole("button", { name: /red line toward bomb-grade/i }).click();
  await waitUntil(t0, CUE.step5_tee_ask);
  await sleep(5800);

  // Step 5 result (83s)
  try {
    await page.getByText(/Attestation verified/i).first().waitFor({ timeout: 40000 });
  } catch {}
  await waitUntil(t0, CUE.step5_tee_result);
  await sleep(9800);

  // Step 6 Canvas (93s)
  await page.goto(
    `${SLACK}/workspace/channel/unblockmedia-test-1?canvas=20e6ae67-9dde-495b-bcf8-a2457538110a`,
    { waitUntil: "domcontentloaded" },
  );
  await page
    .evaluate(() => {
      const row = Array.from(document.querySelectorAll("*")).find(
        (el) => el.textContent?.trim() === "buidlhack — Research",
      );
      row?.click();
    })
    .catch(() => {});
  await waitUntil(t0, CUE.step6_canvas);
  await sleep(7800);

  // Step 7 Slack Connect (101s)
  await openChannel(page, "war-desk");
  await waitUntil(t0, CUE.step7_connect);
  await sleep(6800);

  // Step 8 Corroborate (108s): back to newsroom thread
  await openChannel(page, "unblockmedia-test-1");
  await scrollMessages(page, 0.85);
  await waitUntil(t0, CUE.step8_corroborate);
  await sleep(7800);

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
