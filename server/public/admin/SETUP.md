# Admin panel — setup

## What changed from the previous version

The old admin pages imported a fixed `lotId` computed once from the URL, and
`mountAdminChrome` hard-redirected to `index.html` whenever that was missing.
On any static host that drops query strings on a redirect (several do,
including `npx serve`'s default "clean URLs" behavior), that turned into an
infinite bounce: click a lot → the browser's own redirect strips `?lot=` →
the page sees no lot → it redirects to the chooser → repeat.

`app/entry.html` never had this problem, because it never redirects — it reads
the lot, and if it's missing just falls back to a default and carries on:
```js
const lotId = new URLSearchParams(location.search).get("lot") || "phoneix-marketcity";
```

Admin can't hardcode a single fallback lot — an owner may run several — so the
fix mirrors the *pattern*, not the literal line:

- `getLotId()` reads `?lot=` if present, else the last lot this browser used
  (`localStorage`), synchronously, no network call, no redirect.
- If neither exists, the calling page fetches the list of lots itself and
  picks one — a real fallback, exactly like `"phoneix-marketcity"` is a real fallback,
  just not a hardcoded string.
- `rememberLot(id)` saves the choice and patches the visible URL with
  `history.replaceState` — same-document, so nothing a server can do to a
  navigation request can touch it.
- Nothing in `admin/js/adminui.js` ever calls `location.href` or
  `location.replace`. There is no redirect left to strip a query string from.

This was tested against a server deliberately worse than the one that caused
the original bug — one that strips the query string on **every** `.html`
request, not just once — and the lot survives every click, plus the fresh-
browser deep-link case and the zero-lots case both resolve to a real page
instead of a loop.

## Deploy

Backend and Firestore rules are unchanged from before — if you already
deployed `server/functions` and set public access on the admin functions,
there's nothing new to do there.

```
npx serve .          # from the repo root
```
Open `admin/index.html`, pick a lot. Every other admin page now works from a
bookmark, a shared link, or a plain click — in any order, on any static host.

## Files

```
admin/
  index.html      lot chooser + create-lot form
  control.html    Control Room
  layout.html     layout editor
  cameras.html    floor-wise camera watch
  revenue.html    analytics
  js/
    adminui.js      chrome + lot resolution (rewritten — see above)
    blueprint.js    grid model + renderer (unchanged)
    catalog.js      28-element catalog (unchanged)
    charts.js       revenue charts (unchanged)
    firebase-config.js / authService.js  (identical to app/'s copies)
```
