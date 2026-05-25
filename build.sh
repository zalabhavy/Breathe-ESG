#!/bin/bash
set -e

echo "=== Building frontend ==="
cd frontend
npm install
npm run build
cd ..

echo "=== Copying frontend build to Django ==="
rm -rf backend/staticfiles/frontend
mkdir -p backend/staticfiles/frontend
cp -r frontend/dist/* backend/staticfiles/frontend/

echo "=== Collecting Django static files ==="
cd backend
python manage.py collectstatic --noinput
python manage.py migrate

echo "=== Build complete ==="
