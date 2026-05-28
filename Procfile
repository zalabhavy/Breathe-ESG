web: cd backend && python manage.py migrate && python manage.py seed_demo && gunicorn backend.wsgi --bind 0.0.0.0:$PORT
