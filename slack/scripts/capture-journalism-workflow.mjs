import { chromium } from '/test';
import crypto from 'crypto';
import fs from 'fs/promises';

const baseURL = process.env.BASE_URL || 'http://localhost:3004';
const outDir = process.env.OUT_DIR || '../docs/images/workflow';

async function ensureDir(path) {
  await fs.mkdir(new URL(path, import.meta.url), { recursive: true }).catch(async () => {
    await fs.mkdir(path, { recursive: true });
  });
}

async function main() {
  await fs.mkdir(new URL(outDir, import.meta.url), { recursive: true }).catch(async () => {
    await fs.mkdir('docs/images/workflow', { recursive: true });
  });

  const browser = await chromium.launch({ headless: true });
  const context = await browser.newContext({ viewport: { width: 1600, height: 1000 } });
  const page = await context.newPage();

  const privateKey = crypto.randomBytes(32).toString('hex');
  const displayName = `JournalEditor-${Date.now().toString().slice(-6)}`;

  await page.goto(`${baseURL}/login`, { waitUntil: 'networkidle' });
  await page.click('button:has-text("Private key")');
  await page.fill('input[placeholder="hex private key"]', privateKey);
  await page.fill('input[placeholder="optional"]', displayName);
  await page.screenshot({ path: 'docs/images/workflow/01-login-private-key.png', fullPage: true });

  await page.click('button:has-text("Sign in with private key")');
  await page.waitForURL('**/workspace**', { timeout: 30000 });
  await page.waitForLoadState('networkidle');
  await page.screenshot({ path: 'docs/images/workflow/02-workspace-home.png', fullPage: true });

  const channelCandidates = ['# war-room', '#general', '# general', 'text=war-room', 'text=general'];
  let clicked = false;
  for (const sel of channelCandidates) {
    const loc = page.locator(sel).first();
    if (await loc.isVisible().catch(() => false)) {
      await loc.click();
      clicked = true;
      break;
    }
  }
  if (!clicked) {
    // fallback: just stay on current selected channel
  }
  await page.waitForTimeout(1500);
  await page.screenshot({ path: 'docs/images/workflow/03-channel-selected.png', fullPage: true });

  const composer = page.locator('textarea, [contenteditable="true"]').first();
  await composer.click();
  const prompt = `Create a journalism workflow for an investigation on election misinformation. Create 4 agents: NewsResearcher agent, FactChecker agent, LegalReviewer agent, and StoryWriter agent. Then create a channel named newsroom and invite them. After creation, post each agent's first response with next steps.`;
  await composer.fill(prompt).catch(async () => {
    await page.keyboard.type(prompt);
  });
  await page.keyboard.press('Enter');

  await page.waitForTimeout(6000);
  await page.screenshot({ path: 'docs/images/workflow/04-builder-request.png', fullPage: true });

  await page.waitForTimeout(12000);
  await page.screenshot({ path: 'docs/images/workflow/05-agent-responses.png', fullPage: true });

  // Try opening thread if available
  const threadBtn = page.locator('button:has-text("Reply in thread"), button[aria-label*="thread" i], [data-testid*="thread" i]').first();
  if (await threadBtn.isVisible().catch(() => false)) {
    await threadBtn.click();
    await page.waitForTimeout(1500);
    await page.screenshot({ path: 'docs/images/workflow/06-thread-view.png', fullPage: true });
  }

  await browser.close();
  console.log('Captured workflow screenshots in docs/images/workflow');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
