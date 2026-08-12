import { createServer } from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname, join, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import { browserBackend, latestFrame } from "./browser.js";
import { readCoins } from "./pump.js";
import { snapshot, subscribe } from "./store.js";
import { walletStatus } from "./wallet.js";
import { challenge } from "./x402.js";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const publicDir = join(root, "public");

const MIME = {
  ".html": "text/html; charset=utf-8",
  ".js": "text/javascript; charset=utf-8",
  ".css": "text/css; charset=utf-8",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon",
  ".webp": "image/webp",
};

export function startServer({ port, dailyBudgetUsd }) {
  const clients = new Set();

  subscribe((event) => {
    const payload = `data: ${JSON.stringify(event)}\n\n`;
    for (const res of clients) {
      try {
        res.write(payload);
      } catch {
        clients.delete(res);
      }
    }
  });

  const server = createServer((req, res) => {
    const url = new URL(req.url || "/", `http://127.0.0.1:${port}`);

    if (url.pathname === "/api/state") {
      res.writeHead(200, {
        "Content-Type": "application/json; charset=utf-8",
        "Cache-Control": "no-store",
      });
      Promise.resolve(walletStatus())
        .then((wallet) => {
          res.end(
            JSON.stringify({
              ...snapshot(dailyBudgetUsd),
              wallet,
              coins: readCoins(),
              browserBackend: browserBackend(),
              hasFrame: Boolean(latestFrame()),
            }),
          );
        })
        .catch((err) => {
          res.end(
            JSON.stringify({
              ...snapshot(dailyBudgetUsd),
              wallet: { error: String(err.message || err), independent: true },
              coins: readCoins(),
              browserBackend: browserBackend(),
              hasFrame: Boolean(latestFrame()),
            }),
          );
        });
      return;
    }

    if (url.pathname === "/api/x402/tip" || url.pathname === "/.well-known/x402") {
      const body = challenge(url.pathname, "tip groklius so he keeps wandering");
      if (!req.headers["payment-signature"] && !req.headers["x-payment"]) {
        res.writeHead(402, { "Content-Type": "application/json; charset=utf-8" });
        res.end(JSON.stringify(body));
        return;
      }
      res.writeHead(200, { "Content-Type": "application/json; charset=utf-8" });
      res.end(JSON.stringify({ ok: true, thanks: "groklius", payTo: body.accepts[0].payTo }));
      return;
    }

    if (url.pathname === "/api/frame.jpg") {
      const buf = latestFrame();
      if (!buf) {
        res.writeHead(204).end();
        return;
      }
      res.writeHead(200, {
        "Content-Type": "image/jpeg",
        "Cache-Control": "no-store",
        "Content-Length": buf.length,
      });
      res.end(buf);
      return;
    }

    if (url.pathname === "/api/frame.mjpeg") {
      res.writeHead(200, {
        "Content-Type": "multipart/x-mixed-replace; boundary=frame",
        "Cache-Control": "no-cache, no-store",
        Connection: "keep-alive",
      });
      const tick = () => {
        const buf = latestFrame();
        if (!buf || res.writableEnded) return;
        try {
          res.write(`--frame\r\nContent-Type: image/jpeg\r\nContent-Length: ${buf.length}\r\n\r\n`);
          res.write(buf);
          res.write("\r\n");
        } catch {
          clearInterval(id);
        }
      };
      const id = setInterval(tick, 400);
      tick();
      req.on("close", () => clearInterval(id));
      return;
    }

    if (url.pathname === "/api/stream") {
      res.writeHead(200, {
        "Content-Type": "text/event-stream",
        "Cache-Control": "no-cache",
        Connection: "keep-alive",
      });
      res.write(`data: ${JSON.stringify({ type: "hello", at: new Date().toISOString() })}\n\n`);
      clients.add(res);
      req.on("close", () => clients.delete(res));
      return;
    }

    let filePath = join(publicDir, url.pathname === "/" ? "index.html" : url.pathname);
    if (!filePath.startsWith(publicDir)) {
      res.writeHead(403).end("no");
      return;
    }
    if (!existsSync(filePath)) {
      res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
      return;
    }
    const type = MIME[extname(filePath)] || "application/octet-stream";
    res.writeHead(200, { "Content-Type": type, "Cache-Control": "no-store" });
    res.end(readFileSync(filePath));
  });

  return new Promise((resolve) => {
    server.listen(port, "0.0.0.0", () => resolve(server));
  });
}
