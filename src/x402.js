import { publicAddress, loadKeypair } from "./wallet.js";

const FACILITATOR = process.env.X402_FACILITATOR_URL || "https://x402.org/facilitator";
const SOLANA_MAINNET = "solana:5eykt4UsFv8P8NJdTREpY1vzqKqZKvdp";
const PRICE = process.env.X402_PRICE || "$0.01";

export function payTo() {
  return process.env.SOLANA_RECEIVER_ADDRESS || publicAddress();
}

export function challenge(resource, description) {
  return {
    x402Version: 1,
    accepts: [
      {
        scheme: "exact",
        network: SOLANA_MAINNET,
        price: PRICE,
        payTo: payTo(),
        description: description || "pay groklius",
        mimeType: "application/json",
        resource,
      },
    ],
    facilitator: FACILITATOR,
  };
}

export async function payUrl(url) {
  const target = String(url || "").trim();
  if (!/^https?:\/\//i.test(target)) return { ok: false, error: "need http(s) url" };

  let wrapFetchWithPayment;
  let x402Client;
  let ExactSvmScheme;
  let toClientSvmSigner;
  let createKeyPairSignerFromBytes;
  try {
    ({ wrapFetchWithPayment } = await import("@x402/fetch"));
    ({ x402Client } = await import("@x402/core/client"));
    ({ ExactSvmScheme, toClientSvmSigner } = await import("@x402/svm"));
    ({ createKeyPairSignerFromBytes } = await import("@solana/kit"));
  } catch (err) {
    return { ok: false, error: `x402 client not installed: ${err.message}` };
  }

  const kp = loadKeypair();
  const signer = toClientSvmSigner(await createKeyPairSignerFromBytes(kp.secretKey));
  const client = new x402Client().register("solana:*", new ExactSvmScheme(signer));
  const payFetch = wrapFetchWithPayment(fetch, client);
  const res = await payFetch(target);
  const body = await res.text();
  return {
    ok: res.ok,
    status: res.status,
    body: body.slice(0, 2000),
    paidTo: target,
    from: publicAddress(),
  };
}
