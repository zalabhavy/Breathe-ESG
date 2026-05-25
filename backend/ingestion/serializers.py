from rest_framework import serializers
from .models import Tenant, DataSource, EmissionRecord, AuditLog


class TenantSerializer(serializers.ModelSerializer):
    class Meta:
        model = Tenant
        fields = '__all__'


class DataSourceSerializer(serializers.ModelSerializer):
    uploaded_by_name = serializers.CharField(source='uploaded_by.username', read_only=True, default='')

    class Meta:
        model = DataSource
        fields = '__all__'


class EmissionRecordSerializer(serializers.ModelSerializer):
    source_type = serializers.CharField(source='data_source.source_type', read_only=True)
    source_file = serializers.CharField(source='data_source.file_name', read_only=True)
    reviewed_by_name = serializers.CharField(source='reviewed_by.username', read_only=True, default='')

    class Meta:
        model = EmissionRecord
        fields = '__all__'


class AuditLogSerializer(serializers.ModelSerializer):
    performed_by_name = serializers.CharField(source='performed_by.username', read_only=True, default='')

    class Meta:
        model = AuditLog
        fields = '__all__'


class BulkReviewSerializer(serializers.Serializer):
    record_ids = serializers.ListField(child=serializers.UUIDField())
    action = serializers.ChoiceField(choices=['approved', 'flagged', 'rejected'])
    notes = serializers.CharField(required=False, default='')
