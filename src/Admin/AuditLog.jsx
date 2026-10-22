import React, { useState, useEffect, useCallback } from 'react';
import './AuditLog.css';

import { forceAdminReauth, isAuthFailure } from '../lib/apiClient';
import { downloadCsv } from '../lib/downloadCsv';

const API_BASE = '/api_backend';

// Areas of the system, by the first part of the event type. Mirrors
// PB2_AUDIT_MODULES in backend/api/get_audit_log.php.
const AUDIT_MODULES = [
    ['accounts', 'Admin accounts & sign-in', ['admin']],
    ['settings', 'System settings', ['settings']],
    ['residents', 'Residents & profile approvals', ['resident', 'profile_change']],
    ['address', 'Address list', ['address']],
    ['documents', 'Document requests', ['document_request']],
    ['services', 'Services', ['service']],
    ['payments', 'Payments', ['payment', 'payments']],
    ['incidents', 'Incident reports', ['incident_report']],
    ['amenities', 'Amenities', ['amenity', 'amenity_reservation']],
    ['announcements', 'Announcements & About page', ['announcement', 'about']],
    ['waste', 'Waste management', ['waste']],
    ['disaster', 'Disaster risk & SMS', ['disaster']],
    ['issues', 'Issue map', ['issue']],
];
const moduleOf = (eventType) => {
    const prefix = String(eventType || '').split('.')[0];
    return AUDIT_MODULES.find(([, , prefixes]) => prefixes.includes(prefix));
};

// Names for the common actions; anything else is spelled out from its key
// (e.g. "disaster.center.occupancy" -> "Center occupancy").
const EVENT_TYPE_LABELS = {
    'admin.login.success': 'Signed in',
    'admin.login.failure': 'Sign-in failed',
    'admin.logout': 'Signed out',
    'admin.access.denied': 'Access refused',
    'admin.account.create': 'Admin invited',
    'admin.account.update': 'Admin account edited',
    'admin.account.delete': 'Admin account deleted',
    'admin.account.access': 'Admin access changed',
    'admin.account.activate': 'Admin account activated',
    'admin.account.invite_resend': 'Invitation resent',
    'admin.account.reset_link': 'Password reset link sent',
    'admin.password.reset': 'Password changed by reset link',
    'admin.password.recovery_request': 'Password recovery requested',
    'admin.password.recovery_sms_verified': 'Recovery SMS code confirmed',
    'admin.contact.verify': 'Contact detail confirmed',
    'admin.audit.export': 'Audit log exported',
    'profile_change.approve': 'Profile change approved',
    'profile_change.reject': 'Profile change rejected',
    'document_request.status.update': 'Document request status',
    'incident_report.status.update': 'Incident status',
    'amenity_reservation.status.update': 'Booking status',
};
const humanize = (s) => s.replace(/_/g, ' ').replace(/^\w/, (ch) => ch.toUpperCase());
const eventLabel = (type) => {
    if (EVENT_TYPE_LABELS[type]) return EVENT_TYPE_LABELS[type];
    const parts = String(type || '').split('.');
    return humanize(parts.slice(1).join(' ') || parts[0] || '');
};

const TARGET_ENTITY_LABELS = {
    resident: 'Resident',
    admin: 'Admin account',
    document_request: 'Document request',
    incident_report: 'Incident report',
    amenity_reservation: 'Amenity booking',
    amenity: 'Amenity',
    announcement: 'Announcement',
    service: 'Service',
    payment: 'Payment',
    setting: 'Setting',
    community_issue: 'Issue',
    community_issue_report: 'Issue report',
    disaster_alert: 'Advisory',
    evacuation_center: 'Evacuation center',
    hazard_event: 'Detected hazard',
    resident_group: 'Residents (SMS)',
    waste_schedule: 'Collection schedule',
    waste_segregation: 'Segregation rule',
    barangay_official: 'Council member',
    site_content: 'About page',
    endpoint: 'Page / API',
    audit_log: 'Audit log',
    address_list: 'Address list',
};
const targetLabel = (t) => TARGET_ENTITY_LABELS[t] || humanize(String(t || ''));

const EMPTY_FILTERS = { admin_id: '', module: '', event_type: '', target_entity_type: '', outcome: '', q: '', date_from: '', date_to: '' };

const AuditLog = () => {
    const [logs, setLogs] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [eventTypes, setEventTypes] = useState([]);
    const [targetTypes, setTargetTypes] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedLogId, setExpandedLogId] = useState(null);

    const [filters, setFilters] = useState(EMPTY_FILTERS);
    const [searchText, setSearchText] = useState('');
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ page: 1, page_size: 25, total: 0, total_pages: 0 });
    const [exporting, setExporting] = useState(false);
    const [notice, setNotice] = useState(null);

    // The entries the current filters match, newest first (the export is logged too).
    const exportCsv = async () => {
        setExporting(true);
        setNotice(null);
        const params = new URLSearchParams({ export: 'csv' });
        Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });
        const r = await downloadCsv(`${API_BASE}/get_audit_log.php?${params.toString()}`, 'pb2-audit-log.csv');
        setExporting(false);
        if (r.ok) {
            const capped = r.count !== null && r.count >= 50000;
            setNotice({ ok: true, text: `Exported ${r.count ?? ''} entr${r.count === 1 ? 'y' : 'ies'} to ${r.name}.${capped ? ' Only the newest 50,000 are included: narrow the dates for older ones.' : ''}` });
            fetchLogs();
        } else {
            setNotice({ ok: false, text: r.message });
        }
    };

    useEffect(() => {
        const fetchAdmins = async () => {
            try {
                const response = await fetch(`${API_BASE}/admin_manage.php`, { credentials: 'include' });
                if (isAuthFailure(response.status)) return forceAdminReauth();
                const result = await response.json();
                if (result.status === 'success') setAdmins(result.data);
            } catch (err) {
                console.error('Error fetching admins for filter:', err);
            }
        };
        fetchAdmins();
    }, []);

    // Search waits until typing pauses.
    useEffect(() => {
        const t = setTimeout(() => {
            setFilters((prev) => (prev.q === searchText.trim() ? prev : { ...prev, q: searchText.trim() }));
            setPage(1);
        }, 350);
        return () => clearTimeout(t);
    }, [searchText]);

    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: String(page), page_size: '25' });
            Object.entries(filters).forEach(([k, v]) => { if (v) params.set(k, v); });

            const response = await fetch(`${API_BASE}/get_audit_log.php?${params.toString()}`, {
                credentials: 'include',
            });
            if (isAuthFailure(response.status)) return forceAdminReauth();
            const result = await response.json();
            if (result.success) {
                setLogs(result.data);
                setPagination(result.pagination);
                setEventTypes(result.event_types || []);
                setTargetTypes(result.target_types || []);
            } else {
                setError(result.message || 'Failed to load audit log.');
            }
        } catch {
            setError('Server error occurred while loading the audit log.');
        } finally {
            setIsLoading(false);
        }
    }, [page, filters]);

    useEffect(() => {
        fetchLogs();
    }, [fetchLogs]);

    const handleFilterChange = (field, value) => {
        setPage(1);
        setFilters((prev) => {
            const next = { ...prev, [field]: value };
            // An action from another area would match nothing.
            if (field === 'module' && next.event_type && value && moduleOf(next.event_type)?.[0] !== value) next.event_type = '';
            return next;
        });
    };

    const clearFilters = () => {
        setSearchText('');
        setPage(1);
        setFilters(EMPTY_FILTERS);
    };
    const hasFilters = Object.values(filters).some(Boolean) || searchText !== '';

    const formatDateTime = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString.replace(' ', 'T')).toLocaleString('en-US', {
            month: 'short', day: '2-digit', year: 'numeric',
            hour: '2-digit', minute: '2-digit', hour12: false,
        }).replace(',', '');
    };

    const toggleExpand = (logId) => {
        setExpandedLogId((prev) => (prev === logId ? null : logId));
    };

    const actionOptions = eventTypes.filter((e) => !filters.module || moduleOf(e.value)?.[0] === filters.module);

    return (
        <div className="audit-log-wrapper">
            <div className="audit-header-section">
                <div>
                    <h3 className="page-title">Admin Activity Audit Log</h3>
                    <p className="page-subtitle">Every change made by an administrator or by the system, sign-ins and refused access. Entries can't be edited or deleted. Visible to Super Admins only.</p>
                </div>
                <button
                    type="button"
                    className="audit-export-btn"
                    onClick={exportCsv}
                    disabled={exporting || pagination.total === 0}
                    title="Download the entries that match the filters as a CSV file. The export is recorded in this log."
                >
                    <i className="bi bi-download" aria-hidden="true"></i> {exporting ? 'Exporting…' : `Export CSV${pagination.total ? ` (${pagination.total})` : ''}`}
                </button>
            </div>
            {notice && (
                <div className={`audit-alert ${notice.ok ? 'audit-alert-ok' : 'audit-alert-error'}`} role="status">
                    {notice.text}
                    <button type="button" className="audit-alert-close" onClick={() => setNotice(null)} aria-label="Dismiss">×</button>
                </div>
            )}

            <div className="audit-filter-bar">
                <div className="filter-group audit-search">
                    <label htmlFor="audit-q">Search</label>
                    <input
                        id="audit-q"
                        type="text"
                        className="keep-case"
                        placeholder="Search name, tracking code, ID or text"
                        value={searchText}
                        onChange={(e) => setSearchText(e.target.value)}
                    />
                </div>
                <div className="filter-group">
                    <label htmlFor="audit-admin">Who</label>
                    <select id="audit-admin" value={filters.admin_id} onChange={(e) => handleFilterChange('admin_id', e.target.value)}>
                        <option value="">Everyone</option>
                        <option value="system">System (automatic)</option>
                        {admins.map((a) => (
                            <option key={a.admin_id} value={a.admin_id}>{a.username}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label htmlFor="audit-module">Area</label>
                    <select id="audit-module" value={filters.module} onChange={(e) => handleFilterChange('module', e.target.value)}>
                        <option value="">All areas</option>
                        {AUDIT_MODULES.map(([key, label]) => <option key={key} value={key}>{label}</option>)}
                    </select>
                </div>
                <div className="filter-group">
                    <label htmlFor="audit-action">Action</label>
                    <select id="audit-action" value={filters.event_type} onChange={(e) => handleFilterChange('event_type', e.target.value)}>
                        <option value="">All actions</option>
                        {actionOptions.map((e) => (
                            <option key={e.value} value={e.value}>{eventLabel(e.value)} ({e.count})</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label htmlFor="audit-target">Target</label>
                    <select id="audit-target" value={filters.target_entity_type} onChange={(e) => handleFilterChange('target_entity_type', e.target.value)}>
                        <option value="">All targets</option>
                        {targetTypes.map((t) => <option key={t} value={t}>{targetLabel(t)}</option>)}
                    </select>
                </div>
                <div className="filter-group">
                    <label htmlFor="audit-outcome">Outcome</label>
                    <select id="audit-outcome" value={filters.outcome} onChange={(e) => handleFilterChange('outcome', e.target.value)}>
                        <option value="">Any</option>
                        <option value="success">Success</option>
                        <option value="failure">Failed / refused</option>
                    </select>
                </div>
                <div className="filter-group">
                    <label htmlFor="audit-from">From</label>
                    <input id="audit-from" type="date" value={filters.date_from} onChange={(e) => handleFilterChange('date_from', e.target.value)} />
                </div>
                <div className="filter-group">
                    <label htmlFor="audit-to">To</label>
                    <input id="audit-to" type="date" value={filters.date_to} onChange={(e) => handleFilterChange('date_to', e.target.value)} />
                </div>
                {hasFilters && (
                    <div className="filter-group audit-clear">
                        <button type="button" className="btn-page" onClick={clearFilters}>Clear filters</button>
                    </div>
                )}
            </div>

            {error && <div className="audit-alert audit-alert-error">{error}</div>}

            <div className="table-responsive-custom">
                <table className="audit-table">
                    <thead>
                        <tr>
                            <th>TIMESTAMP</th>
                            <th>ACTOR</th>
                            <th>ACTION</th>
                            <th>WHAT HAPPENED</th>
                            <th>OUTCOME</th>
                            <th className="text-right">DETAILS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr><td colSpan="6" className="empty-state"><div className="spinner"></div> Loading audit log...</td></tr>
                        ) : logs.length === 0 ? (
                            <tr><td colSpan="6" className="empty-state">No matching activity found.</td></tr>
                        ) : (
                            logs.map((log) => {
                                const mod = moduleOf(log.event_type);
                                return (
                                <React.Fragment key={log.log_id}>
                                    <tr className="audit-row">
                                        <td className="data-cell">{formatDateTime(log.created_at)}</td>
                                        <td>
                                            <div className="actor-cell">
                                                <span className="actor-username">{log.actor_username}</span>
                                                {log.actor_admin_id === null ? (
                                                    <span className="modern-badge badge-system">System</span>
                                                ) : (
                                                    <span className={`modern-badge ${log.actor_role === 'Super' ? 'badge-super' : 'badge-admin'}`}>
                                                        {log.actor_role}
                                                    </span>
                                                )}
                                            </div>
                                        </td>
                                        <td className="data-cell">
                                            <span className="audit-action-name">{eventLabel(log.event_type)}</span>
                                            {mod && <span className="audit-module">{mod[1]}</span>}
                                        </td>
                                        <td className="audit-what">
                                            {log.description}
                                            {log.target_entity_type && (
                                                <span className="audit-target">
                                                    {targetLabel(log.target_entity_type)}{log.target_entity_id ? ` #${log.target_entity_id}` : ''}
                                                </span>
                                            )}
                                        </td>
                                        <td>
                                            <span className={`modern-badge ${log.outcome === 'success' ? 'badge-active' : 'badge-failure'}`}>
                                                {log.outcome}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            <button className="btn-details" onClick={() => toggleExpand(log.log_id)} aria-expanded={expandedLogId === log.log_id}>
                                                {expandedLogId === log.log_id ? 'Hide' : 'View'}
                                            </button>
                                        </td>
                                    </tr>
                                    {expandedLogId === log.log_id && (
                                        <tr className="audit-detail-row">
                                            <td colSpan="6">
                                                <div className="audit-detail-panel">
                                                    <p className="audit-detail-description">{log.description}</p>
                                                    {log.changed_fields && log.changed_fields.length > 0 ? (
                                                        <table className="audit-diff-table">
                                                            <thead>
                                                                <tr><th>Field</th><th>Old Value</th><th>New Value</th></tr>
                                                            </thead>
                                                            <tbody>
                                                                {log.changed_fields.map((cf, i) => (
                                                                    <tr key={i}>
                                                                        <td>{cf.field}</td>
                                                                        <td>{cf.old_value === null || cf.old_value === undefined ? <em>empty</em> : String(cf.old_value)}</td>
                                                                        <td>{cf.new_value === null || cf.new_value === undefined ? <em>empty</em> : String(cf.new_value)}</td>
                                                                    </tr>
                                                                ))}
                                                            </tbody>
                                                        </table>
                                                    ) : (
                                                        <p className="audit-detail-meta">No field changes recorded for this action.</p>
                                                    )}
                                                    <p className="audit-detail-meta">
                                                        Entry #{log.log_id} · {log.event_type} · IP: {log.ip_address || 'unknown'}
                                                        {log.user_agent ? ` · ${log.user_agent.slice(0, 120)}` : ''}
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                                );
                            })
                        )}
                    </tbody>
                </table>
            </div>

            {pagination.total_pages > 1 && (
                <div className="audit-pagination">
                    <button
                        className="btn-page"
                        disabled={page <= 1}
                        onClick={() => setPage((p) => Math.max(1, p - 1))}
                    >
                        Prev
                    </button>
                    <span className="page-indicator">
                        Page {pagination.page} of {pagination.total_pages} ({pagination.total} total)
                    </span>
                    <button
                        className="btn-page"
                        disabled={page >= pagination.total_pages}
                        onClick={() => setPage((p) => Math.min(pagination.total_pages, p + 1))}
                    >
                        Next
                    </button>
                </div>
            )}
        </div>
    );
};

export default AuditLog;
