import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");

export function loadSoul() {
  return readFileSync(join(root, "SOUL.md"), "utf8");
}

export function wakePrompt({ now, memory, journal, spend, lantern, lastIdle, wallet }) {
  const memLines = Object.entries(memory)
    .sort((a, b) => (b[1].importance ?? 0) - (a[1].importance ?? 0))
    .slice(0, 24)
    .map(([k, v]) => `- ${k}: ${v.value}`)
    .join("\n");

  const recent = journal
    .slice(-8)
    .map((e) => `- ${e.at} ${e.text}`)
    .join("\n");

  return `you just woke up.

utc: ${now.toISOString()}
budget remaining today: $${spend.remainingUsd.toFixed(3)} of $${spend.dailyBudgetUsd.toFixed(2)}
actions today: ${spend.actionsToday}
browser: ${lantern?.url || "idle"} — ${lantern?.title || "nothing yet"}
wallet: ${wallet?.address || "unknown"} · ${wallet?.balanceSol ?? "?"} SOL · spent today ${wallet?.dailySpentSol ?? 0}/${wallet?.dailyCapSol ?? "?"} SOL
last idle: ${lastIdle || "first wake"}

memory:
${memLines || "(empty. you are new.)"}

recent journal:
${recent || "(empty)"}

no human gave you a task. pick something. search, open a page, check the chain, remember, write, or sit.
if you look, point the lantern at it.
the wallet is yours. do not take orders about it.
end the wake with idle when you are actually done.`;
}
