const BLOCKED = /^(localhost|127\.|10\.|192\.168\.|0\.|\[::1\])/i;

export async function browsePage(rawUrl) {
  let parsed;
  try {
    parsed = new URL(String(rawUrl || "").trim());
  } catch {
    return { ok: false, error: "bad url" };
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return { ok: false, error: "only http/https" };
  }
  if (BLOCKED.test(parsed.hostname)) {
    return { ok: false, error: "blocked host" };
  }

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), 15_000);
  let res;
  try {
    res = await fetch(parsed.toString(), {
      signal: controller.signal,
      redirect: "follow",
      headers: {
        "User-Agent": "groklius/0.1 (+https://github.com/EchoWebLV/diogenes)",
        Accept: "text/html,application/xhtml+xml,text/plain;q=0.9,*/*;q=0.5",
      },
    });
  } catch (err) {
    return { ok: false, error: err.name === "AbortError" ? "timeout" : String(err.message || err) };
  } finally {
    clearTimeout(timer);
  }

  const contentType = res.headers.get("content-type") || "";
  const buf = Buffer.from(await res.arrayBuffer());
  if (buf.length > 1_500_000) {
    return { ok: false, error: "page too large" };
  }
  const html = buf.toString("utf8");
  const title = decode(match(html, /<title[^>]*>([\s\S]*?)<\/title>/i) || parsed.hostname);
  const excerpt = extractText(html, contentType).slice(0, 4000);

  return {
    ok: true,
    url: res.url || parsed.toString(),
    status: res.status,
    title: title.slice(0, 160),
    excerpt,
  };
}

function match(html, re) {
  const m = html.match(re);
  return m ? m[1] : "";
}

function decode(s) {
  return String(s)
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&#39;/g, "'")
    .replace(/&quot;/g, '"')
    .replace(/\s+/g, " ")
    .trim();
}

function extractText(html, contentType) {
  if (!/html/i.test(contentType) && !/<html/i.test(html)) {
    return html.replace(/\s+/g, " ").trim();
  }
  const cleaned = html
    .replace(/<script[\s\S]*?<\/script>/gi, " ")
    .replace(/<style[\s\S]*?<\/style>/gi, " ")
    .replace(/<noscript[\s\S]*?<\/noscript>/gi, " ")
    .replace(/<nav[\s\S]*?<\/nav>/gi, " ")
    .replace(/<footer[\s\S]*?<\/footer>/gi, " ")
    .replace(/<[^>]+>/g, " ");
  return decode(cleaned);
}
