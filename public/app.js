const $ = (id) => document.getElementById(id);

const FILTERS = ["ALL", "THINK", "ACT", "CHAIN", "SAY"];
let filter = "ALL";
let selected = 0;
let lastState = null;
let marked = 0;

const FILTER_MAP = {
  ALL: () => true,
  THINK: (e) => e.kind === "think" || e.kind === "say",
  ACT: (e) => ["did", "browse", "lantern", "search", "xsearch"].includes(e.kind),
  CHAIN: (e) => e.kind === "chain",
  SAY: (e) => e.kind === "say" || e.kind === "draft" || e.kind === "journal",
};

function clock(iso) {
  if (!iso) return "--:--:--";
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

function money(n) {
  return `$${(Number(n) || 0).toFixed(3)}`;
}

function short(s, n = 8) {
  if (!s) return "—";
  return s.length <= n + 3 ? s : `${s.slice(0, 4)}…${s.slice(-4)}`;
}

function boot() {
  const lines = [
    "groklius // rack 0",
    "phosphor online",
    "",
    "  [cortex ] grok-4.6",
    "  [view   ] browser + search",
    "  [wallet ] independent",
    "  [stream ] thoughts / acts / chain",
    "",
    "read-only. he drives.",
  ];
  const el = $("boot");
  el.textContent = "";
  let i = 0;
  const tick = () => {
    if (i >= lines.length) {
      setTimeout(() => el.classList.add("done"), 350);
      return;
    }
    el.textContent += lines[i] + "\n";
    i += 1;
    setTimeout(tick, 70);
  };
  tick();
}

function renderBar(s) {
  const st = (s.status || "halted").toUpperCase();
  const acts = s.actionsToday || 0;
  const usd = money(s.spend?.usd);
  $("bar").textContent = `groklius  ·  ${st}  ·  ${acts} ACTS  ·  ${usd}  ·  ${clock(s.now)}`;
}

function renderView(s) {
  const b = s.browser || {};
  const url = b.url || s.lantern?.url || "about:blank";
  const title = b.title || s.lantern?.title || "no window";
  const links = b.links || [];
  $("view-chrome").textContent = `+-- view  ${title}`.padEnd(48, " ") + "--+";

  let ascii = b.ascii || s.lantern?.excerpt || "no window\nbrowser is cold.";
  if (!b.ascii && s.lantern?.excerpt) {
    ascii = `${title}\n${url}\n${"-".repeat(48)}\n${s.lantern.excerpt}`;
  }

  const escaped = escapeHtml(ascii);
  const html = escaped.replace(/\[(\d+)\]/g, (_, n) => {
    const on = Number(n) === marked ? " on" : "";
    return `<span class="link${on}" data-i="${n}">[${n}]</span>`;
  });
  $("view").innerHTML = html + (links.length && !/\[1\]/.test(ascii)
    ? "\n\n" + links.map((l) => {
      const on = l.i === marked ? " on" : "";
      return `<span class="link${on}" data-i="${l.i}">[${l.i}]</span> ${escapeHtml(l.text)}`;
    }).join("\n")
    : "");

  $("view").querySelectorAll(".link").forEach((el) => {
    el.onclick = () => {
      marked = Number(el.dataset.i);
      renderView(lastState);
    };
  });
}

function eventsOf(s) {
  return (s.events || []).filter((e) => FILTER_MAP[filter](e)).reverse();
}

function renderStream(s) {
  $("stream-chrome").textContent = "+-- stream" + " ".repeat(28) + "--+";
  $("tabs").innerHTML = FILTERS.map(
    (f) => `<b class="${f === filter ? "on" : ""}" data-f="${f}">[${f}]</b>`,
  ).join("");
  $("tabs").querySelectorAll("b").forEach((el) => {
    el.onclick = () => {
      filter = el.dataset.f;
      selected = 0;
      renderStream(lastState);
    };
  });

  const ev = eventsOf(s);
  if (selected >= ev.length) selected = Math.max(0, ev.length - 1);
  $("stream").innerHTML = ev
    .map((e, i) => {
      const on = i === selected ? " on" : "";
      return `<li class="${on}" data-i="${i}">
        <time>${clock(e.at).slice(0, 8)}</time>
        <span class="kind">${e.kind || ""}</span>
        <span class="${e.kind || ""}">${escapeHtml((e.text || "").replace(/\s+/g, " "))}</span>
      </li>`;
    })
    .join("");
  $("stream").querySelectorAll("li").forEach((el) => {
    el.onclick = () => {
      selected = Number(el.dataset.i);
      renderStream(lastState);
      openOverlay();
    };
  });
}

function renderVitals(s) {
  const w = s.wallet || {};
  const mem = Object.entries(s.memory || {})
    .sort((a, b) => (b[1].importance || 0) - (a[1].importance || 0))
    .slice(0, 3)
    .map(([k, v]) => `${k}: ${String(v.value).slice(0, 42)}`)
    .join("  ·  ") || "empty";
  const draft = (s.drafts || []).at(-1)?.text || "—";
  const mood = s.mood || "—";
  $("vitals").innerHTML =
    `wallet <span class="copy" id="copy-addr">${escapeHtml(w.address || "—")}</span>   ` +
    `<span class="ok">${w.balanceSol ?? 0} SOL</span>   spent ${w.dailySpentSol ?? 0}/${w.dailyCapSol ?? 0}   ` +
    `mood ${escapeHtml(mood)}\n` +
    `mem   ${escapeHtml(mem)}\n` +
    `draft ${escapeHtml(String(draft).slice(0, 90))}`;
  const copy = $("copy-addr");
  if (copy && w.address) {
    copy.onclick = () => navigator.clipboard?.writeText(w.address);
  }
}

function openOverlay() {
  const ev = eventsOf(lastState || {});
  const e = ev[selected];
  if (!e) return;
  $("overlay").hidden = false;
  $("overlay-head").textContent = `+-- ${e.kind || "event"}  ${clock(e.at)}`;
  $("overlay-body").textContent = e.text || "";
}

function closeOverlay() {
  $("overlay").hidden = true;
}

function render(s) {
  lastState = s;
  renderBar(s);
  renderView(s);
  renderStream(s);
  renderVitals(s);
}

function escapeHtml(s) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
}

async function pull() {
  const res = await fetch("/api/state", { cache: "no-store" });
  render(await res.json());
}

window.addEventListener("keydown", (ev) => {
  const evs = eventsOf(lastState || {});
  if (ev.key === "Escape") closeOverlay();
  if (ev.key === "j") {
    selected = Math.min(evs.length - 1, selected + 1);
    renderStream(lastState);
    if (!$("overlay").hidden) openOverlay();
  }
  if (ev.key === "k") {
    selected = Math.max(0, selected - 1);
    renderStream(lastState);
    if (!$("overlay").hidden) openOverlay();
  }
  if (ev.key === "Enter") openOverlay();
  if (ev.key === "c" && lastState?.wallet?.address) {
    navigator.clipboard?.writeText(lastState.wallet.address);
  }
  if (/^[1-9]$/.test(ev.key)) {
    marked = Number(ev.key);
    renderView(lastState);
  }
});

boot();
await pull();
setInterval(pull, 4000);
try {
  const src = new EventSource("/api/stream");
  src.onmessage = () => pull().catch(() => {});
} catch {
  /* polling */
}
