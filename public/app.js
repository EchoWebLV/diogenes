const $ = (id) => document.getElementById(id);

function fmtTime(iso) {
  if (!iso) return "";
  return new Date(iso).toLocaleTimeString("en-GB", { hour12: false });
}

function money(n) {
  return `$${(Number(n) || 0).toFixed(3)}`;
}

function shortAddr(addr) {
  if (!addr || addr.length < 12) return addr || "";
  return `${addr.slice(0, 4)}…${addr.slice(-4)}`;
}

function render(state) {
  const status = state.status || "unknown";
  const pill = $("status");
  pill.className = `pill ${status}`;
  pill.innerHTML = `<i></i> ${status === "acting" ? "acting now" : status}`;
  $("mood").textContent = state.mood || "awake";
  $("actions").textContent = `${state.actionsToday || 0} actions today`;
  $("spend").textContent = `${money(state.spend?.usd)} / ${money(state.spend?.dailyBudgetUsd)}`;

  const lantern = state.lantern || {};
  $("lantern-url").textContent = lantern.url || "about:blank";
  $("lantern-title").textContent = lantern.title || "idle";
  $("lantern-note").textContent = lantern.note || "waiting for diogenes to open something.";
  const excerpt = $("lantern-excerpt");
  if (lantern.excerpt) {
    excerpt.hidden = false;
    excerpt.textContent = lantern.excerpt;
  } else {
    excerpt.hidden = true;
  }

  const wallet = state.wallet || {};
  $("wallet-addr").textContent = wallet.address || "no wallet";
  $("wallet-bal").textContent = wallet.error
    ? wallet.error
    : `${wallet.balanceSol ?? 0} SOL · spent ${wallet.dailySpentSol ?? 0}/${wallet.dailyCapSol ?? 0}`;
  const txs = wallet.recent || [];
  $("wallet-txs").innerHTML = txs.length
    ? txs
        .map((t) => {
          const label = t.kind === "send" ? `sent ${t.sol} → ${shortAddr(t.to)}` : t.text || t.kind;
          return `<li>${escapeHtml(label)} ${t.sig ? `<strong>${shortAddr(t.sig)}</strong>` : ""}</li>`;
        })
        .join("")
    : "<li>no on-chain moves yet. fund the address to wake the wallet.</li>";

  const events = (state.events || []).slice().reverse();
  $("events").innerHTML = events
    .map(
      (e) => `<li>
        <time>${fmtTime(e.at)}</time>
        <span class="kind">${e.kind || e.type || ""}</span>
        <span class="${e.kind || ""}">${escapeHtml(e.text || "")}</span>
      </li>`,
    )
    .join("");

  const memory = Object.entries(state.memory || {}).sort(
    (a, b) => (b[1].importance || 0) - (a[1].importance || 0),
  );
  $("memory").innerHTML = memory.length
    ? memory
        .slice(0, 12)
        .map(([k, v]) => `<li><strong>${escapeHtml(k)}</strong> — ${escapeHtml(v.value)}</li>`)
        .join("")
    : "<li>empty. he is new.</li>";

  const journal = (state.journal || []).slice().reverse();
  $("journal").innerHTML = journal.length
    ? journal.slice(0, 8).map((e) => `<li>${escapeHtml(e.text)}</li>`).join("")
    : "<li>nothing written yet.</li>";

  const drafts = (state.drafts || []).slice().reverse();
  $("drafts").innerHTML = drafts.length
    ? drafts.map((d) => `<li>${escapeHtml(d.text)}</li>`).join("")
    : "<li>no posts drafted.</li>";
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

function tick() {
  $("clock").textContent = new Date().toLocaleTimeString("en-GB", { hour12: false });
}

await pull();
tick();
setInterval(tick, 1000);
setInterval(pull, 4000);

try {
  const src = new EventSource("/api/stream");
  src.onmessage = () => {
    pull().catch(() => {});
  };
} catch {
  /* polling is enough */
}
