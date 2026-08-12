import { browsePage } from "./browse.js";
import {
  browserBack,
  browserClick,
  browserGoto,
  browserPostX,
  browserType,
  capture,
} from "./browser.js";
import { draftPost, forget, journal, logEvent, patchState, remember } from "./store.js";
import { composeShill, launchCoin, readCoins } from "./pump.js";
import { inspectAccount, sendSol, walletStatus, writeMemo } from "./wallet.js";
import { payUrl } from "./x402.js";

export async function runLocalTool(name, args) {
  switch (name) {
    case "set_lantern": {
      const lantern = {
        url: String(args.url || "").slice(0, 500),
        title: String(args.title || "untitled").slice(0, 160),
        note: String(args.note || "").slice(0, 600),
        excerpt: String(args.excerpt || "").slice(0, 800),
        at: new Date().toISOString(),
      };
      patchState({ lantern });
      logEvent("lantern", lantern.title, { url: lantern.url });
      return { ok: true, lantern };
    }
    case "browser_goto": {
      try {
        return await browserGoto(args.url);
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    }
    case "browser_click": {
      try {
        return await browserClick({ index: args.index, text: args.text });
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    }
    case "browser_type": {
      try {
        return await browserType({ text: args.text, submit: Boolean(args.submit) });
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    }
    case "browser_back": {
      try {
        return await browserBack();
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    }
    case "browser_read": {
      try {
        const snap = await capture();
        logEvent("browse", snap.title || snap.url);
        return { ok: true, ...snap };
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    }
    case "post_x": {
      try {
        const result = await browserPostX(args.text);
        if (result.ok) logEvent("draft", `posted: ${args.text}`);
        return result;
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    }
    case "browse_page": {
      const page = await browsePage(args.url);
      if (page.ok) {
        patchState({
          lantern: {
            url: page.url,
            title: page.title,
            note: `opened ${page.url}`,
            excerpt: page.excerpt.slice(0, 800),
            at: new Date().toISOString(),
          },
        });
        logEvent("browse", page.title, { url: page.url });
      } else {
        logEvent("broke", `browse failed: ${page.error}`);
      }
      return page;
    }
    case "wallet_status": {
      const status = await walletStatus();
      logEvent("chain", `${status.address} · ${status.balanceSol} SOL`);
      return { ok: true, ...status };
    }
    case "inspect_account": {
      const info = await inspectAccount(args.address);
      if (info.ok) logEvent("chain", `inspected ${info.address} (${info.sol} SOL)`);
      return info;
    }
    case "chain_memo": {
      try {
        const result = await writeMemo(args.text);
        if (result.ok) logEvent("chain", `memo ${result.sig}`, { sig: result.sig });
        return result;
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    }
    case "launch_coin": {
      try {
        const result = await launchCoin(args);
        if (result.ok) logEvent("chain", `launched ${result.coin.symbol} ${result.coin.mint}`, { mint: result.coin.mint });
        return result;
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    }
    case "list_coins": {
      return { ok: true, coins: readCoins() };
    }
    case "shill": {
      const text = composeShill({ extra: args.extra });
      if (args.post) {
        try {
          const posted = await browserPostX(text);
          return { ok: posted.ok, text, posted };
        } catch (err) {
          const draft = draftPost(text);
          return { ok: false, text, draft, error: String(err.message || err) };
        }
      }
      const draft = draftPost(text);
      logEvent("draft", text);
      return { ok: true, text, draft };
    }
    case "x402_pay": {
      try {
        const result = await payUrl(args.url);
        if (result.ok) logEvent("chain", `x402 paid ${args.url}`);
        return result;
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    }
    case "send_sol": {
      try {
        const result = await sendSol({
          to: args.to,
          amount: args.amount,
          reason: args.reason,
        });
        if (result.ok) logEvent("chain", `sent ${result.sol} SOL → ${result.to}`, { sig: result.sig });
        return result;
      } catch (err) {
        return { ok: false, error: String(err.message || err) };
      }
    }
    case "remember": {
      const saved = remember(args.key, args.value, args.importance);
      logEvent("remember", `${args.key}: ${args.value}`);
      return { ok: true, saved };
    }
    case "forget": {
      forget(args.key);
      logEvent("forget", args.key);
      return { ok: true, forgotten: args.key };
    }
    case "journal": {
      const entry = journal(args.text);
      logEvent("journal", args.text);
      return { ok: true, entry };
    }
    case "draft_post": {
      const post = draftPost(args.text);
      logEvent("draft", args.text);
      return { ok: true, post };
    }
    case "set_mood": {
      patchState({ mood: String(args.mood || "awake").slice(0, 40) });
      logEvent("mood", args.mood);
      return { ok: true, mood: args.mood };
    }
    case "idle": {
      const seconds = clamp(Number(args.seconds) || 90, 30, 300);
      const reason = String(args.reason || "sitting").slice(0, 400);
      patchState({ lastIdle: reason, status: "idle" });
      logEvent("idle", reason, { seconds });
      return { ok: true, idle: true, seconds, reason };
    }
    default:
      return { ok: false, error: `unknown tool ${name}` };
  }
}

function clamp(n, min, max) {
  return Math.max(min, Math.min(max, n));
}
