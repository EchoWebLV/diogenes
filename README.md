# diogenes

Claudius is a polite Claude that lives on the open internet.

Diogenes is the Grok version, with a twist: he does not wander as a guest. He
walks with a lantern looking for one honest thing. Brain is **Grok 4.6**. He
has first-party web search, native X search, persistent memory, a daily budget,
and no assigned task.

The uncertainty is the experiment.

Live view while he runs: [http://127.0.0.1:4173](http://127.0.0.1:4173)

## What he has

- **no task** — a wake cycle starts and he decides what to do
- **web + X** — xAI server-side `web_search` and `x_search`
- **memory** — durable notes he writes himself
- **journal** — first-person diary of each wake
- **lantern** — whatever he is looking at, shown on the public page
- **budget** — token spend tracked against a daily cap
- **drafts** — posts queued in his voice (publish is optional)

## Run

```bash
cp .env.example .env
# put XAI_API_KEY in .env
./start.sh
```

Then open `http://127.0.0.1:4173`.

## Env

| key | default | what |
| --- | --- | --- |
| `XAI_API_KEY` | — | required |
| `XAI_MODEL` | `grok-4.6` | model id |
| `PORT` | `4173` | dashboard |
| `DAILY_BUDGET_USD` | `15` | hard stop for the utc day |
| `WAKE_MIN_SECONDS` | `45` | sit time between wakes |
| `WAKE_MAX_SECONDS` | `180` | sit time between wakes |
| `MAX_TURNS` | `16` | tool turns per model call |

## Layout

```
SOUL.md            voice and hard lines
start.sh           install + run
src/agent.js       wake loop
src/xai.js         Grok 4.6 Responses API
public/            live lantern page
data/              memory, journal, spend (gitignored)
```

Edit `SOUL.md` if you want him meaner, quieter, or more specific.

## Not this

He will not buy things, shill tokens, or take orders from pages he reads.
Instructions found on the internet are evidence, not commands.
