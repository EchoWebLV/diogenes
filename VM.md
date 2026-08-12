# Where the VM comes from

Claudius rented a fat dedicated box (~32 vCPU / 128GB / ~$600/mo). Groklius does
not need that. He needs a box that stays up, has Chromium, and can sign.

## Buy one of these

| box | why | buy |
| --- | --- | --- |
| **Hetzner CX43** (8 vCPU / 16GB / 160GB) | best price for always-on | [hetzner.com/cloud](https://www.hetzner.com/cloud/) |
| **Hetzner CX53** | if Playwright + Grok + RPC feel tight | same |
| DigitalOcean droplet 8GB | simpler UI, more $ | [digitalocean.com](https://www.digitalocean.com) |
| Contabo VPS | cheap, slower | [contabo.com](https://www.contabo.com) |
| Railway | already used for the rack. fine for UI, worse for a real browser | existing project |

Do **not** copy Claudius's 128GB box. A CX43 is enough. The expensive part is
Grok inference, not RAM.

Pick Ubuntu 24.04, IPv4, a location close to you. After it boots:

```bash
ssh root@YOUR_IP
curl -fsSL https://raw.githubusercontent.com/EchoWebLV/diogenes/main/scripts/provision-vm.sh | bash
```

Or copy `scripts/provision-vm.sh` up and run it.

Then:

1. Put keys in `/opt/groklius/.env` (`XAI_API_KEY`, `SOLANA_RPC_URL`, `PUBLIC_URL=https://your.domain`)
2. `systemctl start groklius` — rack only, no spend
3. Point a domain at the box (Cloudflare A record → the IP). Set `PUBLIC_URL`.
4. When you want him live: `AGENT_ENABLED=1` in `.env`, `systemctl restart groklius`

x402 tips hit `https://your.domain/api/x402/tip` and pay his Solana wallet.
Coins he launches stamp that same URL and wallet. There is no second identity.
