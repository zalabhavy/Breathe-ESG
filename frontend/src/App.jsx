import React, { useState, useEffect } from 'react';
import { Routes, Route, NavLink, useLocation } from 'react-router-dom';
import { getTenants } from './api';
import Dashboard from './pages/Dashboard';
import Upload from './pages/Upload';
import Records from './pages/Records';
import Sources from './pages/Sources';

export default function App() {
  const [tenants, setTenants] = useState([]);
  const [activeTenant, setActiveTenant] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [apiError, setApiError] = useState(null);
  const location = useLocation();

  useEffect(() => {
    getTenants().then((res) => {
      const raw = res.data;
      const list = Array.isArray(raw) ? raw : Array.isArray(raw?.results) ? raw.results : [];
      setTenants(list);
      if (list.length > 0) setActiveTenant(list[0].id);
      if (list.length === 0) setApiError('No tenants found. Run seed_demo on the backend.');
    }).catch((err) => {
      setTenants([]);
      setApiError('API error: ' + (err.message || 'Cannot reach backend'));
    });
  }, []);

  // Close menu on route change
  useEffect(() => { setMenuOpen(false); }, [location.pathname]);

  return (
    <div className="app">
      {/* Mobile overlay backdrop */}
      {menuOpen && <div className="sidebar-overlay" onClick={() => setMenuOpen(false)} />}

      <aside className={`sidebar ${menuOpen ? 'open' : ''}`}>
        <div className="sidebar-header">
          <div>
            <div className="brand">🌿 Breathe ESG</div>
            <div className="subtitle">Emissions Ingestion Platform</div>
          </div>
          <button className="menu-close" onClick={() => setMenuOpen(false)} aria-label="Close menu">✕</button>
        </div>
        <nav>
          <NavLink to="/" end>📊 Dashboard</NavLink>
          <NavLink to="/upload">📤 Upload Data</NavLink>
          <NavLink to="/records">📋 Review Records</NavLink>
          <NavLink to="/sources">📁 Data Sources</NavLink>
        </nav>
        {tenants.length > 1 && (
          <div style={{ padding: '1rem 1.25rem', marginTop: '1rem' }}>
            <label style={{ fontSize: '0.75rem', color: '#94a3b8' }}>Tenant</label>
            <select
              value={activeTenant || ''}
              onChange={(e) => setActiveTenant(e.target.value)}
              style={{ width: '100%', padding: '0.3rem', marginTop: '0.25rem', fontSize: '0.8rem' }}
            >
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>{t.name}</option>
              ))}
            </select>
          </div>
        )}
      </aside>

      <main className="main">
        <div className="mobile-header">
          <button className="hamburger" onClick={() => setMenuOpen(true)} aria-label="Open menu">
            <span /><span /><span />
          </button>
          <span className="mobile-brand">🌿 Breathe ESG</span>
        </div>
        {apiError && <div className="alert alert-error">{apiError}</div>}
        <Routes>
          <Route path="/" element={<Dashboard tenant={activeTenant} />} />
          <Route path="/upload" element={<Upload tenant={activeTenant} />} />
          <Route path="/records" element={<Records tenant={activeTenant} />} />
          <Route path="/sources" element={<Sources tenant={activeTenant} />} />
        </Routes>
      </main>
    </div>
  );
}
