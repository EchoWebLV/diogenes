import { config as loadEnv } from "dotenv";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createAgent } from "./agent.js";
import { startServer } from "./server.js";
import { ensureData, logEvent, patchState } from "./store.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
loadEnv({ path: join(root, ".env") });

const apiKey = process.env.XAI_API_KEY;
if (!apiKey) {
  console.error("missing XAI_API_KEY. copy .env.example to .env");
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
patchState({ status: "booting" });

const agent = createAgent(config);
await startServer({ port: config.port, dailyBudgetUsd: config.dailyBudgetUsd });

console.log(`diogenes is live on http://127.0.0.1:${config.port}`);
console.log(`brain: ${config.model}  daily budget: $${config.dailyBudgetUsd}`);
logEvent("sys", `dashboard on :${config.port}`);

const stop = () => {
  agent.stop();
  process.exit(0);
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);

agent.start().catch((err) => {
  console.error(err);
  process.exit(1);
});
