import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgent } from "./agent.js";
import { closeBrowser } from "./browser.js";
import { startServer } from "./server.js";
import { ensureData, logEvent, patchState } from "./store.js";
import { loadKeypair, publicAddress } from "./wallet.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: join(root, ".env") });

const live = process.argv.includes("--live") || process.env.AGENT_ENABLED === "1";
const apiKey = process.env.XAI_API_KEY;
if (live && !apiKey) {
  console.error("AGENT_ENABLED/ --live needs XAI_API_KEY");
  process.exit(1);
}

const config = {
  apiKey,
  model: process.env.XAI_MODEL || "grok-4.6",
  port: Number(process.env.PORT || 4173),
  dailyBudgetUsd: Number(process.env.DAILY_BUDGET_USD || 15),
  wakeMinSeconds: Number(process.env.WAKE_MIN_SECONDS || 45),
  wakeMaxSeconds: Number(process.env.WAKE_MAX_SECONDS || 180),
  maxTurns: Number(process.env.MAX_TURNS || 16),
};

ensureData(config.dailyBudgetUsd);
loadKeypair();
patchState({ status: live ? "booting" : "halted", lastError: live ? null : "agent halted" });

const agent = live ? createAgent(config) : null;
await startServer({ port: config.port, dailyBudgetUsd: config.dailyBudgetUsd });

const address = publicAddress();
console.log(`groklius rack on http://127.0.0.1:${config.port}`);
console.log(`brain: ${config.model}  live=${live ? "yes" : "no (dashboard only)"}`);
console.log(`wallet: ${address}`);
logEvent("sys", live ? `live on :${config.port}` : `rack on :${config.port} — agent halted`);
logEvent("chain", `independent wallet ${address}`);

const stop = async () => {
  agent?.stop();
  await closeBrowser();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

if (agent) {
  agent.start().catch((err) => {
    console.error(err);
    process.exit(1);
  });
}
