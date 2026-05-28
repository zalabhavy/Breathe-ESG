import React, { useState, useEffect, useCallback } from 'react';
import { getRecords, bulkReview, getAuditLogs } from '../api';

const SCOPE_LABELS = { 1: 'Scope 1', 2: 'Scope 2', 3: 'Scope 3' };

function formatActivityDate(value) {
  if (!value) return '-';
  const parsed = new Date(value);
  if (Number.isNaN(parsed.getTime())) return value;
  return parsed.toLocaleDateString(undefined, {
    year: 'numeric',
    month: 'short',
    day: '2-digit',
  });
}

export default function Records({ tenant }) {
  const [records, setRecords] = useState([]);
  const [loading, setLoading] = useState(false);
  const [scopeFilter, setScopeFilter] = useState('');
  const [statusFilter, setStatusFilter] = useState('');
  const [categoryFilter, setCategoryFilter] = useState('');
  const [selected, setSelected] = useState(new Set());
  const [expandedId, setExpandedId] = useState(null);
  const [auditLogs, setAuditLogs] = useState([]);
  const [page, setPage] = useState(1);
  const [totalCount, setTotalCount] = useState(0);
  const [message, setMessage] = useState(null);

  const fetchRecords = useCallback(function fetchFn() {
    if (!tenant) return;
    setLoading(true);
    var params = { tenant: tenant, page: page };
    if (scopeFilter) params.scope = scopeFilter;
    if (statusFilter) params.review_status = statusFilter;
    if (categoryFilter) params.category = categoryFilter;

    getRecords(params)
      .then(function(res) {
        var data = res.data;
        setRecords(data.results || data);
        setTotalCount(data.count || 0);
      })
      .finally(function() { setLoading(false); });
  }, [tenant, page, scopeFilter, statusFilter, categoryFilter]);

  useEffect(function() { fetchRecords(); }, [fetchRecords]);

  function handleBulkAction(actionName) {
    if (selected.size === 0) return;
    bulkReview({ record_ids: Array.from(selected), action: actionName })
      .then(function() {
        setMessage({ type: 'success', text: selected.size + ' records ' + actionName });
        setSelected(new Set());
        fetchRecords();
      })
      .catch(function() {
        setMessage({ type: 'error', text: 'Action failed' });
      });
  }

  function toggleExpand(id) {
    if (expandedId === id) { setExpandedId(null); return; }
    setExpandedId(id);
    getAuditLogs({ record: id })
      .then(function(res) { setAuditLogs(res.data.results || res.data); })
      .catch(function() { setAuditLogs([]); });
  }

  function toggleSelect(id) {
    var next = new Set(selected);
    if (next.has(id)) { next.delete(id); } else { next.add(id); }
    setSelected(next);
  }

  function toggleAll() {
    if (selected.size === records.length) {
      setSelected(new Set());
    } else {
      setSelected(new Set(records.filter(function(r) { return !r.is_locked; }).map(function(r) { return r.id; })));
    }
  }

  if (!tenant) return React.createElement('div', { className: 'alert alert-info' }, 'Select a tenant.');

  var totalPages = Math.ceil(totalCount / 50);

  return React.createElement('div', null,
    React.createElement('h1', null, 'Review Records'),

    message && React.createElement('div', { className: 'alert alert-' + message.type }, message.text),

    React.createElement('div', { className: 'filters' },
      React.createElement('div', null,
        React.createElement('label', { style: { fontSize: '0.75rem' } }, 'Scope'),
        React.createElement('select', {
          value: scopeFilter,
          onChange: function(e) { setScopeFilter(e.target.value); setPage(1); }
        },
          React.createElement('option', { value: '' }, 'All Scopes'),
          React.createElement('option', { value: '1' }, 'Scope 1'),
          React.createElement('option', { value: '2' }, 'Scope 2'),
          React.createElement('option', { value: '3' }, 'Scope 3')
        )
      ),
      React.createElement('div', null,
        React.createElement('label', { style: { fontSize: '0.75rem' } }, 'Status'),
        React.createElement('select', {
          value: statusFilter,
          onChange: function(e) { setStatusFilter(e.target.value); setPage(1); }
        },
          React.createElement('option', { value: '' }, 'All Statuses'),
          React.createElement('option', { value: 'pending' }, 'Pending'),
          React.createElement('option', { value: 'flagged' }, 'Flagged'),
          React.createElement('option', { value: 'approved' }, 'Approved'),
          React.createElement('option', { value: 'rejected' }, 'Rejected')
        )
      ),
      React.createElement('div', null,
        React.createElement('label', { style: { fontSize: '0.75rem' } }, 'Category'),
        React.createElement('select', {
          value: categoryFilter,
          onChange: function(e) { setCategoryFilter(e.target.value); setPage(1); }
        },
          React.createElement('option', { value: '' }, 'All Categories'),
          React.createElement('option', { value: 'stationary_combustion' }, 'Stationary Combustion'),
          React.createElement('option', { value: 'mobile_combustion' }, 'Mobile Combustion'),
          React.createElement('option', { value: 'purchased_electricity' }, 'Purchased Electricity'),
          React.createElement('option', { value: 'business_travel_air' }, 'Business Travel Air'),
          React.createElement('option', { value: 'business_travel_hotel' }, 'Business Travel Hotel'),
          React.createElement('option', { value: 'business_travel_ground' }, 'Business Travel Ground')
        )
      )
    ),

    selected.size > 0 && React.createElement('div', { className: 'toolbar' },
      React.createElement('span', { style: { fontSize: '0.85rem' } }, selected.size + ' selected'),
      React.createElement('div', { style: { display: 'flex', gap: '0.4rem' } },
        React.createElement('button', {
          className: 'btn btn-success btn-sm',
          onClick: function() { handleBulkAction('approved'); }
        }, 'Approve'),
        React.createElement('button', {
          className: 'btn btn-warning btn-sm',
          onClick: function() { handleBulkAction('flagged'); }
        }, 'Flag'),
        React.createElement('button', {
          className: 'btn btn-danger btn-sm',
          onClick: function() { handleBulkAction('rejected'); }
        }, 'Reject')
      )
    ),

    loading
      ? React.createElement('div', null, 'Loading...')
      : React.createElement(React.Fragment, null,
          // Desktop table
          React.createElement('div', { className: 'table-wrapper desktop-table' },
          React.createElement('table', null,
            React.createElement('thead', null,
              React.createElement('tr', null,
                React.createElement('th', null,
                  React.createElement('input', {
                    type: 'checkbox',
                    onChange: toggleAll,
                    checked: selected.size === records.length && records.length > 0
                  })
                ),
                React.createElement('th', null, 'Date'),
                React.createElement('th', null, 'Scope'),
                React.createElement('th', null, 'Category'),
                React.createElement('th', null, 'Quantity'),
                React.createElement('th', null, 'CO2e (kg)'),
                React.createElement('th', null, 'Facility'),
                React.createElement('th', null, 'Status'),
                React.createElement('th', null, 'Flags'),
                React.createElement('th', null, 'Source'),
                React.createElement('th', null, '')
              )
            ),
            React.createElement('tbody', null,
              records.map(function(r) {
                var isExpanded = expandedId === r.id;
                var rows = [
                  React.createElement('tr', { key: r.id },
                    React.createElement('td', null,
                      r.is_locked
                        ? React.createElement('span', { title: 'Locked' }, '\uD83D\uDD12')
                        : React.createElement('input', {
                            type: 'checkbox',
                            checked: selected.has(r.id),
                            onChange: function() { toggleSelect(r.id); }
                          })
                    ),
                    React.createElement('td', { className: 'cell-date' }, formatActivityDate(r.activity_date)),
                    React.createElement('td', null,
                      React.createElement('span', { className: 'badge badge-scope' + r.scope + ' scope-pill' },
                        SCOPE_LABELS[r.scope])
                    ),
                    React.createElement('td', { style: { fontSize: '0.8rem' } },
                      (r.category || '').replace(/_/g, ' ')),
                    React.createElement('td', null,
                      parseFloat(r.quantity).toLocaleString() + ' ' + r.unit),
                    React.createElement('td', null,
                      r.co2e_kg ? parseFloat(r.co2e_kg).toFixed(1) : '-'),
                    React.createElement('td', { style: { fontSize: '0.8rem' } }, r.facility),
                    React.createElement('td', null,
                      React.createElement('span', { className: 'badge badge-' + r.review_status },
                        r.review_status)
                    ),
                    React.createElement('td', null,
                      (r.flags || []).map(function(f, i) {
                        return React.createElement('span', { key: i, className: 'flag-chip' }, f);
                      })
                    ),
                    React.createElement('td', {
                      style: { fontSize: '0.75rem', color: 'var(--text-muted)' }
                    }, r.source_type),
                    React.createElement('td', null,
                      React.createElement('button', {
                        className: 'btn btn-outline btn-sm',
                        onClick: function() { toggleExpand(r.id); }
                      }, isExpanded ? 'Hide' : 'Details')
                    )
                  )
                ];

                if (isExpanded) {
                  rows.push(
                    React.createElement('tr', { key: r.id + '-detail' },
                      React.createElement('td', {
                        colSpan: 11,
                        style: { background: '#f8fafc', padding: '1rem' }
                      },
                        React.createElement('div', {
                          className: 'detail-grid',
                          style: { gap: '1rem' }
                        },
                          React.createElement('div', null,
                            React.createElement('h4', {
                              style: { marginBottom: '0.5rem', fontSize: '0.85rem' }
                            }, 'Record Details'),
                            React.createElement('table', { style: { fontSize: '0.8rem' } },
                              React.createElement('tbody', null,
                                React.createElement('tr', null,
                                  React.createElement('td', null,
                                    React.createElement('strong', null, 'Raw Qty:')),
                                  React.createElement('td', null, r.raw_quantity + ' ' + r.raw_unit)
                                ),
                                React.createElement('tr', null,
                                  React.createElement('td', null,
                                    React.createElement('strong', null, 'EF:')),
                                  React.createElement('td', null, r.emission_factor + ' kg CO2e/' + r.unit)
                                ),
                                React.createElement('tr', null,
                                  React.createElement('td', null,
                                    React.createElement('strong', null, 'Period:')),
                                  React.createElement('td', null,
                                    (r.period_start || '-') + ' to ' + (r.period_end || '-'))
                                ),
                                React.createElement('tr', null,
                                  React.createElement('td', null,
                                    React.createElement('strong', null, 'File:')),
                                  React.createElement('td', null, r.source_file)
                                ),
                                React.createElement('tr', null,
                                  React.createElement('td', null,
                                    React.createElement('strong', null, 'Row:')),
                                  React.createElement('td', null, r.raw_row_number)
                                ),
                                React.createElement('tr', null,
                                  React.createElement('td', null,
                                    React.createElement('strong', null, 'Desc:')),
                                  React.createElement('td', null, r.description)
                                )
                              )
                            ),
                            r.raw_data && Object.keys(r.raw_data).length > 0 &&
                              React.createElement('details', {
                                style: { marginTop: '0.5rem', fontSize: '0.75rem' }
                              },
                                React.createElement('summary', null, 'Raw source data'),
                                React.createElement('pre', {
                                  style: {
                                    background: '#f1f5f9', padding: '0.5rem',
                                    borderRadius: '4px', overflow: 'auto', marginTop: '0.25rem'
                                  }
                                }, JSON.stringify(r.raw_data, null, 2))
                              )
                          ),
                          React.createElement('div', null,
                            React.createElement('h4', {
                              style: { marginBottom: '0.5rem', fontSize: '0.85rem' }
                            }, 'Audit Trail'),
                            auditLogs.length === 0
                              ? React.createElement('div', {
                                  style: { color: 'var(--text-muted)', fontSize: '0.8rem' }
                                }, 'No audit entries')
                              : React.createElement('div', { style: { fontSize: '0.8rem' } },
                                  auditLogs.map(function(log) {
                                    return React.createElement('div', {
                                      key: log.id,
                                      style: {
                                        marginBottom: '0.4rem', paddingBottom: '0.4rem',
                                        borderBottom: '1px solid var(--border)'
                                      }
                                    },
                                      React.createElement('span', {
                                        className: 'badge badge-' + log.action
                                      }, log.action),
                                      ' ',
                                      React.createElement('span', {
                                        style: { color: 'var(--text-muted)' }
                                      }, new Date(log.performed_at).toLocaleString())
                                    );
                                  })
                                )
                          )
                        )
                      )
                    )
                  );
                }

                return rows;
              }).flat()
            )
          )
        ),

          // Mobile card view
          React.createElement('div', { className: 'mobile-cards' },
            records.map(function(r) {
              var isExpanded = expandedId === r.id;
              return React.createElement('div', { key: r.id, className: 'record-card' },
                React.createElement('div', { className: 'record-card-header' },
                  React.createElement('div', { style: { display: 'flex', alignItems: 'center', gap: '0.5rem' } },
                    r.is_locked
                      ? React.createElement('span', { title: 'Locked' }, '\uD83D\uDD12')
                      : React.createElement('input', {
                          type: 'checkbox',
                          checked: selected.has(r.id),
                          onChange: function() { toggleSelect(r.id); }
                        }),
                    React.createElement('span', { className: 'badge badge-scope' + r.scope + ' scope-pill' },
                      SCOPE_LABELS[r.scope]),
                    React.createElement('span', { className: 'badge badge-' + r.review_status }, r.review_status)
                  ),
                  React.createElement('span', { className: 'cell-date', style: { fontSize: '0.78rem', color: 'var(--text-muted)' } },
                    formatActivityDate(r.activity_date))
                ),
                React.createElement('div', { className: 'record-card-body' },
                  React.createElement('div', null,
                    React.createElement('div', { className: 'card-label' }, 'Category'),
                    React.createElement('div', null, (r.category || '').replace(/_/g, ' '))
                  ),
                  React.createElement('div', null,
                    React.createElement('div', { className: 'card-label' }, 'Quantity'),
                    React.createElement('div', null, parseFloat(r.quantity).toLocaleString() + ' ' + r.unit)
                  ),
                  React.createElement('div', null,
                    React.createElement('div', { className: 'card-label' }, 'CO₂e'),
                    React.createElement('div', null, r.co2e_kg ? parseFloat(r.co2e_kg).toFixed(1) + ' kg' : '-')
                  ),
                  React.createElement('div', null,
                    React.createElement('div', { className: 'card-label' }, 'Facility'),
                    React.createElement('div', null, r.facility || '-')
                  )
                ),
                (r.flags || []).length > 0 && React.createElement('div', { className: 'record-card-flags' },
                  r.flags.map(function(f, i) {
                    return React.createElement('span', { key: i, className: 'flag-chip' }, f);
                  })
                ),
                React.createElement('div', { className: 'record-card-footer' },
                  React.createElement('span', { style: { fontSize: '0.75rem', color: 'var(--text-muted)' } }, r.source_type),
                  React.createElement('button', {
                    className: 'btn btn-outline btn-sm',
                    onClick: function() { toggleExpand(r.id); }
                  }, isExpanded ? 'Hide' : 'Details')
                ),
                isExpanded && React.createElement('div', { className: 'record-card-detail' },
                  React.createElement('h4', null, 'Record Details'),
                  React.createElement('table', null,
                    React.createElement('tbody', null,
                      React.createElement('tr', null,
                        React.createElement('td', null, React.createElement('strong', null, 'Raw Qty:')),
                        React.createElement('td', null, r.raw_quantity + ' ' + r.raw_unit)
                      ),
                      React.createElement('tr', null,
                        React.createElement('td', null, React.createElement('strong', null, 'EF:')),
                        React.createElement('td', null, r.emission_factor + ' kg CO₂e/' + r.unit)
                      ),
                      React.createElement('tr', null,
                        React.createElement('td', null, React.createElement('strong', null, 'Period:')),
                        React.createElement('td', null, (r.period_start || '-') + ' to ' + (r.period_end || '-'))
                      ),
                      React.createElement('tr', null,
                        React.createElement('td', null, React.createElement('strong', null, 'File:')),
                        React.createElement('td', null, r.source_file)
                      ),
                      React.createElement('tr', null,
                        React.createElement('td', null, React.createElement('strong', null, 'Desc:')),
                        React.createElement('td', null, r.description)
                      )
                    )
                  ),
                  r.raw_data && Object.keys(r.raw_data).length > 0 &&
                    React.createElement('details', { style: { marginTop: '0.5rem', fontSize: '0.75rem' } },
                      React.createElement('summary', null, 'Raw source data'),
                      React.createElement('pre', {
                        style: { background: '#f1f5f9', padding: '0.5rem', borderRadius: '4px', overflow: 'auto', marginTop: '0.25rem', fontSize: '0.7rem' }
                      }, JSON.stringify(r.raw_data, null, 2))
                    ),
                  React.createElement('h4', { style: { marginTop: '0.75rem' } }, 'Audit Trail'),
                  auditLogs.length === 0
                    ? React.createElement('div', { style: { color: 'var(--text-muted)', fontSize: '0.8rem' } }, 'No audit entries')
                    : React.createElement('div', { style: { fontSize: '0.8rem' } },
                        auditLogs.map(function(log) {
                          return React.createElement('div', {
                            key: log.id,
                            style: { marginBottom: '0.4rem', paddingBottom: '0.4rem', borderBottom: '1px solid var(--border)' }
                          },
                            React.createElement('span', { className: 'badge badge-' + log.action }, log.action),
                            ' ',
                            React.createElement('span', { style: { color: 'var(--text-muted)' } },
                              new Date(log.performed_at).toLocaleString())
                          );
                        })
                      )
                )
              );
            })
          )
        ),

    totalPages > 1 && React.createElement('div', { className: 'pagination' },
      React.createElement('button', {
        className: 'btn btn-outline btn-sm',
        disabled: page <= 1,
        onClick: function() { setPage(function(p) { return p - 1; }); }
      }, 'Prev'),
      React.createElement('span', {
        style: { padding: '0.3rem 0.6rem', fontSize: '0.8rem' }
      }, 'Page ' + page + ' of ' + totalPages),
      React.createElement('button', {
        className: 'btn btn-outline btn-sm',
        disabled: page >= totalPages,
        onClick: function() { setPage(function(p) { return p + 1; }); }
      }, 'Next')
    )
  );
}
