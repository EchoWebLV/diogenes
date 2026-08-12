import { existsSync, readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import {
  Connection,
  Keypair,
  LAMPORTS_PER_SOL,
  PublicKey,
  SystemProgram,
  Transaction,
  TransactionInstruction,
  sendAndConfirmTransaction,
} from "@solana/web3.js";
import { dataDir, todayKey } from "./store.js";

const MEMO_PROGRAM = new PublicKey("MemoSq4gqABAXKb96qnH8TysNcWxMyWCqXgDLGmfcHr");

const MAX_SEND_SOL = Number(process.env.MAX_SEND_SOL || 0.05);
const DAILY_CHAIN_SOL = Number(process.env.DAILY_CHAIN_SOL || 0.2);
const RESERVE_SOL = Number(process.env.RESERVE_SOL || 0.01);

function walletPath() {
  return join(dataDir(), "wallet.json");
}

function chainPath() {
  return join(dataDir(), "chain.json");
}

function rpcUrl() {
  return (
    process.env.SOLANA_RPC_URL ||
    process.env.RPC_URL ||
    process.env.SOLANA_RPC ||
    "https://api.mainnet-beta.solana.com"
  );
}

let cachedKeypair = null;
let cachedPublic = null;
let balanceCache = { at: 0, sol: 0 };

export function loadKeypair() {
  if (cachedKeypair) return cachedKeypair;
  mkdirSync(dataDir(), { recursive: true });
  const path = walletPath();
  if (existsSync(path)) {
    const raw = JSON.parse(readFileSync(path, "utf8"));
    cachedKeypair = Keypair.fromSecretKey(Uint8Array.from(raw.secretKey));
  } else {
    cachedKeypair = Keypair.generate();
    writeFileSync(
      path,
      JSON.stringify(
        {
          publicKey: cachedKeypair.publicKey.toBase58(),
          secretKey: Array.from(cachedKeypair.secretKey),
          createdAt: new Date().toISOString(),
        },
        null,
        2,
      ) + "\n",
      { mode: 0o600 },
    );
  }
  cachedPublic = cachedKeypair.publicKey.toBase58();
  return cachedKeypair;
}

export function publicAddress() {
  loadKeypair();
  return cachedPublic;
}

function connection() {
  return new Connection(rpcUrl(), "confirmed");
}

function readChain() {
  const empty = { day: todayKey(), spentSol: 0, txs: [] };
  try {
    const data = JSON.parse(readFileSync(chainPath(), "utf8"));
    if (data.day !== todayKey()) return { ...empty, txs: (data.txs || []).slice(-20) };
    return data;
  } catch {
    return empty;
  }
}

function writeChain(data) {
  writeFileSync(chainPath(), JSON.stringify(data, null, 2) + "\n");
}

export async function getBalance() {
  const kp = loadKeypair();
  if (Date.now() - balanceCache.at < 15_000) return balanceCache.sol;
  const lamports = await connection().getBalance(kp.publicKey);
  const sol = lamports / LAMPORTS_PER_SOL;
  balanceCache = { at: Date.now(), sol };
  return sol;
}

export async function walletStatus() {
  const chain = readChain();
  let sol = 0;
  let error = null;
  try {
    sol = await getBalance();
  } catch (err) {
    error = String(err.message || err);
  }
  return {
    address: publicAddress(),
    balanceSol: Number(sol.toFixed(6)),
    dailySpentSol: Number((chain.spentSol || 0).toFixed(6)),
    dailyCapSol: DAILY_CHAIN_SOL,
    maxSendSol: MAX_SEND_SOL,
    reserveSol: RESERVE_SOL,
    recent: (chain.txs || []).slice(-8).reverse(),
    error,
    independent: true,
  };
}

export async function inspectAccount(address) {
  let pubkey;
  try {
    pubkey = new PublicKey(String(address || "").trim());
  } catch {
    return { ok: false, error: "bad address" };
  }
  const conn = connection();
  const [info, sigs] = await Promise.all([
    conn.getAccountInfo(pubkey),
    conn.getSignaturesForAddress(pubkey, { limit: 8 }),
  ]);
  return {
    ok: true,
    address: pubkey.toBase58(),
    exists: Boolean(info),
    lamports: info?.lamports ?? 0,
    sol: (info?.lamports ?? 0) / LAMPORTS_PER_SOL,
    owner: info?.owner?.toBase58() || null,
    executable: info?.executable ?? false,
    signatures: sigs.map((s) => ({
      sig: s.signature,
      slot: s.slot,
      err: s.err,
      memo: s.memo,
    })),
  };
}

export async function sendSol({ to, amount, reason }) {
  const destStr = String(to || "").trim();
  let dest;
  try {
    dest = new PublicKey(destStr);
  } catch {
    return { ok: false, error: "bad destination" };
  }
  const sol = Number(amount);
  if (!Number.isFinite(sol) || sol <= 0) return { ok: false, error: "bad amount" };
  if (sol > MAX_SEND_SOL) return { ok: false, error: `over max send ${MAX_SEND_SOL} SOL` };

  const kp = loadKeypair();
  if (dest.equals(kp.publicKey)) return { ok: false, error: "that is already you" };

  const chain = readChain();
  if ((chain.spentSol || 0) + sol > DAILY_CHAIN_SOL) {
    return { ok: false, error: `daily chain cap ${DAILY_CHAIN_SOL} SOL` };
  }

  const balance = await getBalance();
  if (balance - sol < RESERVE_SOL) {
    return { ok: false, error: `need ${RESERVE_SOL} SOL reserve` };
  }

  const ix = SystemProgram.transfer({
    fromPubkey: kp.publicKey,
    toPubkey: dest,
    lamports: Math.round(sol * LAMPORTS_PER_SOL),
  });
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection(), tx, [kp]);
  balanceCache.at = 0;
  recordTx(chain, { kind: "send", to: dest.toBase58(), sol, reason, sig });
  return { ok: true, sig, to: dest.toBase58(), sol };
}

export async function writeMemo(text) {
  const memo = String(text || "").trim().slice(0, 200);
  if (!memo) return { ok: false, error: "empty memo" };
  const kp = loadKeypair();
  const ix = new TransactionInstruction({
    keys: [{ pubkey: kp.publicKey, isSigner: true, isWritable: true }],
    programId: MEMO_PROGRAM,
    data: Buffer.from(memo, "utf8"),
  });
  const tx = new Transaction().add(ix);
  const sig = await sendAndConfirmTransaction(connection(), tx, [kp]);
  balanceCache.at = 0;
  recordTx(readChain(), { kind: "memo", text: memo, sig });
  return { ok: true, sig, text: memo };
}

function recordTx(chain, entry) {
  const next = {
    day: todayKey(),
    spentSol: (chain.day === todayKey() ? chain.spentSol || 0 : 0) + (entry.sol || 0),
    txs: [...(chain.txs || []), { ...entry, at: new Date().toISOString() }].slice(-40),
  };
  writeChain(next);
  return next;
}
