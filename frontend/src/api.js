import axios from 'axios';

const API_BASE = import.meta.env.VITE_API_URL || '/api';

const api = axios.create({ baseURL: API_BASE });

export const getTenants = () => api.get('/tenants/');
export const getSources = (params) => api.get('/sources/', { params });
export const getRecords = (params) => api.get('/records/', { params });
export const getRecord = (id) => api.get(`/records/${id}/`);
export const getSummary = (params) => api.get('/records/summary/', { params });
export const getAuditLogs = (params) => api.get('/audit-logs/', { params });

export const uploadFile = (formData) =>
  api.post('/upload/', formData, {
    headers: { 'Content-Type': 'multipart/form-data' },
  });

export const bulkReview = (data) => api.post('/records/bulk_review/', data);

export default api;
