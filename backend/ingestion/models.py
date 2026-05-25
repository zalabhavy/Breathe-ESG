import uuid
from django.db import models
from django.contrib.auth.models import User


class Tenant(models.Model):
    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    name = models.CharField(max_length=255)
    created_at = models.DateTimeField(auto_now_add=True)

    def __str__(self):
        return self.name


class DataSource(models.Model):
    SOURCE_TYPES = [
        ('sap_fuel', 'SAP Fuel & Procurement'),
        ('utility', 'Utility Electricity'),
        ('travel', 'Corporate Travel'),
    ]
    STATUS_CHOICES = [
        ('pending', 'Pending Processing'),
        ('processed', 'Processed'),
        ('failed', 'Failed'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='data_sources')
    source_type = models.CharField(max_length=20, choices=SOURCE_TYPES)
    file_name = models.CharField(max_length=500)
    uploaded_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    uploaded_at = models.DateTimeField(auto_now_add=True)
    status = models.CharField(max_length=20, choices=STATUS_CHOICES, default='pending')
    row_count = models.IntegerField(default=0)
    error_count = models.IntegerField(default=0)
    raw_file = models.FileField(upload_to='uploads/', null=True, blank=True)

    class Meta:
        ordering = ['-uploaded_at']

    def __str__(self):
        return f"{self.source_type} — {self.file_name}"


class EmissionRecord(models.Model):
    SCOPE_CHOICES = [
        (1, 'Scope 1 — Direct'),
        (2, 'Scope 2 — Indirect (Energy)'),
        (3, 'Scope 3 — Indirect (Value Chain)'),
    ]
    REVIEW_CHOICES = [
        ('pending', 'Pending Review'),
        ('approved', 'Approved'),
        ('flagged', 'Flagged'),
        ('rejected', 'Rejected'),
    ]
    CATEGORY_CHOICES = [
        ('stationary_combustion', 'Stationary Combustion'),
        ('mobile_combustion', 'Mobile Combustion'),
        ('purchased_electricity', 'Purchased Electricity'),
        ('business_travel_air', 'Business Travel — Air'),
        ('business_travel_hotel', 'Business Travel — Hotel'),
        ('business_travel_ground', 'Business Travel — Ground'),
        ('purchased_goods', 'Purchased Goods & Services'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    tenant = models.ForeignKey(Tenant, on_delete=models.CASCADE, related_name='emission_records')
    data_source = models.ForeignKey(DataSource, on_delete=models.CASCADE, related_name='records')

    scope = models.IntegerField(choices=SCOPE_CHOICES)
    category = models.CharField(max_length=50, choices=CATEGORY_CHOICES)

    activity_date = models.DateField()
    period_start = models.DateField(null=True, blank=True)
    period_end = models.DateField(null=True, blank=True)

    quantity = models.DecimalField(max_digits=16, decimal_places=4)
    unit = models.CharField(max_length=30)
    emission_factor = models.DecimalField(max_digits=12, decimal_places=6, null=True, blank=True)
    co2e_kg = models.DecimalField(max_digits=16, decimal_places=4, null=True, blank=True)

    raw_quantity = models.CharField(max_length=100, blank=True)
    raw_unit = models.CharField(max_length=50, blank=True)
    raw_row_number = models.IntegerField(null=True, blank=True)
    raw_data = models.JSONField(default=dict, blank=True)

    facility = models.CharField(max_length=255, blank=True)
    description = models.CharField(max_length=500, blank=True)

    review_status = models.CharField(max_length=20, choices=REVIEW_CHOICES, default='pending')
    reviewed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True,
                                    related_name='reviewed_records')
    reviewed_at = models.DateTimeField(null=True, blank=True)
    review_notes = models.TextField(blank=True)
    is_locked = models.BooleanField(default=False)

    flags = models.JSONField(default=list, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ['-activity_date']
        indexes = [
            models.Index(fields=['tenant', 'scope']),
            models.Index(fields=['tenant', 'review_status']),
            models.Index(fields=['data_source']),
        ]

    def __str__(self):
        return f"{self.category} | {self.quantity} {self.unit} | {self.review_status}"


class AuditLog(models.Model):
    ACTION_CHOICES = [
        ('created', 'Created'),
        ('approved', 'Approved'),
        ('flagged', 'Flagged'),
        ('rejected', 'Rejected'),
        ('edited', 'Edited'),
        ('locked', 'Locked'),
    ]

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    record = models.ForeignKey(EmissionRecord, on_delete=models.CASCADE, related_name='audit_logs')
    action = models.CharField(max_length=20, choices=ACTION_CHOICES)
    performed_by = models.ForeignKey(User, on_delete=models.SET_NULL, null=True, blank=True)
    performed_at = models.DateTimeField(auto_now_add=True)
    details = models.JSONField(default=dict, blank=True)

    class Meta:
        ordering = ['-performed_at']
