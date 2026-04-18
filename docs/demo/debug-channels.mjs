// Debug: visit /workspace as DemoUser and figure out why channels aren't rendered.

import { chromium } from "playwright";

const TARGET = process.env.TARGET_URL || "https://slack-comcom-team.vercel.app";

async function demoLogin(ctx) {
  const res = await fetch(`${TARGET}/api/auth/demo-login`, { method: "POST" });
  const raw = res.headers.get("set-cookie") || "";
  const [pair] = raw.split(";");
  if (!pair?.includes("=")) throw new Error("no session cookie");
  const [name, value] = pair.split("=");
  await ctx.addCookies([
    { name, value, domain: new URL(TARGET).hostname, path: "/", httpOnly: true, sameSite: "Lax", secure: true },
  ]);
}

async function run() {
  const browser = await chromium.launch({ headless: true });
  const ctx = await browser.newContext({ viewport: { width: 1400, height: 900 } });
  await demoLogin(ctx);

  const page = await ctx.newPage();
  const consoleLogs = [];
  const netErrors = [];
  page.on("console", (msg) => consoleLogs.push(`${msg.type()}: ${msg.text()}`));
  page.on("pageerror", (err) => consoleLogs.push(`pageerror: ${err.message}`));
  page.on("response", async (res) => {
    const url = res.url();
    if (/\/api\/(channels|workspaces|auth|channel-folders)/.test(url) && !res.ok()) {
      let body = "";
      try { body = (await res.text()).slice(0, 300); } catch {}
      netErrors.push(`${res.status()} ${url}  body=${body}`);
    }
    if (/\/api\/(channels|workspaces)/.test(url) && res.ok()) {
      try {
        const j = await res.text();
        console.log(`[200] ${url}  ${j.slice(0, 200)}`);
      } catch {}
    }
  });

  console.log(`[nav] ${TARGET}/workspace`);
  await page.goto(`${TARGET}/workspace`, { waitUntil: "domcontentloaded", timeout: 30000 });
  await page.waitForLoadState("networkidle", { timeout: 15000 }).catch(() => {});
  await new Promise((r) => setTimeout(r, 3000));

  // What channels does the UI actually show?
  const sidebar = await page.evaluate(() => {
    const section = Array.from(document.querySelectorAll("*")).find((el) => {
      const t = el.textContent?.trim() ?? "";
      return t === "Channels" && el.children.length === 0;
    });
    if (!section) return { error: "no Channels heading" };
    let container = section.parentElement;
    for (let i = 0; i < 5 && container; i++, container = container.parentElement) {
      const links = container.querySelectorAll("a, button");
      if (links.length > 1) {
        return {
          found: true,
          html: container.outerHTML.slice(0, 3000),
          textSnapshot: container.textContent?.trim().slice(0, 500),
        };
      }
    }
    return { found: false, heading: section.parentElement?.outerHTML.slice(0, 1500) };
  });
  console.log("[sidebar]", JSON.stringify(sidebar, null, 2).slice(0, 2000));

  // Query the API directly via the browser's cookie
  const apiChannels = await page.evaluate(async () => {
    const res = await fetch("/api/channels", { credentials: "include" });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 1500) };
  });
  console.log("[api /api/channels]", JSON.stringify(apiChannels).slice(0, 1500));

  const apiWorkspaces = await page.evaluate(async () => {
    const res = await fetch("/api/workspaces", { credentials: "include" });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 1500) };
  });
  console.log("[api /api/workspaces]", JSON.stringify(apiWorkspaces).slice(0, 1500));

  const apiMe = await page.evaluate(async () => {
    const res = await fetch("/api/auth/me", { credentials: "include" });
    const text = await res.text();
    return { status: res.status, body: text.slice(0, 600) };
  });
  console.log("[api /api/auth/me]", JSON.stringify(apiMe));

  if (netErrors.length) {
    console.log("---NET ERRORS---");
    netErrors.forEach((l) => console.log(l));
  }
  if (consoleLogs.length) {
    console.log("---CONSOLE (last 20)---");
    consoleLogs.slice(-20).forEach((l) => console.log(l));
  }

  await page.screenshot({ path: "/tmp/workspace-debug.png", fullPage: false });
  console.log("[shot] /tmp/workspace-debug.png");

  await browser.close();
}

run().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
