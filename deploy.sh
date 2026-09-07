#!/usr/bin/env bash
# deploy.sh — publish the whole site to Firebase Hosting.
# Run from the project root:   bash deploy.sh
set -e

echo "==> Staging frontend into server/public/"
rm -rf server/public
mkdir -p server/public
cp -r app   server/public/app
cp -r admin server/public/admin

echo "==> Deploying hosting + firestore rules"
cd server
firebase deploy --only hosting,firestore:rules

echo
echo "Done. Your site is live at:"
firebase hosting:sites:list 2>/dev/null | grep -o 'https://[^ ]*' | head -1 || echo "  https://<your-project-id>.web.app"
echo
echo "Next: open /admin/qr.html, paste that URL into 'Base URL', and hit Save & regenerate."
