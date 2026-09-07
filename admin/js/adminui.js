// admin/js/adminui.js — chrome shared by every admin window.
//
// Lot resolution mirrors app/entry.html's pattern on purpose: read it, fall back
// to something sane, keep going. entry.html does
//     const lotId = new URLSearchParams(location.search).get("lot") || "phoneix-marketcity";
// in one line and never redirects. Admin can't hardcode a lot name — owners create
// their own — so the fallback is "the lot this browser used last" (localStorage)
// instead of a fixed string, and the last resort ("no lot known at all") is handled
// by the calling page, not by bouncing to another page. Nothing in this file ever
// calls location.replace / location.href — a static host that drops the query
// string on a redirect (some do) can no longer cause a loop, because there is no
// redirect to begin with.

export const ADMIN_CSS = `
  :root{
    --ink:#161A1E; --ink-soft:#2B323B; --paper:#EDEAE2; --paper-2:#e4e0d3;
    --free:#2F6F4E; --free-bg:#D8F3E5; --taken:#B5402C; --taken-bg:#FDE8E5;
    --route:#3D6B8C; --pillar:#808996; --pillar-bg:#CAD0D8;
    --line:#C7C2B4; --muted:#555049; --warn:#B58900; --lane:#BDB7A6; --shadow:rgba(22,26,30,.18);
  }
  html[data-theme="dark"]{
    --ink:#EDEAE2; --ink-soft:#c9c5b8; --paper:#1B1F24; --paper-2:#14171b;
    --free:#5fbb8c; --free-bg:#064E3B; --taken:#e07a5f; --taken-bg:#7F1D1D;
    --route:#7fb0d6; --pillar:#475569; --pillar-bg:#334155;
    --line:#3a3f46; --muted:#a9a49a; --warn:#eab308; --lane:#3f4650; --shadow:rgba(0,0,0,.5);
  }
  *{box-sizing:border-box; margin:0; padding:0;}
  body{font-family:'Space Grotesk', system-ui, sans-serif; color:var(--ink);
    background:radial-gradient(circle at 20% 0%, var(--paper-2), var(--paper) 75%); padding:20px 16px 60px; transition:background .3s;}
  .wrap{max-width:1080px; margin:0 auto; background:var(--paper); border:1.5px solid var(--ink); box-shadow:0 16px 34px var(--shadow);}
  header{padding:14px 20px; border-bottom:1px solid var(--ink); display:flex; justify-content:space-between; align-items:center; flex-wrap:wrap; gap:10px;}
  .brand{display:flex; align-items:center; gap:10px;}
  .brand .mark{width:30px; height:30px; background:var(--ink); color:var(--paper); display:flex; align-items:center; justify-content:center; font-weight:700;}
  .brand h1{font-size:16px;}
  .brand .tag{font-size:11px; color:var(--muted);}
  .hdr-right{display:flex; align-items:center; gap:10px;}
  .live-dot{display:inline-flex; align-items:center; gap:6px; font-size:12px; color:var(--muted); font-weight:600;}
  .live-dot.on{color:var(--free);}
  .live-dot i{width:8px; height:8px; border-radius:50%; background:currentColor; animation:pulse 1.4s infinite;}
  @keyframes pulse{0%,100%{opacity:1;}50%{opacity:.35;}}
  @media (prefers-reduced-motion:reduce){.live-dot i{animation:none;}}
  .icon-btn{width:32px; height:32px; border:1px solid var(--ink); background:var(--paper); color:var(--ink); cursor:pointer; font-size:14px;}

  .navbar{display:flex; gap:8px; padding:11px 20px; border-bottom:1px solid var(--ink); flex-wrap:wrap; align-items:center;}
  .navbar a{padding:7px 13px; border:1px solid var(--ink); background:var(--paper); color:var(--ink); text-decoration:none; font-size:12px; font-weight:700;}
  .navbar a:hover{background:var(--line);}
  .navbar a.here{background:var(--ink); color:var(--paper);}
  .navbar .spacer{flex:1;}
  .navbar .switch{font-size:11px; color:var(--muted); text-decoration:underline; border:none; background:none; padding:0; cursor:pointer; font-family:inherit;}
  .navbar .lotname{font-size:11px; color:var(--muted);}
  .navbar .lotname b{color:var(--ink);}

  .btn{padding:8px 16px; border:1px solid var(--ink); background:var(--paper); font-family:inherit; font-size:12px; font-weight:700; cursor:pointer; color:var(--ink); text-decoration:none; display:inline-block;}
  .btn:hover{background:var(--line);}
  .btn.primary{background:var(--ink); color:var(--paper);}
  .btn.danger{border-color:var(--taken); color:var(--taken);}
  .btn:disabled{opacity:.45; cursor:not-allowed;}
  .mini{padding:4px 9px; border:1px solid var(--ink); background:var(--paper); font-family:inherit; font-size:11px; font-weight:700; cursor:pointer; color:var(--ink);}
  .mini.on{background:var(--ink); color:var(--paper);}
  .mini:disabled{opacity:.4; cursor:not-allowed;}
  .seg{display:inline-flex; border:1.5px solid var(--ink); overflow:hidden;}
  .seg button{padding:6px 12px; border:none; background:transparent; font-family:inherit; font-size:11.5px; font-weight:700; color:var(--ink); cursor:pointer; border-right:1px solid var(--ink);}
  .seg button:last-child{border-right:none;}
  .seg button.on{background:var(--ink); color:var(--paper);}

  label{display:block; font-size:11px; font-weight:700; color:var(--muted); margin-bottom:4px;}
  input, select{width:100%; border:1px solid var(--ink); background:var(--paper); color:var(--ink); padding:9px 10px; font-family:inherit; font-size:13px;}
  input:focus, select:focus{outline:none; border-color:var(--route);}
  .field{margin-bottom:12px;}
  h3{font-size:11px; text-transform:uppercase; color:var(--muted); margin:0 0 10px; letter-spacing:.04em;}
  .empty{color:var(--muted); font-size:13px; padding:12px 0;}
  .hidden{display:none !important;}
  .note{font-size:11px; color:var(--muted); line-height:1.6;}
  button:focus-visible, a:focus-visible, input:focus-visible, select:focus-visible, summary:focus-visible{outline:2px solid var(--route); outline-offset:2px;}

  .toast{position:fixed; left:50%; bottom:24px; transform:translateX(-50%); border:1.5px solid var(--ink); background:var(--paper);
    padding:10px 16px; font-size:13px; box-shadow:0 8px 20px var(--shadow); display:none; z-index:60; max-width:90vw; line-height:1.4;}
  .toast.show{display:block;}
  .toast.err{border-color:var(--taken); color:var(--taken);}

  .gate{padding:60px 24px; text-align:center;}
  .gate h2{font-size:18px; margin-bottom:8px;}
  .gate p{font-size:13px; color:var(--muted); margin-bottom:18px; line-height:1.5;}
`;

const STORE_KEY = "sp-admin-lot";

/**
 * Best-effort lot id, resolved the same way on every page, synchronously,
 * no network call. URL wins (so a shared/bookmarked link always works even in
 * a fresh browser); otherwise fall back to whatever this browser used last.
 * Returns null only if neither source has anything — the page decides what to
 * show in that case (never this module, and never a redirect).
 */
export function getLotId() {
  const fromUrl = new URLSearchParams(location.search).get("lot");
  if (fromUrl) {
    try { localStorage.setItem(STORE_KEY, fromUrl); } catch {}
    return fromUrl;
  }
  try {
    const remembered = localStorage.getItem(STORE_KEY);
    if (remembered) return remembered;
  } catch {}
  return null;
}

/**
 * Call once a lot id is known (including "found it via localStorage" or
 * "just fetched the first lot that exists"), so every other page — and a
 * reload of this one — agrees on it. Updates the visible URL in place with
 * history.replaceState: no navigation happens, so nothing can drop it.
 */
export function rememberLot(id) {
  if (!id) return;
  try { localStorage.setItem(STORE_KEY, id); } catch {}
  const url = new URL(location.href);
  if (url.searchParams.get("lot") !== id) {
    url.searchParams.set("lot", id);
    history.replaceState(null, "", url);
  }
}

export function forgetLot() {
  try { localStorage.removeItem(STORE_KEY); } catch {}
}

/** Build an href to another admin page carrying whatever lot id is currently known. */
export function withLot(href, lotId) {
  const id = lotId ?? getLotId();
  if (!id) return href;
  return `${href}${href.includes("?") ? "&" : "?"}lot=${encodeURIComponent(id)}`;
}

export function mountAdminChrome({ title, tag, here }) {
  document.head.appendChild(Object.assign(document.createElement("style"), { textContent: ADMIN_CSS }));
  try { if (localStorage.getItem("sp-theme") === "dark") document.documentElement.setAttribute("data-theme", "dark"); } catch {}

  document.querySelectorAll("[data-brand-title]").forEach(e => e.textContent = title);
  document.querySelectorAll("[data-brand-tag]").forEach(e => e.textContent = tag);
  document.querySelectorAll(".navbar a[href]").forEach(a => {
    const base = a.getAttribute("href");
    a.classList.toggle("here", base === here);
    if (base !== "index.html") a.setAttribute("href", withLot(base));
  });

  const btn = document.getElementById("themeBtn");
  if (btn) {
    const sync = () => btn.textContent = document.documentElement.getAttribute("data-theme") === "dark" ? "☀️" : "🌙";
    sync();
    btn.onclick = () => {
      const dark = document.documentElement.getAttribute("data-theme") === "dark";
      document.documentElement.setAttribute("data-theme", dark ? "light" : "dark");
      try { localStorage.setItem("sp-theme", dark ? "light" : "dark"); } catch {}
      sync();
    };
  }
}

/** Render the "no lot could be resolved, and none exist yet" screen. Never auto-navigates. */
export function renderNoLots(container) {
  container.innerHTML = `
    <div class="gate">
      <h2>No lots yet</h2>
      <p>This project doesn't have a parking lot set up. Create one to get started.</p>
      <a class="btn primary" href="index.html">Set up a lot</a>
    </div>`;
}

let toastTimer;
export function toast(msg, isErr) {
  let t = document.getElementById("toast");
  if (!t) { t = document.createElement("div"); t.id = "toast"; t.className = "toast"; document.body.appendChild(t); }
  t.textContent = msg; t.classList.toggle("err", !!isErr); t.classList.add("show");
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => t.classList.remove("show"), isErr ? 6000 : 3600);
}

/** Turn a callable error into something a human can act on. */
export function explain(err) {
  const code = (err?.code || "").replace("functions/", "");
  const msg = err?.message || "";
  if (code === "internal" && (!msg || msg === "internal")) {
    return "The server didn't respond. Usually the function isn't deployed yet, or its Cloud Run service hasn't been set to “Allow public access”.";
  }
  if (code === "not-found" && /Lot '.*' not found/.test(msg)) return msg + " It may have been deleted — try Switch lot.";
  if (code === "unauthenticated") return "That call needs a signed-in user.";
  return msg || code || "Something went wrong.";
}

export function live(on, text) {
  const d = document.getElementById("liveDot"), t = document.getElementById("liveText");
  if (d) d.classList.toggle("on", on);
  if (t) t.textContent = text;
}
