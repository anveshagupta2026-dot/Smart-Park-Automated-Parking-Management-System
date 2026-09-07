@echo off
REM deploy.bat - publish the site to Firebase Hosting. Run from the project root.
echo ==^> Staging frontend into server\public\
if exist server\public rmdir /s /q server\public
mkdir server\public
xcopy app server\public\app /E /I /Q /Y
xcopy admin server\public\admin /E /I /Q /Y
echo ==^> Deploying
cd server
firebase deploy --only hosting,firestore:rules
cd ..
echo.
echo Done. Open /admin/qr.html and set the Base URL to your live site address.
