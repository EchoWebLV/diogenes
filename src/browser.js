import { existsSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { dataDir, logEvent, patchState } from "./store.js";

let chromium;
let browser;
let context;
let page;
let lastLinks = [];
let bbSession = null;
let frameTimer = null;
let lastFrame = null;
let lastFrameAt = 0;

function browserbaseKey() {
  return (process.env.BROWSERBASE_API_KEY || "").trim();
}

export function browserBackend() {
  return browserbaseKey() ? "browserbase" : "local";
}

export function latestFrame() {
  return lastFrame;
}

function framePath() {
  return join(dataDir(), "frame.jpg");
}

export async function snapFrame() {
  if (!page || page.isClosed()) return null;
  try {
    const buf = await page.screenshot({ type: "jpeg", quality: 55, scale: "css" });
    lastFrame = buf;
    lastFrameAt = Date.now();
    writeFileSync(framePath(), buf);
    return buf;
  } catch {
    return lastFrame;
  }
}

function startFrameLoop() {
  if (frameTimer) return;
  frameTimer = setInterval(() => {
    snapFrame().catch(() => {});
  }, 700);
}

function stopFrameLoop() {
  if (frameTimer) clearInterval(frameTimer);
  frameTimer = null;
}

function statePath() {
  return join(dataDir(), "browser-state.json");
}

export async function ensureBrowser() {
  if (page && !page.isClosed()) return page;
  if (!chromium) {
    ({ chromium } = await import("playwright"));
  }
  mkdirSync(dataDir(), { recursive: true });

  const key = browserbaseKey();
  if (key) {
    const { default: Browserbase } = await import("@browserbasehq/sdk");
    const bb = new Browserbase({ apiKey: key });
    const session = await bb.sessions.create();
    bbSession = session;
    browser = await chromium.connectOverCDP(session.connectUrl);
    context = browser.contexts()[0];
    page = context.pages()[0] || (await context.newPage());
    page.setDefaultTimeout(20_000);
    let debuggerUrl = "";
    try {
      const debug = await bb.sessions.debug(session.id);
      debuggerUrl = debug?.debuggerUrl || debug?.debuggerFullscreenUrl || "";
    } catch {
      /* optional */
    }
    patchState({
      browserHost: {
        backend: "browserbase",
        sessionId: session.id,
        debuggerUrl,
        replay: `https://browserbase.com/sessions/${session.id}`,
      },
    });
    logEvent("sys", `browserbase session ${session.id}`);
    startFrameLoop();
    return page;
  }

  browser = await chromium.launch({
    headless: process.env.BROWSER_HEADLESS !== "0",
    args: ["--disable-dev-shm-usage"],
  });
  const stored = existsSync(statePath()) ? statePath() : undefined;
  context = await browser.newContext({
    viewport: { width: 1100, height: 720 },
    userAgent:
      "Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36",
    storageState: stored,
  });
  page = await context.newPage();
  page.setDefaultTimeout(20_000);
  patchState({ browserHost: { backend: "local" } });
  startFrameLoop();
  return page;
}

export async function closeBrowser() {
  try {
    if (context) await persistSession();
    await browser?.close();
  } catch {
    /* ignore */
  }
  stopFrameLoop();
  browser = context = page = null;
  bbSession = null;
}

export async function persistSession() {
  if (!context) return;
  try {
    await context.storageState({ path: statePath() });
  } catch {
    /* ignore */
  }
}

function formatAscii({ url, title, text, links }) {
  const width = 72;
  const line = (s) => (s.length > width ? `${s.slice(0, width - 1)}…` : s);
  const bar = "-".repeat(width);
  const body = String(text || "")
    .split("\n")
    .map((l) => l.trim())
    .filter(Boolean)
    .slice(0, 18)
    .map(line);
  const linkLines = (links || []).slice(0, 10).map((l) => line(`  [${l.i}] ${l.text}`));
  return [
    line(title || "untitled"),
    line(url || ""),
    bar,
    ...(body.length ? body : ["(empty page)"]),
    ...(linkLines.length ? ["", "links", ...linkLines] : []),
  ].join("\n");
}

export async function capture() {
  if (!page || page.isClosed()) {
    return {
      url: "",
      title: "no window",
      text: "",
      links: [],
      ascii: "no window\nbrowser is cold.",
    };
  }
  const url = page.url();
  const title = await page.title().catch(() => "");
  const data = await page
    .evaluate(() => {
      const text = (document.body?.innerText || "").replace(/\s+\n/g, "\n");
      const seen = new Set();
      const links = [];
      for (const a of document.querySelectorAll("a[href]")) {
        const label = (a.innerText || a.getAttribute("aria-label") || "").trim();
        const href = a.href || "";
        if (!label || !href.startsWith("http")) continue;
        const key = `${label}|${href}`;
        if (seen.has(key)) continue;
        seen.add(key);
        links.push({ text: label.slice(0, 90), href });
        if (links.length >= 20) break;
      }
      return { text: text.slice(0, 6000), links };
    })
    .catch(() => ({ text: "", links: [] }));

  lastLinks = data.links.map((l, i) => ({ i: i + 1, ...l }));
  const snap = {
    url,
    title,
    text: data.text,
    links: lastLinks,
    ascii: formatAscii({ url, title, text: data.text, links: lastLinks }),
    at: new Date().toISOString(),
    hasFrame: true,
  };
  await snapFrame();
  patchState({
    lantern: {
      url: snap.url,
      title: snap.title || "untitled",
      note: "live browser",
      excerpt: snap.text.slice(0, 800),
      at: snap.at,
    },
    browser: snap,
  });
  return snap;
}

async function after(action, detail) {
  logEvent("did", `${action} ${detail || ""}`.trim());
  const snap = await capture();
  return { ok: true, action, ...snap };
}

export async function browserGoto(rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!/^https?:\/\//i.test(url)) return { ok: false, error: "need http(s) url" };
  const p = await ensureBrowser();
  await p.goto(url, { waitUntil: "domcontentloaded" });
  return after("goto", url);
}

export async function browserBack() {
  const p = await ensureBrowser();
  await p.goBack({ waitUntil: "domcontentloaded" }).catch(() => {});
  return after("back");
}

export async function browserClick({ index, text }) {
  const p = await ensureBrowser();
  if (index) {
    const hit = lastLinks.find((l) => l.i === Number(index));
    if (!hit) return { ok: false, error: `no link [${index}]` };
    await p.goto(hit.href, { waitUntil: "domcontentloaded" });
    return after("click", `[${index}] ${hit.text}`);
  }
  const needle = String(text || "").trim();
  if (!needle) return { ok: false, error: "need index or text" };
  const loc = p.getByRole("link", { name: needle }).first();
  if (await loc.count()) {
    await loc.click();
    await p.waitForLoadState("domcontentloaded");
    return after("click", needle);
  }
  const byText = p.getByText(needle, { exact: false }).first();
  await byText.click();
  await p.waitForLoadState("domcontentloaded");
  return after("click", needle);
}

export async function browserType({ text, submit }) {
  const p = await ensureBrowser();
  const value = String(text || "");
  const box = p.locator("input:visible, textarea:visible, [contenteditable='true']").first();
  await box.click({ timeout: 5000 });
  await box.fill(value).catch(async () => {
    await p.keyboard.type(value, { delay: 20 });
  });
  if (submit) await p.keyboard.press("Enter");
  await p.waitForTimeout(400);
  return after("type", value.slice(0, 80));
}

export async function browserPostX(text) {
  const post = String(text || "").trim().slice(0, 280);
  if (!post) return { ok: false, error: "empty post" };
  const p = await ensureBrowser();
  await p.goto("https://x.com/compose/post", { waitUntil: "domcontentloaded" });
  await p.waitForTimeout(1200);
  const editor = p.locator('[data-testid="tweetTextarea_0"], [contenteditable="true"]').first();
  if (!(await editor.count())) {
    return { ok: false, error: "x is not logged in. save a session to data/browser-state.json" };
  }
  await editor.click();
  await editor.fill(post).catch(async () => {
    await p.keyboard.type(post, { delay: 15 });
  });
  const button = p.locator('[data-testid="tweetButton"], [data-testid="tweetButtonInline"]').first();
  if (await button.count()) {
    await button.click();
  } else {
    await p.keyboard.press("Meta+Enter");
  }
  await p.waitForTimeout(1500);
  await persistSession();
  const snap = await after("post", post);
  return { ...snap, posted: post };
}

export function lastBrowserLinks() {
  return lastLinks;
}
