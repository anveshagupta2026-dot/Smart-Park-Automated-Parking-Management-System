# Smart Park

## What is included
- Original v0 pink UI and parking-map styling preserved.
- Entry routes determined by QR URL:
  - `/entry/main-campus`
  - `/entry/sjt-block`
- No campus-selection screen after opening a QR route.
- Floor selection, live available/occupied slot display, slot selection.
- 3-minute stall lock countdown.
- Mobile + simulated 6-digit OTP.
- Parking ticket stored in browser `localStorage`.
- Exit flow at `/exit`.
- Exit verifies the same mobile number, calculates a bill, locks the amount, simulates one failed payment and then succeeds on retry.
- Successful exit releases the parking slot.

## Add your QR images
Place your own QR images in `public/` using these names:
- `entry-main-campus.png` -> points to `https://YOUR-SITE/entry/main-campus`
- `entry-sjt-block.png` -> points to `https://YOUR-SITE/entry/sjt-block`

## Run locally
```bash
npm install
npm run dev
```

## Deploy to Netlify
1. Upload the project to GitHub.
2. In Netlify choose **Add new project** -> **Import an existing project** -> GitHub.
3. Select this repository.
4. Build command: `npm run build`
5. Let Netlify detect the Next.js framework/publish settings automatically.
6. Deploy.

## Demo note
This prototype uses browser `localStorage`, so the entry and exit demo must be performed in the same browser/device. For a multi-user production system, replace localStorage with a database and real OTP/payment services.
