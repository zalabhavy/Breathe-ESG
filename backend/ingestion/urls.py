from django.urls import path, include
from rest_framework.routers import DefaultRouter
from . import views

router = DefaultRouter()
router.register(r'tenants', views.TenantViewSet)
router.register(r'sources', views.DataSourceViewSet, basename='datasource')
router.register(r'records', views.EmissionRecordViewSet, basename='emissionrecord')
router.register(r'audit-logs', views.AuditLogViewSet, basename='auditlog')

urlpatterns = [
    path('', include(router.urls)),
    path('upload/', views.upload_file, name='upload-file'),
]
