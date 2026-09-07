# Smart Park — server / app / admin

Three folders, mirroring your repo. Each replaces its counterpart.

```
server/functions/index.js     ← complete replacement
server/firestore.rules        ← complete replacement
server/firestore.indexes.json ← complete replacement
app/                          ← entry.html, exit.html, js/
admin/                        ← index, control, layout, cameras, revenue, js/
```

## 1. Deploy the server
```
cd server/functions
firebase deploy --only functions
cd ..
firebase deploy --only firestore:rules,firestore:indexes
```
Then Cloud Run console → **each** of these services → Security → Allow public access:
`addfloor addslots deleteslot renameslot updatelotlayout reportcameraframe
applycameraframe clearalltickets getrevenue seeddemopayments createlot`
(Your existing six are already public.)

The revenue query needs a single-field index on `payments.paidMs`. The first
call will fail with a link to create it if the indexes deploy didn't — click
it, wait a minute, retry.

## 2. Serve
```
npx serve .          # from the repo root
```
- Drivers: `http://…/app/entry.html?lot=phoneix-marketcity`
- Owner:   `http://…/admin/index.html` → pick the lot → bookmark the page you land on

---

# What changed, and why

## The "internal" error
Every Cloud Function is now wrapped. Anything unexpected reaches the browser
as `functionName: actual message` instead of a bare "internal". The admin pages
translate the remaining generic cases: if a function isn't deployed or isn't
public, you'll see *"The server didn't respond. Usually the function isn't
deployed yet, or its Cloud Run service hasn't been set to Allow public access."*
That was almost certainly your original cause — `clearAllTickets` was new and
needed both steps.

Also fixed while there: `resetTicket`/`clearAllTickets` no longer fail if a
ticket points at a bay that was deleted, and `lockSlot` reports *which* lot
you're already parked at.

## Lot-scoped admin
`admin/index.html` is the only place that lists lots. Everything else takes
`?lot=` and never shows another lot. Nav links carry it forward. No `?lot=`
sends you back to the chooser. A parking owner bookmarks `control.html?lot=…`
and never sees the chooser again.

## Layout stored as a matrix
`lots/{lotId}.layout.floors[floor]` is now
```
{ rows, cols, matrix: [ {c:[cell|null, …]}, … ] }
```
`matrix[r].c[col]` is the cell at row r, column c. The `c` wrapper exists only
because Firestore forbids an array directly inside an array. Every reader
(`app`, `admin`, server) unwraps it to a plain 2-D array, and old `cells`-map
layouts are still read and migrated on the fly.

`entry.html` renders **exactly** the saved plan. Nothing is auto-placed. If a
bay exists in Firestore but isn't on the plan, drivers can't book it — the
Control Room shows a warning listing those bays with a link to place them.

## Cameras are per floor
One still camera per floor reports the **grid cells** containing a car:
```
reportCameraFrame({ lotId, floor, cells:["3_1","3_2","5_9"], source:"cam-ground-1" })
```
The backend stores the frame on the lot doc (`cameras[floor]`) and mirrors it
onto the bays at those coordinates as `sensorState`. Booking `status` is never
touched. The Cameras page shows the floor plan with detections overlaid, lists
disagreements, and has a *simulate* mode so you can test the whole loop before
the vision script exists. A car in a non-bay cell renders too — that's someone
parked in a lane. "Make bookings match the camera" calls `applyCameraFrame`.

## Revenue
`confirmPaymentAndRelease` now writes a permanent record to
`lots/{lotId}/payments/{id}` for every paid exit (amount, times, duration, bay,
floor, occupancy at exit, peak flag, hour, weekday). The Revenue tab reads a
month at a time via `getRevenue` and computes everything client-side:
month KPIs vs last month, daily bars, hour-of-exit histogram with your peak
windows highlighted, weekday averages, hour×weekday heat, floor split, top bays,
stay lengths, pricing-tier breakdown, a ledger, CSV export. Each chart has a
one-line insight (best day, whether your configured peaks match reality,
how often the ₹75 ceiling binds).

Nothing to show yet? The empty state offers **Generate 45 days of demo data**
(`seedDemoPayments`) — plausible history with realistic peak-hour weighting.
Records are flagged `demo:true` so you can delete them later.

## Layout editor (unchanged from last round)
Catalog of 28 elements, drag-drop or click-to-brush, pen tools for lanes and
walls that self-connect, drag pieces to move, right-drag erases, R rotates,
undo/redo, grid grows from any edge, floors managed on the same page.

## Still open
- No permission checks anywhere. Don't put `admin/` on a public URL yet.
- `seedDemoPayments` and `seedDatabase` should be deleted before anything real.
