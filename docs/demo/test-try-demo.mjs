// Test the "Try demo" button: open /login, click the button, verify we land in /workspace.

import { chromium } from "playwright";

const TARGET = process.env.TARGET_URL || "https://slack-comcom-team.vercel.app";

async function run() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1280, height: 800 } });

  console.log(`[nav] /login at ${TARGET}`);
  await page.goto(`${TARGET}/login`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForSelector("button", { timeout: 15000 });

  // Click the "Try the demo" button
  const clicked = await page.evaluate(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((b) =>
      /Try the demo/i.test(b.textContent ?? "")
    );
    if (!btn) return null;
    btn.click();
    return btn.textContent?.trim();
  });
  console.log(`[click] ${clicked}`);
  if (!clicked) throw new Error("Try demo button not found");

  // Wait for navigation to /workspace
  await page.waitForURL(/\/workspace/, { timeout: 15000 });
  await page.waitForLoadState("networkidle", { timeout: 10000 }).catch(() => {});
  // Let avatars + sidebar hydrate
  await new Promise((r) => setTimeout(r, 3000));
  const url = page.url();
  console.log(`[land] ${url}`);
  if (!/\/workspace/.test(url)) throw new Error(`Expected /workspace, got ${url}`);

  await page.screenshot({ path: "/tmp/try-demo-landed.png", fullPage: false });
  console.log("[shot] /tmp/try-demo-landed.png");
  console.log("[OK] Try demo button works end-to-end");

  await browser.close();
}

run().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
