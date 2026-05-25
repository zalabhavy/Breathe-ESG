from django.utils import timezone
from rest_framework import viewsets, status, filters
from rest_framework.decorators import action, api_view, permission_classes
from rest_framework.permissions import AllowAny
from rest_framework.response import Response
from django_filters.rest_framework import DjangoFilterBackend

from .models import Tenant, DataSource, EmissionRecord, AuditLog
from .serializers import (
    TenantSerializer, DataSourceSerializer, EmissionRecordSerializer,
    AuditLogSerializer, BulkReviewSerializer,
)
from .parsers import PARSERS


class TenantViewSet(viewsets.ModelViewSet):
    queryset = Tenant.objects.all()
    serializer_class = TenantSerializer
    permission_classes = [AllowAny]


class DataSourceViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = DataSourceSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['tenant', 'source_type', 'status']

    def get_queryset(self):
        return DataSource.objects.all()


class EmissionRecordViewSet(viewsets.ModelViewSet):
    serializer_class = EmissionRecordSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend, filters.SearchFilter, filters.OrderingFilter]
    filterset_fields = ['tenant', 'scope', 'category', 'review_status', 'data_source', 'is_locked']
    search_fields = ['description', 'facility']
    ordering_fields = ['activity_date', 'co2e_kg', 'created_at', 'quantity']

    def get_queryset(self):
        return EmissionRecord.objects.select_related('data_source', 'reviewed_by').all()

    @action(detail=False, methods=['post'])
    def bulk_review(self, request):
        """Approve, flag, or reject multiple records at once."""
        ser = BulkReviewSerializer(data=request.data)
        ser.is_valid(raise_exception=True)

        records = EmissionRecord.objects.filter(
            id__in=ser.validated_data['record_ids'],
            is_locked=False,
        )
        action_name = ser.validated_data['action']
        notes = ser.validated_data.get('notes', '')

        updated = []
        for record in records:
            record.review_status = action_name
            record.review_notes = notes
            record.reviewed_at = timezone.now()
            record.save()

            if action_name == 'approved':
                record.is_locked = True
                record.save()

            AuditLog.objects.create(
                record=record,
                action=action_name,
                details={'notes': notes},
            )
            updated.append(str(record.id))

        return Response({'updated': updated, 'count': len(updated)})

    @action(detail=False, methods=['get'])
    def summary(self, request):
        """Dashboard summary stats."""
        tenant_id = request.query_params.get('tenant')
        qs = EmissionRecord.objects.all()
        if tenant_id:
            qs = qs.filter(tenant_id=tenant_id)

        from django.db.models import Sum, Count, Q

        total = qs.count()
        by_status = dict(qs.values_list('review_status').annotate(c=Count('id')).values_list('review_status', 'c'))
        by_scope = list(qs.values('scope').annotate(
            count=Count('id'), total_co2e=Sum('co2e_kg')
        ).order_by('scope'))
        by_category = list(qs.values('category').annotate(
            count=Count('id'), total_co2e=Sum('co2e_kg')
        ).order_by('category'))
        flagged_count = qs.filter(~Q(flags=[])).count()

        return Response({
            'total_records': total,
            'by_status': by_status,
            'by_scope': by_scope,
            'by_category': by_category,
            'flagged_count': flagged_count,
        })


class AuditLogViewSet(viewsets.ReadOnlyModelViewSet):
    serializer_class = AuditLogSerializer
    permission_classes = [AllowAny]
    filter_backends = [DjangoFilterBackend]
    filterset_fields = ['record', 'action']

    def get_queryset(self):
        return AuditLog.objects.select_related('performed_by').all()


@api_view(['POST'])
@permission_classes([AllowAny])
def upload_file(request):
    """Upload and parse a file. Expects multipart form with 'file', 'source_type', and 'tenant_id'."""
    file_obj = request.FILES.get('file')
    source_type = request.data.get('source_type')
    tenant_id = request.data.get('tenant_id')

    if not file_obj or not source_type or not tenant_id:
        return Response(
            {'error': 'file, source_type, and tenant_id are required'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        tenant = Tenant.objects.get(id=tenant_id)
    except Tenant.DoesNotExist:
        return Response({'error': 'Tenant not found'}, status=status.HTTP_404_NOT_FOUND)

    parser_fn = PARSERS.get(source_type)
    if not parser_fn:
        return Response(
            {'error': f'Unknown source_type: {source_type}'},
            status=status.HTTP_400_BAD_REQUEST,
        )

    try:
        ds = parser_fn(file_obj, tenant, user=request.user if request.user.is_authenticated else None)
        return Response(DataSourceSerializer(ds).data, status=status.HTTP_201_CREATED)
    except Exception as e:
        return Response({'error': str(e)}, status=status.HTTP_500_INTERNAL_SERVER_ERROR)
