import { draftPost, forget, journal, logEvent, patchState, remember } from "./store.js";

export function runLocalTool(name, args) {
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
