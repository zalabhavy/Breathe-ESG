import React, { useState, useEffect } from 'react';
import { getSummary } from '../api';

const SCOPE_LABELS = { 1: 'Scope 1', 2: 'Scope 2', 3: 'Scope 3' };

export default function Dashboard({ tenant }) {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!tenant) return;
    setLoading(true);
    getSummary({ tenant })
      .then((res) => setData(res.data))
      .finally(() => setLoading(false));
  }, [tenant]);

  if (!tenant) return <div className="alert alert-info">Select a tenant to view dashboard.</div>;
  if (loading) return <div>Loading...</div>;
  if (!data) return <div>No data</div>;

  const statusMap = data.by_status || {};
  const formatCO2 = (val) => {
    if (!val) return '0';
    const n = parseFloat(val);
    if (n >= 1000) return `${(n / 1000).toFixed(1)}t`;
    return `${n.toFixed(0)}kg`;
  };

  return (
    <div>
      <h1>Dashboard</h1>
      <div className="stats-grid">
        <div className="stat-card">
          <div className="value">{data.total_records}</div>
          <div className="label">Total Records</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: 'var(--warning)' }}>{statusMap.pending || 0}</div>
          <div className="label">Pending Review</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: 'var(--success)' }}>{statusMap.approved || 0}</div>
          <div className="label">Approved</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: 'var(--danger)' }}>{statusMap.flagged || 0}</div>
          <div className="label">Flagged</div>
        </div>
        <div className="stat-card">
          <div className="value" style={{ color: 'var(--danger)' }}>{data.flagged_count || 0}</div>
          <div className="label">Auto-Flagged</div>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '0.75rem' }}>Emissions by Scope</h3>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Scope</th>
                <th>Records</th>
                <th>Total CO₂e</th>
              </tr>
            </thead>
            <tbody>
              {(data.by_scope || []).map((s) => (
                <tr key={s.scope}>
                  <td><span className={`badge badge-scope${s.scope}`}>{SCOPE_LABELS[s.scope]}</span></td>
                  <td>{s.count}</td>
                  <td>{formatCO2(s.total_co2e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      <div className="card">
        <h3 style={{ marginBottom: '0.75rem' }}>Emissions by Category</h3>
        <div className="table-wrapper">
          <table>
            <thead>
              <tr>
                <th>Category</th>
                <th>Records</th>
                <th>Total CO₂e</th>
              </tr>
            </thead>
            <tbody>
              {(data.by_category || []).map((c) => (
                <tr key={c.category}>
                  <td>{c.category.replace(/_/g, ' ')}</td>
                  <td>{c.count}</td>
                  <td>{formatCO2(c.total_co2e)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
