import React, { useState, useEffect } from 'react';
import { getSources } from '../api';

var TYPE_LABELS = {
  sap_fuel: 'SAP Fuel and Procurement',
  utility: 'Utility Electricity',
  travel: 'Corporate Travel',
};

export default function Sources({ tenant }) {
  var _s = useState([]);
  var sources = _s[0], setSources = _s[1];
  var _l = useState(false);
  var loading = _l[0], setLoading = _l[1];

  useEffect(function() {
    if (!tenant) return;
    setLoading(true);
    getSources({ tenant: tenant })
      .then(function(res) { setSources(res.data.results || res.data); })
      .finally(function() { setLoading(false); });
  }, [tenant]);

  if (!tenant) return React.createElement('div', { className: 'alert alert-info' }, 'Select a tenant.');

  return React.createElement('div', null,
    React.createElement('h1', null, 'Data Sources'),
    loading
      ? React.createElement('div', null, 'Loading...')
      : React.createElement(React.Fragment, null,
          // Desktop table
          React.createElement('div', { className: 'table-wrapper desktop-table' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null, 'File'),
                React.createElement('th', null, 'Type'),
                React.createElement('th', null, 'Status'),
                React.createElement('th', null, 'Records'),
                React.createElement('th', null, 'Errors'),
                React.createElement('th', null, 'Uploaded')
              )
            ),
            React.createElement('tbody', null,
              sources.map(function(s) {
                return React.createElement('tr', { key: s.id },
                  React.createElement('td', null, s.file_name),
                  React.createElement('td', null, TYPE_LABELS[s.source_type] || s.source_type),
                  React.createElement('td', null,
                    React.createElement('span', {
                      className: 'badge badge-' + (s.status === 'processed' ? 'approved' : 'pending')
                    }, s.status)
                  ),
                  React.createElement('td', null, s.row_count),
                  React.createElement('td', {
                    style: { color: s.error_count > 0 ? 'var(--danger)' : undefined }
                  }, s.error_count),
                  React.createElement('td', null, new Date(s.uploaded_at).toLocaleString())
                );
              }),
              sources.length === 0 && React.createElement('tr', null,
                React.createElement('td', {
                  colSpan: 6,
                  style: { textAlign: 'center', color: 'var(--text-muted)' }
                }, 'No data sources yet. Upload a file to get started.')
              )
            )
          )
        ),

          // Mobile card view
          React.createElement('div', { className: 'mobile-cards' },
            sources.length === 0
              ? React.createElement('div', { className: 'card', style: { textAlign: 'center', color: 'var(--text-muted)' } },
                  'No data sources yet. Upload a file to get started.')
              : sources.map(function(s) {
                  return React.createElement('div', { key: s.id, className: 'source-card' },
                    React.createElement('div', { style: { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.5rem' } },
                      React.createElement('strong', { style: { fontSize: '0.85rem', wordBreak: 'break-all' } }, s.file_name),
                      React.createElement('span', {
                        className: 'badge badge-' + (s.status === 'processed' ? 'approved' : 'pending')
                      }, s.status)
                    ),
                    React.createElement('div', { className: 'record-card-body' },
                      React.createElement('div', null,
                        React.createElement('div', { className: 'card-label' }, 'Type'),
                        React.createElement('div', null, TYPE_LABELS[s.source_type] || s.source_type)
                      ),
                      React.createElement('div', null,
                        React.createElement('div', { className: 'card-label' }, 'Records'),
                        React.createElement('div', null, s.row_count)
                      ),
                      React.createElement('div', null,
                        React.createElement('div', { className: 'card-label' }, 'Errors'),
                        React.createElement('div', { style: { color: s.error_count > 0 ? 'var(--danger)' : undefined } }, s.error_count)
                      ),
                      React.createElement('div', null,
                        React.createElement('div', { className: 'card-label' }, 'Uploaded'),
                        React.createElement('div', null, new Date(s.uploaded_at).toLocaleString())
                      )
                    )
                  );
                })
          )
        )
  );
}
