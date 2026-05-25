import React, { useState } from 'react';
import { uploadFile } from '../api';

const SOURCE_TYPES = [
  { value: 'sap_fuel', label: 'SAP — Fuel & Procurement', accept: '.csv,.txt,.tsv' },
  { value: 'utility', label: 'Utility — Electricity', accept: '.csv' },
  { value: 'travel', label: 'Corporate Travel', accept: '.csv' },
];

export default function Upload({ tenant }) {
  const [sourceType, setSourceType] = useState('sap_fuel');
  const [file, setFile] = useState(null);
  const [dragover, setDragover] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [result, setResult] = useState(null);
  const [error, setError] = useState(null);

  const handleUpload = async () => {
    if (!file || !tenant) return;
    setUploading(true);
    setError(null);
    setResult(null);

    const formData = new FormData();
    formData.append('file', file);
    formData.append('source_type', sourceType);
    formData.append('tenant_id', tenant);

    try {
      const res = await uploadFile(formData);
      setResult(res.data);
      setFile(null);
    } catch (err) {
      setError(err.response?.data?.error || 'Upload failed');
    } finally {
      setUploading(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    setDragover(false);
    if (e.dataTransfer.files.length) setFile(e.dataTransfer.files[0]);
  };

  if (!tenant) return <div className="alert alert-info">Select a tenant first.</div>;

  const sourceInfo = SOURCE_TYPES.find((s) => s.value === sourceType);

  return (
    <div>
      <h1>Upload Data</h1>

      <div className="card" style={{ maxWidth: '600px' }}>
        <div className="form-group">
          <label>Source Type</label>
          <select value={sourceType} onChange={(e) => setSourceType(e.target.value)}>
            {SOURCE_TYPES.map((s) => (
              <option key={s.value} value={s.value}>{s.label}</option>
            ))}
          </select>
        </div>

        <div
          className={`upload-zone ${dragover ? 'dragover' : ''}`}
          onDragOver={(e) => { e.preventDefault(); setDragover(true); }}
          onDragLeave={() => setDragover(false)}
          onDrop={handleDrop}
          onClick={() => document.getElementById('fileInput').click()}
        >
          {file ? (
            <div>
              <strong>{file.name}</strong>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                {(file.size / 1024).toFixed(1)} KB
              </div>
            </div>
          ) : (
            <div>
              <div style={{ fontSize: '2rem', marginBottom: '0.5rem' }}>📁</div>
              <div>Drop a file here or click to browse</div>
              <div style={{ color: 'var(--text-muted)', fontSize: '0.8rem' }}>
                Accepts: {sourceInfo?.accept}
              </div>
            </div>
          )}
        </div>
        <input
          id="fileInput"
          type="file"
          accept={sourceInfo?.accept}
          style={{ display: 'none' }}
          onChange={(e) => setFile(e.target.files[0])}
        />

        <button
          className="btn btn-primary"
          onClick={handleUpload}
          disabled={!file || uploading}
        >
          {uploading ? 'Processing...' : 'Upload & Process'}
        </button>
      </div>

      {error && <div className="alert alert-error">{error}</div>}

      {result && (
        <div className="alert alert-success">
          ✅ Processed <strong>{result.row_count}</strong> records from <strong>{result.file_name}</strong>
          {result.error_count > 0 && (
            <span> — <strong>{result.error_count}</strong> rows had errors</span>
          )}
        </div>
      )}

      <div className="card" style={{ maxWidth: '600px' }}>
        <h3 style={{ marginBottom: '0.5rem' }}>Expected File Formats</h3>
        <div style={{ fontSize: '0.825rem', color: 'var(--text-muted)' }}>
          <p><strong>SAP Fuel & Procurement:</strong> Semicolon-delimited flat file export from SAP MM (SE16/LSMW).
            Supports German (Werk, Menge, Mengeneinheit) and English column headers.
            Dates in DD.MM.YYYY or YYYYMMDD format.</p>
          <p style={{ marginTop: '0.5rem' }}><strong>Utility Electricity:</strong> CSV from utility portal with columns:
            Account Number, Meter ID, Read Date, Period Start, Period End, Consumption, Unit.</p>
          <p style={{ marginTop: '0.5rem' }}><strong>Corporate Travel:</strong> CSV export from Concur/Navan with:
            Booking Ref, Traveler, Travel Date, Category (Air/Hotel/Car/Rail),
            Origin, Destination, Distance.</p>
        </div>
      </div>
    </div>
  );
}
