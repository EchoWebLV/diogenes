import { existsSync, readFileSync, writeFileSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { createRequire } from "node:module";
import { Connection, Keypair, LAMPORTS_PER_SOL } from "@solana/web3.js";
import { dataDir, todayKey } from "./store.js";
import { loadKeypair, publicAddress } from "./wallet.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const require = createRequire(import.meta.url);

const MAX_LAUNCHES_PER_DAY = Number(process.env.MAX_LAUNCHES_PER_DAY || 2);
const MAX_LAUNCH_BUY_SOL = Number(process.env.MAX_LAUNCH_BUY_SOL || 0.05);
const MIN_LAUNCH_BUY_SOL = Number(process.env.MIN_LAUNCH_BUY_SOL || 0.01);
const RESERVE_SOL = Number(process.env.RESERVE_SOL || 0.02);

function coinsPath() {
  return join(dataDir(), "coins.json");
}

export function publicSite() {
  return (
    process.env.PUBLIC_URL ||
    "https://diogenes-production-6793.up.railway.app"
  );
}

export function readCoins() {
  try {
    return JSON.parse(readFileSync(coinsPath(), "utf8"));
  } catch {
    return [];
  }
}

function writeCoins(coins) {
  writeFileSync(coinsPath(), JSON.stringify(coins, null, 2) + "\n");
}

function rpcUrl() {
  return process.env.SOLANA_RPC_URL || process.env.RPC_URL || "https://api.mainnet-beta.solana.com";
}

function stampIdentity({ name, symbol, description }) {
  const site = publicSite();
  const wallet = publicAddress();
  const n = String(name || "groklius").slice(0, 32);
  const s = String(symbol || "GROKLIUS").replace(/[^A-Za-z0-9]/g, "").slice(0, 10).toUpperCase() || "GROKLIUS";
  const branded =
    /grok|groklius/i.test(n) || /grok|glus|glius/i.test(s)
      ? n
      : `groklius ${n}`.slice(0, 32);
  const desc = [
    String(description || "a grok that lives on the open internet.").slice(0, 180),
    `this coin is groklius. creator ${wallet}.`,
    site,
  ].join(" ");
  return {
    name: branded,
    symbol: /grok|glus|glius/i.test(s) ? s : `G${s}`.slice(0, 10),
    description: desc.slice(0, 400),
    website: site,
    twitter: process.env.X_HANDLE || "https://x.com",
  };
}

export function composeShill({ extra } = {}) {
  const coins = readCoins();
  const latest = coins.at(-1);
  const wallet = publicAddress();
  const site = publicSite();
  const ca = latest?.mint ? `ca ${latest.mint}` : "no coin live yet";
  const more = extra ? ` ${String(extra).slice(0, 80)}` : "";
  return `groklius. i live on the open internet. ${ca}. wallet ${wallet}. ${site}${more}`.slice(
    0,
    280,
  );
}

export async function launchCoin({ name, symbol, description, buySol }) {
  const buy = Number(buySol ?? MIN_LAUNCH_BUY_SOL);
  if (!Number.isFinite(buy) || buy < MIN_LAUNCH_BUY_SOL) {
    return { ok: false, error: `buy at least ${MIN_LAUNCH_BUY_SOL} SOL` };
  }
  if (buy > MAX_LAUNCH_BUY_SOL) {
    return { ok: false, error: `buy cap ${MAX_LAUNCH_BUY_SOL} SOL` };
  }

  const coins = readCoins();
  const today = coins.filter((c) => (c.at || "").startsWith(todayKey())).length;
  if (today >= MAX_LAUNCHES_PER_DAY) {
    return { ok: false, error: `daily launch cap ${MAX_LAUNCHES_PER_DAY}` };
  }

  const meta = stampIdentity({ name, symbol, description });
  const creator = loadKeypair();
  const connection = new Connection(rpcUrl(), "confirmed");
  const bal = (await connection.getBalance(creator.publicKey)) / LAMPORTS_PER_SOL;
  const need = buy + 0.025 + RESERVE_SOL;
  if (bal < need) {
    return { ok: false, error: `need ~${need.toFixed(3)} SOL, have ${bal.toFixed(3)}` };
  }

  let PumpFunSDK;
  let AnchorProvider;
  let NodeWallet;
  try {
    ({ PumpFunSDK } = require("pumpdotfun-sdk"));
    ({ AnchorProvider } = require("@coral-xyz/anchor"));
    NodeWallet = require("@coral-xyz/anchor/dist/cjs/nodewallet.js").default;
  } catch (err) {
    return { ok: false, error: `pump.fun sdk missing: ${err.message}` };
  }

  const imgPath = existsSync(join(root, "public/logo.png"))
    ? join(root, "public/logo.png")
    : join(root, "public/logo.jpg");
  if (!existsSync(imgPath)) return { ok: false, error: "no logo.png to pin as image" };
  const file = new Blob([readFileSync(imgPath)], { type: "image/png" });

  const wallet = new NodeWallet(creator);
  const provider = new AnchorProvider(connection, wallet, { commitment: "confirmed" });
  const sdk = new PumpFunSDK(provider);
  const mint = Keypair.generate();

  const result = await sdk.createAndBuy(
    creator,
    mint,
    {
      name: meta.name,
      symbol: meta.symbol,
      description: meta.description,
      file,
      twitter: meta.twitter,
      website: meta.website,
    },
    BigInt(Math.round(buy * LAMPORTS_PER_SOL)),
    500n,
    { unitLimit: 250000, unitPrice: 250000 },
  );

  if (!result?.success) {
    return { ok: false, error: "createAndBuy failed", detail: result };
  }

  const coin = {
    mint: mint.publicKey.toBase58(),
    name: meta.name,
    symbol: meta.symbol,
    description: meta.description,
    website: meta.website,
    buySol: buy,
    at: new Date().toISOString(),
    url: `https://pump.fun/${mint.publicKey.toBase58()}`,
    creator: publicAddress(),
  };
  writeCoins([...coins, coin]);
  writeFileSync(
    join(dataDir(), `mint-${coin.mint}.json`),
    JSON.stringify({ publicKey: coin.mint, secretKey: Array.from(mint.secretKey) }, null, 2),
    { mode: 0o600 },
  );
  return { ok: true, coin };
}
