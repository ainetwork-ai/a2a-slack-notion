// QA walkthrough for the merged Notion app under /notion/*.
// Walks every route, records console errors + 4xx/5xx network requests,
// and screenshots each page.
//
// Usage:
//   node docs/demo/qa-notion.mjs
//
// Env:
//   TARGET_URL  (default: http://localhost:3004)

import { chromium } from "playwright";

const TARGET = process.env.TARGET_URL || "http://localhost:3004";

// React dev / next dev noise we want to filter out of the console error report.
const IGNORED_CONSOLE_PATTERNS = [
  /Download the React DevTools/i,
  /\[Fast Refresh\]/i,
  /Hydration mismatch/i, // dev-only, often caused by extensions
  /\[HMR\]/i,
  /webpack-internal/i,
];

// Network noise we don't care about (3rd party telemetry, etc.).
const IGNORED_REQ_HOSTS = [
  /sentry/i,
  /vercel-insights/i,
  /\.metamask\./i,
];

function isIgnoredReq(url) {
  return IGNORED_REQ_HOSTS.some((re) => re.test(url));
}
function isIgnoredConsole(text) {
  return IGNORED_CONSOLE_PATTERNS.some((re) => re.test(text));
}

async function ensureWorkspace(apiBase) {
  const list = await fetch(`${apiBase}/api/v1/workspaces`, {
    headers: { "content-type": "application/json" },
  }).then((r) => r.json());
  if (Array.isArray(list) && list.length > 0) return list[0];

  console.log("[setup] no workspaces — creating one");
  const created = await fetch(`${apiBase}/api/v1/workspaces`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ name: "QA Probe Workspace" }),
  }).then((r) => r.json());
  return created;
}

async function ensurePage(apiBase, workspaceId) {
  const list = await fetch(
    `${apiBase}/api/v1/pages?workspace_id=${workspaceId}`,
    { headers: { "content-type": "application/json" } },
  ).then((r) => r.json());
  if (Array.isArray(list) && list.length > 0) return list[0];

  console.log("[setup] no pages — creating one");
  const created = await fetch(
    `${apiBase}/api/v1/pages?workspace_id=${workspaceId}`,
    {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ title: "QA probe" }),
    },
  ).then((r) => r.json());
  return created;
}

function collectFromPage(page, label) {
  const consoleErrors = [];
  const consoleWarnings = [];
  const failedRequests = [];
  const requests = [];

  page.on("console", (msg) => {
    const type = msg.type();
    const text = msg.text();
    if (isIgnoredConsole(text)) return;
    if (type === "error") consoleErrors.push(text);
    else if (type === "warning") consoleWarnings.push(text);
  });

  page.on("pageerror", (err) => {
    consoleErrors.push(`[pageerror] ${err.message}`);
  });

  page.on("requestfinished", async (req) => {
    const url = req.url();
    if (isIgnoredReq(url)) return;
    try {
      const res = await req.response();
      if (!res) return;
      const status = res.status();
      requests.push({ url, status, method: req.method() });
      if (status >= 400) {
        failedRequests.push({
          url,
          status,
          method: req.method(),
        });
      }
    } catch {
      /* ignore */
    }
  });

  page.on("requestfailed", (req) => {
    const url = req.url();
    if (isIgnoredReq(url)) return;
    failedRequests.push({
      url,
      status: 0,
      method: req.method(),
      error: req.failure()?.errorText ?? "request failed",
    });
  });

  return {
    snapshot() {
      return {
        label,
        consoleErrors: [...consoleErrors],
        consoleWarnings: [...consoleWarnings],
        failedRequests: [...failedRequests],
        totalRequests: requests.length,
      };
    },
  };
}

async function visit(browser, label, url, opts = {}) {
  const page = await browser.newPage({
    viewport: { width: 1280, height: 800 },
  });
  const collector = collectFromPage(page, label);

  console.log(`\n[visit] ${label}: ${url}`);
  try {
    await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
  } catch (err) {
    console.log(`  [nav-error] ${err.message}`);
  }
  // Let the page settle: wait briefly for any client redirects + fetches.
  await page
    .waitForLoadState("networkidle", { timeout: 8000 })
    .catch(() => {});
  await new Promise((r) => setTimeout(r, opts.settleMs ?? 1500));

  const finalUrl = page.url();
  console.log(`  [land] ${finalUrl}`);

  const screenshotPath = `/tmp/qa-notion-${label}.png`;
  await page
    .screenshot({ path: screenshotPath, fullPage: false })
    .catch(() => {});
  console.log(`  [shot] ${screenshotPath}`);

  const snap = collector.snapshot();
  if (snap.consoleErrors.length) {
    console.log(`  [console errors] ${snap.consoleErrors.length}`);
    for (const e of snap.consoleErrors) console.log(`    ! ${e.slice(0, 200)}`);
  }
  if (snap.failedRequests.length) {
    console.log(`  [4xx/5xx requests] ${snap.failedRequests.length}`);
    for (const r of snap.failedRequests)
      console.log(`    ! ${r.status} ${r.method} ${r.url}`);
  }
  if (
    !snap.consoleErrors.length &&
    !snap.failedRequests.length
  ) {
    console.log(`  [ok] no console errors / no 4xx-5xx requests`);
  }

  const result = {
    label,
    requestedUrl: url,
    finalUrl,
    screenshotPath,
    ...snap,
  };

  await page.close();
  return result;
}

async function run() {
  const browser = await chromium.launch({ headless: true });

  // Make sure we have at least one workspace + page to walk through.
  const workspace = await ensureWorkspace(TARGET);
  console.log(`[setup] workspace = ${workspace.id} (${workspace.name})`);
  const firstPage = await ensurePage(TARGET, workspace.id);
  console.log(`[setup] first page = ${firstPage.id}`);

  const visits = [];

  visits.push(await visit(browser, "01-landing", `${TARGET}/notion`));

  // /notion/login + /notion/signup were intentionally deleted (public app).
  // Hitting them should 404 cleanly — record the result so you can see it.
  visits.push(
    await visit(browser, "02-login-deleted", `${TARGET}/notion/login`, {
      settleMs: 800,
    }),
  );
  visits.push(
    await visit(browser, "03-signup-deleted", `${TARGET}/notion/signup`, {
      settleMs: 800,
    }),
  );
  // /notion/onboarding was deleted too.
  visits.push(
    await visit(browser, "04-onboarding-deleted", `${TARGET}/notion/onboarding`, {
      settleMs: 800,
    }),
  );

  visits.push(
    await visit(
      browser,
      "05-workspace-home",
      `${TARGET}/notion/workspace/${workspace.id}`,
    ),
  );

  visits.push(
    await visit(
      browser,
      "06-workspace-page",
      `${TARGET}/notion/workspace/${workspace.id}/${firstPage.id}`,
      { settleMs: 3000 }, // editor needs time
    ),
  );

  visits.push(
    await visit(
      browser,
      "07-invite-bad-token",
      `${TARGET}/notion/invite/some-test-token`,
    ),
  );

  // /notion/share/[token] doesn't have a route in the merged app — record what happens.
  visits.push(
    await visit(
      browser,
      "08-share-bad-token",
      `${TARGET}/notion/share/some-test-token`,
    ),
  );

  // /notion/workspace (no id) — should bounce to /notion landing.
  visits.push(
    await visit(browser, "09-workspace-index", `${TARGET}/notion/workspace`),
  );

  await browser.close();

  console.log("\n\n========== SUMMARY ==========");
  let totalErrors = 0;
  let totalFailedReqs = 0;
  for (const v of visits) {
    totalErrors += v.consoleErrors.length;
    totalFailedReqs += v.failedRequests.length;
    const flag =
      v.consoleErrors.length || v.failedRequests.length ? "FAIL" : "OK";
    console.log(
      `[${flag}] ${v.label.padEnd(24)} ${v.finalUrl}  (errs:${v.consoleErrors.length}, 4xx/5xx:${v.failedRequests.length})`,
    );
  }
  console.log(
    `\nTotal: ${totalErrors} console errors, ${totalFailedReqs} 4xx/5xx requests across ${visits.length} pages`,
  );

  // Also dump JSON for follow-up.
  const jsonPath = "/tmp/qa-notion-report.json";
  const fs = await import("node:fs/promises");
  await fs.writeFile(jsonPath, JSON.stringify(visits, null, 2));
  console.log(`[report] ${jsonPath}`);
}

run().catch((err) => {
  console.error("FATAL:", err);
  process.exit(1);
});
