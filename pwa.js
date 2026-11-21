/* GTR Retail: "Add GTR to your home screen".
   - Registers the service worker (sw.js) so Chrome treats the site as an installable app.
   - Android Chrome / Samsung Internet / desktop Chrome & Edge: the Add button opens the browser's real Install prompt.
   - iPhone / iPad: browsers there never show an install prompt, so the Add button shows the Share -> Add to Home Screen steps.
   - Other Android browsers: shows "menu -> Add to Home screen" steps.
   - Hidden when the site is already opened from the home screen, after it's installed, or for 30 days after "Not now".
   - Any element with data-gtr-install (e.g. a footer link) opens the same flow and is hidden when it can't help.
   Preview on a computer: add ?pwa=ios or ?pwa=android to the address. */
(function () {
  if ("serviceWorker" in navigator) {
    window.addEventListener("load", () => navigator.serviceWorker.register("/sw.js").catch(() => {}));
  }

  const KEY = "gtr-a2hs-hidden-until";
  const store = {
    get() { try { return Number(localStorage.getItem(KEY) || 0); } catch (e) { return 0; } },
    set(v) { try { localStorage.setItem(KEY, String(v)); } catch (e) {} }
  };
  const ua = navigator.userAgent || "";
  const force = new URLSearchParams(location.search).get("pwa");
  const standalone = (window.matchMedia && matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  const ios = force === "ios" || (!force && (/iPhone|iPad|iPod/.test(ua) || (/Macintosh/.test(ua) && navigator.maxTouchPoints > 1)));
  const android = force === "android" || (!force && /Android/.test(ua));
  const inApp = /FBAN|FBAV|FB_IAB|Instagram|Messenger/.test(ua);
  if (standalone && !force) {
    const hide = () => document.querySelectorAll("[data-gtr-install]").forEach(el => el.hidden = true);
    if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", hide); else hide();
    return;
  }

  let deferred = null;     // Chrome's saved install prompt
  let mode = null;         // "prompt" | "ios" | "android"
  let bar = null, sheet = null;

  const css = `
.gtr-a2hs{position:fixed;left:12px;right:12px;bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:60;max-width:460px;margin:0 auto;
  display:flex;align-items:center;gap:12px;padding:12px 12px 12px 12px;border-radius:18px;background:#12191e;color:#eef6f7;
  border:1px solid #26333b;box-shadow:0 14px 40px rgba(0,0,0,.45);font:500 14.5px "Figtree",system-ui,-apple-system,"Segoe UI",sans-serif;
  transform:translateY(140%);transition:transform .35s cubic-bezier(.2,.8,.2,1)}
.gtr-a2hs.show{transform:none}
.gtr-a2hs::before{content:"";position:absolute;left:16px;right:16px;top:-1px;height:2px;border-radius:2px;background:linear-gradient(100deg,#17ead9,#1ec5db 38%,#2991de 72%,#3a6fe0)}
.gtr-a2hs img{width:46px;height:46px;border-radius:11px;flex:none}
.gtr-a2hs .t{flex:1;min-width:0;line-height:1.25}
.gtr-a2hs .t b{display:block;font:700 14px "Unbounded","Arial Black",system-ui,sans-serif;letter-spacing:-.01em}
.gtr-a2hs .t span{color:#9fb2ba;font-size:13px}
.gtr-a2hs .add{flex:none;border:0;border-radius:999px;padding:10px 16px;font:700 14.5px "Figtree",system-ui,sans-serif;color:#0b0f12;cursor:pointer;
  background:linear-gradient(100deg,#17ead9,#1ec5db 38%,#2991de 72%,#3a6fe0)}
.gtr-a2hs .x{flex:none;width:34px;height:34px;border:0;border-radius:50%;background:transparent;color:#9fb2ba;font-size:22px;line-height:1;cursor:pointer}
.gtr-a2hs .x:hover{color:#eef6f7;background:#18222a}
.gtr-a2hs-sheet{position:fixed;inset:0;z-index:70;display:flex;align-items:flex-end;justify-content:center;background:rgba(0,0,0,.55);
  padding:12px 12px calc(12px + env(safe-area-inset-bottom,0px))}
.gtr-a2hs-sheet[hidden]{display:none}
.gtr-a2hs-sheet .card{width:100%;max-width:460px;background:#12191e;color:#eef6f7;border:1px solid #26333b;border-radius:20px;padding:20px 20px 16px;
  font:500 15px/1.45 "Figtree",system-ui,-apple-system,"Segoe UI",sans-serif;box-shadow:0 20px 60px rgba(0,0,0,.5)}
.gtr-a2hs-sheet h2{margin:0 0 4px;font:700 18px "Unbounded","Arial Black",system-ui,sans-serif;letter-spacing:-.01em}
.gtr-a2hs-sheet p.sub{margin:0 0 14px;color:#9fb2ba;font-size:14px}
.gtr-a2hs-sheet ol{margin:0;padding:0;list-style:none;counter-reset:s}
.gtr-a2hs-sheet li{counter-increment:s;display:flex;gap:12px;align-items:flex-start;padding:10px 0;border-top:1px solid #26333b}
.gtr-a2hs-sheet li::before{content:counter(s);flex:none;width:26px;height:26px;border-radius:50%;display:grid;place-items:center;
  font:700 13px "JetBrains Mono",ui-monospace,monospace;color:#0b0f12;background:linear-gradient(100deg,#17ead9,#2991de)}
.gtr-a2hs-sheet .gtr-ico{display:inline-block;vertical-align:-4px;width:20px;height:20px;color:#3fe3d6}
.gtr-a2hs-sheet .note{margin:10px 0 0;color:#9fb2ba;font-size:13px}
.gtr-a2hs-sheet .done{display:block;width:100%;margin-top:14px;border:1.5px solid #26333b;border-radius:999px;padding:11px;background:transparent;
  color:#eef6f7;font:700 15px "Figtree",system-ui,sans-serif;cursor:pointer}
.gtr-a2hs-sheet .done:hover{border-color:#1ec5db}
@media (prefers-reduced-motion: reduce){.gtr-a2hs{transition:none}}
[data-gtr-install][hidden]{display:none!important}`;

  const SHARE = '<svg class="gtr-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M12 3v12"/><path d="M8 7l4-4 4 4"/><path d="M6 11H5a1 1 0 0 0-1 1v8a1 1 0 0 0 1 1h14a1 1 0 0 0 1-1v-8a1 1 0 0 0-1-1h-1"/></svg>';
  const PLUS = '<svg class="gtr-ico" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" aria-hidden="true"><rect x="4" y="4" width="16" height="16" rx="3"/><path d="M12 8v8M8 12h8"/></svg>';
  const DOTS = '<svg class="gtr-ico" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><circle cx="12" cy="5" r="2"/><circle cx="12" cy="12" r="2"/><circle cx="12" cy="19" r="2"/></svg>';

  function steps() {
    if (mode === "ios") {
      const first = inApp
        ? `<li><span>You're inside the Facebook or Instagram browser. Tap <b>•••</b> and choose <b>Open in browser</b> first, then come back here.</span></li>`
        : "";
      return first +
        `<li><span>Tap the <b>Share</b> button ${SHARE} (bottom of the screen in Safari, or top in Chrome). If you don't see it, tap <b>•••</b> first.</span></li>
         <li><span>Scroll down and tap <b>Add to Home Screen</b> ${PLUS}</span></li>
         <li><span>Tap <b>Add</b>. The GTR icon is now on your home screen.</span></li>`;
    }
    return `<li><span>Tap your browser's menu ${DOTS} (top or bottom corner).</span></li>
            <li><span>Tap <b>Add to Home screen</b> or <b>Install app</b>.</span></li>
            <li><span>Tap <b>Add</b> or <b>Install</b>. The GTR icon is now on your home screen.</span></li>`;
  }

  function openSheet() {
    if (!sheet) {
      sheet = document.createElement("div");
      sheet.className = "gtr-a2hs-sheet";
      sheet.setAttribute("role", "dialog");
      sheet.setAttribute("aria-modal", "true");
      sheet.setAttribute("aria-labelledby", "gtr-a2hs-h");
      sheet.addEventListener("click", e => { if (e.target === sheet) closeSheet(); });
      document.addEventListener("keydown", e => { if (e.key === "Escape" && sheet && !sheet.hidden) closeSheet(); });
      document.body.append(sheet);
    }
    sheet.innerHTML = `<div class="card">
        <h2 id="gtr-a2hs-h">Add GTR to your home screen</h2>
        <p class="sub">It opens gtrretail.ca like an app. Free, no app store.</p>
        <ol>${steps()}</ol>
        <button type="button" class="done">Got it</button></div>`;
    sheet.querySelector(".done").addEventListener("click", closeSheet);
    sheet.hidden = false;
    sheet.querySelector(".done").focus();
  }
  function closeSheet() { if (sheet) sheet.hidden = true; }

  async function add() {
    if (mode === "prompt" && deferred) {
      const p = deferred; deferred = null;
      p.prompt();
      try {
        const r = await p.userChoice;
        if (r && r.outcome === "accepted") hideAll(true);
      } catch (e) {}
      return;
    }
    openSheet();
  }

  function hideBar() { const b = bar; bar = null; if (b) { b.classList.remove("show"); setTimeout(() => b.remove(), 400); } }
  function hideAll(installed) {
    hideBar(); closeSheet();
    if (installed) store.set(Date.now() + 3650 * 864e5);
    document.querySelectorAll("[data-gtr-install]").forEach(el => el.hidden = true);
  }

  function showBar() {
    if (bar || store.get() > Date.now()) return;
    bar = document.createElement("div");
    bar.className = "gtr-a2hs";
    bar.setAttribute("role", "region");
    bar.setAttribute("aria-label", "Add GTR to your home screen");
    bar.innerHTML = `<img src="/icons/icon-192.png" alt="">
      <div class="t"><b>Get the GTR app</b><span>Add it to your home screen. Free.</span></div>
      <button type="button" class="add">Add</button>
      <button type="button" class="x" aria-label="Not now">×</button>`;
    bar.querySelector(".add").addEventListener("click", add);
    bar.querySelector(".x").addEventListener("click", () => { store.set(Date.now() + 30 * 864e5); hideBar(); });
    document.body.append(bar);
    requestAnimationFrame(() => requestAnimationFrame(() => bar && bar.classList.add("show")));
  }

  function ready(m) {
    if (mode === "prompt" && m !== "prompt") return;
    mode = m;
    document.querySelectorAll("[data-gtr-install]").forEach(el => el.hidden = false);
    setTimeout(showBar, 2500);
  }

  const style = document.createElement("style");
  style.textContent = css;
  document.head.append(style);

  window.addEventListener("beforeinstallprompt", e => { e.preventDefault(); deferred = e; ready("prompt"); });
  window.addEventListener("appinstalled", () => hideAll(true));

  function init() {
    document.querySelectorAll("[data-gtr-install]").forEach(el => {
      if (!mode) el.hidden = true;
      el.addEventListener("click", e => { e.preventDefault(); add(); });
    });
    if (ios) ready("ios");
    else if (android) setTimeout(() => { if (!mode) ready("android"); }, 3500);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init); else init();
})();
