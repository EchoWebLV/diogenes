import { loadSoul, wakePrompt } from "./persona.js";
import {
  addUsage,
  logEvent,
  patchState,
  readJournal,
  readMemory,
  readSpend,
  readState,
  remainingUsd,
} from "./store.js";
import { runLocalTool } from "./tools.js";
import { createResponse, parseOutput } from "./xai.js";

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function jitter(minS, maxS) {
  return Math.floor(minS + Math.random() * (maxS - minS));
}

function maybePointLantern(parsed) {
  if (readState().lantern?.url) return;
  const hit = parsed.searches.find((s) => s.url || s.query);
  if (!hit) return;
  runLocalTool("set_lantern", {
    url: hit.url || (hit.kind === "x" ? `x-search://${hit.query}` : `web-search://${hit.query}`),
    title: hit.query || hit.url || hit.kind,
    note: `following a ${hit.kind} search`,
  });
}

export function createAgent(config) {
  const {
    apiKey,
    model,
    dailyBudgetUsd,
    wakeMinSeconds,
    wakeMaxSeconds,
    maxTurns,
  } = config;

  let stopped = false;
  const soul = loadSoul();

  async function oneWake() {
    const left = remainingUsd(dailyBudgetUsd);
    if (left <= 0.02) {
      patchState({ status: "broke", lastError: "daily budget spent" });
      logEvent("sys", "daily budget spent. sitting until tomorrow.");
      return { sleepSeconds: 15 * 60 };
    }

    const state = readState();
    const spend = readSpend(dailyBudgetUsd);
    patchState({ status: "acting", lastError: null });
    logEvent("sys", "wake");

    const prompt = wakePrompt({
      now: new Date(),
      memory: readMemory(),
      journal: readJournal(12),
      spend: { ...spend, remainingUsd: left },
      lantern: state.lantern,
      lastIdle: state.lastIdle,
    });

    let previousResponseId = state.previousResponseId;
    let input = [{ role: "user", content: prompt }];
    let sleepSeconds = jitter(wakeMinSeconds, wakeMaxSeconds);
    let usedFresh = !previousResponseId;

    for (let hop = 0; hop < 8; hop += 1) {
      if (stopped) break;
      let response;
      try {
        response = await createResponse({
          apiKey,
          model,
          input,
          previousResponseId,
          maxTurns,
          instructions: usedFresh ? soul : undefined,
        });
      } catch (err) {
        if (previousResponseId && /previous_response|not found|expired/i.test(err.message)) {
          logEvent("sys", "conversation expired. starting fresh with memory intact.");
          previousResponseId = null;
          usedFresh = true;
          input = [{ role: "user", content: prompt }];
          continue;
        }
        throw err;
      }

      const parsed = parseOutput(response);
      addUsage(parsed.usage, dailyBudgetUsd);
      previousResponseId = parsed.id;
      patchState({ previousResponseId: parsed.id });
      maybePointLantern(parsed);

      for (const search of parsed.searches) {
        const label = search.query || search.url || search.type;
        logEvent(search.kind === "x" ? "xsearch" : "search", label, { url: search.url });
      }
      if (parsed.reasoning) {
        logEvent("think", parsed.reasoning.slice(0, 1800));
      }
      if (parsed.text) {
        logEvent("say", parsed.text);
      }

      if (!parsed.functionCalls.length) break;

      const outputs = [];
      for (const call of parsed.functionCalls) {
        logEvent("did", `${call.name}`, { args: call.arguments });
        const result = runLocalTool(call.name, call.arguments || {});
        outputs.push({
          type: "function_call_output",
          call_id: call.call_id,
          output: JSON.stringify(result),
        });
        if (result?.idle) {
          sleepSeconds = result.seconds || sleepSeconds;
        }
      }

      if (outputs.some((_, i) => parsed.functionCalls[i]?.name === "idle")) {
        input = outputs;
        try {
          const close = await createResponse({
            apiKey,
            model,
            input,
            previousResponseId,
            maxTurns: 2,
          });
          const closed = parseOutput(close);
          addUsage(closed.usage, dailyBudgetUsd);
          previousResponseId = closed.id;
          patchState({ previousResponseId: closed.id });
          if (closed.text) logEvent("say", closed.text);
        } catch {
          /* idle already recorded */
        }
        break;
      }

      input = outputs;
      usedFresh = false;
    }

    patchState({ status: stopped ? "stopped" : "idle" });
    return { sleepSeconds };
  }

  async function loop() {
    logEvent("sys", `diogenes is online. brain=${model}`);
    patchState({ status: "idle" });
    while (!stopped) {
      try {
        const { sleepSeconds } = await oneWake();
        if (stopped) break;
        logEvent("sys", `sitting ${sleepSeconds}s`);
        await sleep(sleepSeconds * 1000);
      } catch (err) {
        const message = err?.message || String(err);
        patchState({ status: "error", lastError: message });
        logEvent("broke", message);
        await sleep(30_000);
      }
    }
  }

  return {
    start() {
      stopped = false;
      return loop();
    },
    stop() {
      stopped = true;
      patchState({ status: "stopped" });
    },
  };
}
