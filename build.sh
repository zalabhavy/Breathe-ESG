#!/bin/bash
set -e

echo "=== Installing Python dependencies ==="
pip install -r requirements.txt

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
echo "=== Seeding demo data ==="
python manage.py seed_demo

echo "=== Build complete ==="
