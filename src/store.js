import { mkdirSync, readFileSync, writeFileSync, appendFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
export const dataDir = join(root, "data");

const FILES = {
  state: join(dataDir, "state.json"),
  memory: join(dataDir, "memory.json"),
  journal: join(dataDir, "journal.jsonl"),
  events: join(dataDir, "events.jsonl"),
  drafts: join(dataDir, "drafts.json"),
  spend: join(dataDir, "spend.json"),
};

const listeners = new Set();

const emptyState = () => ({
  startedAt: new Date().toISOString(),
  status: "booting",
  mood: "awake",
  lastIdle: null,
  previousResponseId: null,
  lantern: { url: "", title: "unlit", note: "the lantern is cold.", excerpt: "" },
  actionsToday: 0,
  actionsDate: todayKey(),
  lastError: null,
});

const emptySpend = (dailyBudgetUsd) => ({
  dailyBudgetUsd,
  day: todayKey(),
  usd: 0,
  inputTokens: 0,
  outputTokens: 0,
  reasoningTokens: 0,
  cachedTokens: 0,
  actionsToday: 0,
});

export function todayKey(date = new Date()) {
  return date.toISOString().slice(0, 10);
}

export function ensureData(dailyBudgetUsd) {
  mkdirSync(dataDir, { recursive: true });
  if (!existsSync(FILES.state)) writeJson(FILES.state, emptyState());
  if (!existsSync(FILES.memory)) writeJson(FILES.memory, {});
  if (!existsSync(FILES.drafts)) writeJson(FILES.drafts, []);
  if (!existsSync(FILES.spend)) writeJson(FILES.spend, emptySpend(dailyBudgetUsd));
  if (!existsSync(FILES.journal)) writeFileSync(FILES.journal, "");
  if (!existsSync(FILES.events)) writeFileSync(FILES.events, "");
}

function writeJson(path, value) {
  writeFileSync(path, JSON.stringify(value, null, 2) + "\n");
}

function readJson(path, fallback) {
  try {
    return JSON.parse(readFileSync(path, "utf8"));
  } catch {
    return fallback;
  }
}

function readJsonl(path, limit = 200) {
  if (!existsSync(path)) return [];
  const lines = readFileSync(path, "utf8").split("\n").filter(Boolean);
  return lines.slice(-limit).map((line) => {
    try {
      return JSON.parse(line);
    } catch {
      return { raw: line };
    }
  });
}

export function subscribe(fn) {
  listeners.add(fn);
  return () => listeners.delete(fn);
}

function emit(event) {
  for (const fn of listeners) {
    try {
      fn(event);
    } catch {
      /* ignore subscriber errors */
    }
  }
}

export function readState() {
  return readJson(FILES.state, emptyState());
}

export function patchState(patch) {
  const next = { ...readState(), ...patch };
  writeJson(FILES.state, next);
  emit({ type: "state", at: new Date().toISOString(), state: next });
  return next;
}

export function readMemory() {
  return readJson(FILES.memory, {});
}

export function remember(key, value, importance = 5) {
  const memory = readMemory();
  memory[key] = {
    value: String(value).slice(0, 800),
    importance: Number(importance) || 5,
    updatedAt: new Date().toISOString(),
  };
  writeJson(FILES.memory, memory);
  emit({ type: "memory", at: new Date().toISOString(), key, value: memory[key] });
  return memory[key];
}

export function forget(key) {
  const memory = readMemory();
  delete memory[key];
  writeJson(FILES.memory, memory);
  emit({ type: "forget", at: new Date().toISOString(), key });
}

export function readJournal(limit = 80) {
  return readJsonl(FILES.journal, limit);
}

export function journal(text) {
  const entry = { at: new Date().toISOString(), text: String(text).slice(0, 2000) };
  appendFileSync(FILES.journal, JSON.stringify(entry) + "\n");
  emit({ type: "journal", ...entry });
  return entry;
}

export function readEvents(limit = 250) {
  return readJsonl(FILES.events, limit);
}

export function logEvent(kind, text, extra = {}) {
  const event = {
    at: new Date().toISOString(),
    kind,
    text: String(text).slice(0, 4000),
    ...extra,
  };
  appendFileSync(FILES.events, JSON.stringify(event) + "\n");
  emit({ type: "event", ...event });
  return event;
}

export function readDrafts() {
  return readJson(FILES.drafts, []);
}

export function draftPost(text) {
  const drafts = readDrafts();
  const post = {
    id: `d_${Date.now()}`,
    at: new Date().toISOString(),
    text: String(text).slice(0, 2000),
    status: "draft",
  };
  drafts.push(post);
  writeJson(FILES.drafts, drafts);
  emit({ type: "draft", ...post });
  return post;
}

export function readSpend(dailyBudgetUsd) {
  const spend = readJson(FILES.spend, emptySpend(dailyBudgetUsd));
  if (spend.day !== todayKey()) {
    return writeSpend({ ...emptySpend(dailyBudgetUsd), dailyBudgetUsd });
  }
  spend.dailyBudgetUsd = dailyBudgetUsd;
  return spend;
}

function writeSpend(spend) {
  writeJson(FILES.spend, spend);
  emit({ type: "spend", at: new Date().toISOString(), spend });
  return spend;
}

const TICKS_PER_USD = 10_000_000_000;

export function addUsage(usage, dailyBudgetUsd) {
  const spend = readSpend(dailyBudgetUsd);
  const usdFromTicks =
    usage?.cost_in_usd_ticks != null ? Number(usage.cost_in_usd_ticks) / TICKS_PER_USD : null;
  const usdFromNano =
    usage?.cost_in_nano_usd != null ? Number(usage.cost_in_nano_usd) / 1e9 : null;
  const input = Number(usage?.input_tokens || usage?.prompt_tokens || 0);
  const output = Number(usage?.output_tokens || usage?.completion_tokens || 0);
  const reasoning = Number(
    usage?.output_tokens_details?.reasoning_tokens ||
      usage?.completion_tokens_details?.reasoning_tokens ||
      0,
  );
  const cached = Number(usage?.input_tokens_details?.cached_tokens || 0);
  const estimated = (input / 1e6) * 2 + (output / 1e6) * 6;
  const usd = usdFromTicks ?? usdFromNano ?? estimated;

  spend.usd += usd;
  spend.inputTokens += input;
  spend.outputTokens += output;
  spend.reasoningTokens += reasoning;
  spend.cachedTokens += cached;
  spend.actionsToday += 1;
  writeSpend(spend);

  const state = readState();
  if (state.actionsDate !== todayKey()) {
    patchState({ actionsToday: 1, actionsDate: todayKey() });
  } else {
    patchState({ actionsToday: (state.actionsToday || 0) + 1 });
  }
  return spend;
}

export function remainingUsd(dailyBudgetUsd) {
  const spend = readSpend(dailyBudgetUsd);
  return Math.max(0, spend.dailyBudgetUsd - spend.usd);
}

export function snapshot(dailyBudgetUsd) {
  const state = readState();
  const spend = readSpend(dailyBudgetUsd);
  return {
    ...state,
    memory: readMemory(),
    journal: readJournal(40),
    events: readEvents(180),
    drafts: readDrafts().slice(-12),
    spend: {
      ...spend,
      remainingUsd: Math.max(0, spend.dailyBudgetUsd - spend.usd),
    },
    now: new Date().toISOString(),
  };
}
