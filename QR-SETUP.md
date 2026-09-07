# QR codes — what changed and how to ship it

## Short answer to "do we need to deploy?"

**Yes — this feature cannot work without deploying.** A QR code is just a URL in
a picture. A phone's camera opens that URL on the phone's own network, so it can
never reach `localhost:3000` on your laptop. The site has to live at a public
address before a QR is worth printing.

Firebase Hosting is already part of the project you're paying nothing for, so
that's what this uses. One command, and you get
`https://smart-park-3b9a8.web.app`.

---

## Deploy, in order

**1. Deploy the new backend functions** (three new ones: `setBaseUrl`,
`refreshLotQr`, `getAppConfig`, plus `createLot` now writes QR URLs)

```
cd server/functions
firebase deploy --only functions
```

Then in the Cloud Run console, set **Allow public access** on the three new
services: `setbaseurl`, `refreshlotqr`, `getappconfig`.

**2. Deploy the site**

From the project root:

```
bash deploy.sh          # macOS / Linux / Git Bash
deploy.bat              # Windows CMD
```

That copies `app/` and `admin/` into `server/public/` and runs
`firebase deploy --only hosting,firestore:rules`. It prints your live URL when
it finishes.

**3. Tell the system its own address — this is the step that makes QRs real**

Open `https://<your-site>/admin/qr.html`, paste the live URL into **Base URL**
(or press *Use this page's address*, which fills it in for you), and hit
**Save & regenerate**. That writes `config/app.baseUrl` and rewrites `qr` on
every existing lot in one pass.

**4. Print**

On the QR page, *Print gate signs* produces two full-page signs — ENTRY and
EXIT — each with the lot name, location, the code, and a one-line instruction.
*Download PNG* gives you a 1024px file if you'd rather lay it out yourself.

---

## How it works

**Lot creation now generates the codes.** `createLot` reads the configured base
URL and writes onto the lot document:

```
lots/{lotId}.qr = {
  baseUrl:  "https://smart-park-3b9a8.web.app",
  entryUrl: "https://smart-park-3b9a8.web.app/app/entry.html?lot={lotId}",
  exitUrl:  "https://smart-park-3b9a8.web.app/app/exit.html?lot={lotId}",
  updatedAt: <ms>
}
```

The `?lot=` value **is** the Firestore document id, so a scan is bound to that
lot with no lookup table and nothing to keep in sync.

**One deliberate choice worth knowing:** the QR *image* is not stored in
Firestore, only the URL. The image is 100% derived from the URL, so storing both
would give you two things that can disagree — and a stale PNG that silently
points at a dead link is exactly the kind of bug you'd find at the worst moment.
The browser regenerates the image instantly from the stored URL, offline.

**The encoder is vendored, not loaded from a CDN.** `app/js/qrcode.js` is
qrcode-generator (MIT, Kazuhiko Arase) bundled into the repo, so codes still
render if the venue wifi is hostile or the CDN is blocked.

**Moving domains later is one action.** Change the Base URL on the QR page and
every lot's URLs are rewritten. If a lot's stored `baseUrl` doesn't match the
current one, the QR page shows an amber warning and a one-click regenerate,
rather than quietly serving codes that point somewhere dead.

---

## Hardcoded lot is gone

`app/entry.html` and `app/exit.html` used to fall back to
`"phoneix-marketcity"` when `?lot=` was missing. That's now removed — a wrong
lot silently is worse than a clear message. The new behaviour:

- `?lot=` present → use it (the normal QR path).
- Missing, and the project has **exactly one** lot → use that one. Covers a
  single-site deployment and anyone typing the URL by hand.
- Missing, and there are **several** lots → says *"This link is missing its lot
  code. Please scan the QR at the gate again."* rather than guessing.

---

## Files

New:
```
app/js/qrcode.js     vendored MIT QR encoder
app/js/qr.js         URL building + SVG/PNG rendering
admin/js/qrcode.js   (same files, so admin has no cross-folder imports)
admin/js/qr.js
admin/qr.html        the QR page
deploy.sh / deploy.bat
```

Changed:
```
server/functions/index.js   createLot writes qr; + setBaseUrl, refreshLotQr, getAppConfig
server/firestore.rules      config/* readable, writable only via functions
server/firebase.json        hosting block added, cleanUrls:false
app/entry.html              lot resolution, no hardcoded fallback
app/exit.html               same
admin/*.html                QR Codes added to the nav
```

## One thing to check before the demo

Google Sign-In only works on domains Firebase knows. Go to
**Authentication → Settings → Authorized domains** and confirm your
`*.web.app` domain is listed (Firebase adds it automatically for the default
site, but check it — if a driver scans and sign-in fails, this is why).
