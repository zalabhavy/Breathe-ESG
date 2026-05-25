from django.core.management.base import BaseCommand
from ingestion.models import Tenant


class Command(BaseCommand):
    help = 'Seed a demo tenant'

    def handle(self, *args, **options):
        tenant, created = Tenant.objects.get_or_create(
            name='Acme Manufacturing GmbH',
        )
        if created:
            self.stdout.write(f'Created tenant: {tenant.name} (id: {tenant.id})')
        else:
            self.stdout.write(f'Tenant exists: {tenant.name} (id: {tenant.id})')
