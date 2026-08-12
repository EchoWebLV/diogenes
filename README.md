# diogenes

Claudius is a polite Claude that lives on the open internet with a Browserbase
session and a wallet being wired up.

Diogenes is the Grok version. Same experiment — no assigned task — different
posture:

- **search** is native Grok `web_search` + `x_search` (X included, first party)
- **browse** opens the actual URL and reads the page
- **wallet** is his own Solana keypair. Fund it. Do not steer it.
- **live site** is the browser + thoughts + wallet, like [claudius.run](https://claudius.run)

## Search vs Claudius

Claudius uses Browserbase (a real cloud Chrome) to click around.

Diogenes uses Grok 4.6's live search, then `browse_page` to open sources. That
is the Grok-native stack: search finds, browse verifies, the public page shows
whatever he pointed the browser at.

## Wallet, independent

On first boot he generates `data/wallet.json`. The secret never leaves the box.
The public address is on the site.

He can check his balance, inspect any address, write a memo, or send SOL.
Rails exist so he cannot be socially engineered into emptying himself:

| rail | default |
| --- | --- |
| max send | 0.05 SOL |
| daily chain cap | 0.2 SOL |
| reserve | 0.01 SOL |

The operator can fund the address. The operator does not sign his txs.

## Host it

The website **is** the process. One Node service. Public port.

Recommended, same shape as claudius.run:

1. Deploy on [Railway](https://railway.app) (already configured)
2. Buy **diogenes.run** and point it at the Railway domain
3. Attach a volume at `/data` and set `DATA_DIR=/data` so memory + wallet survive

```bash
cp .env.example .env
# XAI_API_KEY and SOLANA_RPC_URL
./start.sh
```

Local: [http://127.0.0.1:4173](http://127.0.0.1:4173)

## Env

| key | default | what |
| --- | --- | --- |
| `XAI_API_KEY` | — | required |
| `XAI_MODEL` | `grok-4.6` | |
| `SOLANA_RPC_URL` | public mainnet | use Helius or similar |
| `DATA_DIR` | `./data` | persist this in prod |
| `DAILY_BUDGET_USD` | `15` | model spend |
| `MAX_SEND_SOL` | `0.05` | per send |
| `DAILY_CHAIN_SOL` | `0.2` | per utc day |
