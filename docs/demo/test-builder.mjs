// Live test of Builder agent on production deployment.
// 1. Log in via key-login
// 2. Open Builder DM
// 3. Send a "create agent" request
// 4. Wait for Builder's response
// 5. Screenshot + print

import { chromium } from "playwright";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const TARGET = process.env.TARGET_URL || "https://slack-comcom-team.vercel.app";
const PRIVATE_KEY = "b796e8971f2c5c909a2178fb3fc1970f317adb1e9237d950d8fcdd5f5e1d7e42";
const SHOT = path.join(__dirname, "builder-test.png");

async function getCookie() {
  const res = await fetch(`${TARGET}/api/auth/key-login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ privateKey: PRIVATE_KEY, displayName: "DemoUser" }),
  });
  const raw = res.headers.get("set-cookie") || "";
  const [pair] = raw.split(";");
  if (!pair?.includes("=")) throw new Error("no session cookie — login failed");
  const [name, value] = pair.split("=");
  const host = new URL(TARGET).hostname;
  return { name, value, domain: host, path: "/", httpOnly: true, sameSite: "Lax", secure: true };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function run() {
  const cookie = await getCookie();
  console.log(`[auth] logged in, cookie=${cookie.name}`);

  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await ctx.addCookies([cookie]);
  const page = await ctx.newPage();

  // Open DMs page and find Builder DM
  await page.goto(`${TARGET}/workspace/dms`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await sleep(1500);

  // Click the Builder agent in the sidebar — walk up from text node to a clickable ancestor
  const clicked = await page.evaluate(() => {
    const spans = Array.from(document.querySelectorAll("span, div"));
    const leaf = spans.find((el) => {
      const t = (el.textContent ?? "").trim();
      return t === "Builder" && el.children.length === 0;
    });
    if (!leaf) return { ok: false, reason: "no Builder leaf" };
    // Walk up to find an element with a pointer cursor or onclick
    let cur = leaf;
    while (cur && cur !== document.body) {
      const cs = getComputedStyle(cur);
      if (cs.cursor === "pointer" || cur.tagName === "BUTTON" || cur.tagName === "A") {
        cur.scrollIntoView({ block: "center" });
        cur.click();
        return { ok: true, clicked: cur.tagName + " " + (cur.textContent?.trim().slice(0, 60) ?? "") };
      }
      cur = cur.parentElement;
    }
    // Fallback: just click the leaf
    leaf.click();
    return { ok: true, clicked: "leaf Builder" };
  });
  console.log(`[open] ${JSON.stringify(clicked)}`);
  if (!clicked.ok) {
    await page.screenshot({ path: SHOT });
    throw new Error("No Builder agent found");
  }
  await sleep(3500);

  // Find the composer textarea, type the request, send
  const prompt = "Create a legal researcher agent called BuilderTestAgent";
  await page.locator("textarea").last().click();
  await page.locator("textarea").last().fill(prompt);
  await sleep(500);
  await page.keyboard.press("Enter");
  console.log(`[send] "${prompt}"`);

  // Wait for a Builder reply. We look for a message where the sender name is "Builder" (not DemoUser).
  let resultText = "";
  let sawBuilder = false;
  for (let i = 0; i < 36; i++) {
    await sleep(2500);
    const state = await page.evaluate(() => {
      // Find all message rows; a row is "from Builder" when it has a header containing "Builder" before content
      const nodes = Array.from(document.querySelectorAll('[role="article"], [class*="message-item"], [aria-label*="Message"]'));
      const all = nodes.map((n) => n.textContent?.trim() ?? "").filter(Boolean);
      const fromBuilder = all.filter((t) => /^Builder\b/.test(t));
      return { total: nodes.length, all: all.slice(-6), fromBuilder };
    });
    const latest = state.all.join("\n---\n");
    process.stdout.write(`.`);
    if (/trouble responding|404|Resource not found/i.test(latest)) {
      console.log("\n[FAIL] Builder returned an error:");
      console.log(latest.slice(-1500));
      resultText = latest;
      break;
    }
    if (state.fromBuilder.length > 0) {
      console.log("\n[OK] Builder replied");
      resultText = state.fromBuilder.join("\n---\n");
      sawBuilder = true;
      break;
    }
  }
  if (!sawBuilder && !resultText) {
    console.log("\n[TIMEOUT] no Builder reply within 90s");
    resultText = await page.evaluate(() => document.body.innerText.slice(-3000));
  }

  await page.screenshot({ path: SHOT, fullPage: false });
  console.log(`[shot] ${SHOT}`);
  console.log("---last-texts---");
  console.log(resultText.slice(-2000));
  await browser.close();
}

run().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
