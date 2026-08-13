import React, { useState, useEffect, useCallback } from 'react';
import './AuditLog.css';

import { forceAdminReauth, isAuthFailure } from '../lib/apiClient';

const API_BASE = '/api_backend';

const EVENT_TYPE_LABELS = {
    'admin.login.success': 'Admin Login (Success)',
    'admin.login.failure': 'Admin Login (Failed)',
    'admin.account.create': 'Admin Account Created',
    'admin.account.update': 'Admin Account Updated',
    'admin.account.delete': 'Admin Account Deleted',
    'resident.status.update': 'Resident Status Updated',
    'resident.profile.update': 'Resident Profile Updated',
    'profile_change.approve': 'Profile Change Approved',
    'profile_change.reject': 'Profile Change Rejected',
    'document_request.status.update': 'Document Request Updated',
    'incident_report.status.update': 'Incident Report Updated',
    'amenity_reservation.status.update': 'Amenity Reservation Updated',
};

const TARGET_ENTITY_LABELS = {
    resident: 'Resident',
    admin: 'Admin Account',
    document_request: 'Document Request',
    incident_report: 'Incident Report',
    amenity_reservation: 'Amenity Reservation',
};

const AuditLog = () => {
    const [logs, setLogs] = useState([]);
    const [admins, setAdmins] = useState([]);
    const [isLoading, setIsLoading] = useState(true);
    const [error, setError] = useState(null);
    const [expandedLogId, setExpandedLogId] = useState(null);

    const [filters, setFilters] = useState({
        admin_id: '', event_type: '', target_entity_type: '', date_from: '', date_to: '',
    });
    const [page, setPage] = useState(1);
    const [pagination, setPagination] = useState({ page: 1, page_size: 25, total: 0, total_pages: 0 });

    useEffect(() => {
        fetchAdmins();
    }, []);

    const fetchAdmins = async () => {
        try {
            const response = await fetch(`${API_BASE}/admin_manage.php`, { credentials: 'include' });
            if (isAuthFailure(response.status)) return forceAdminReauth();
            const result = await response.json();
            if (result.status === 'success') {
                setAdmins(result.data);
            }
        } catch (err) {
            console.error('Error fetching admins for filter:', err);
        }
    };

    const fetchLogs = useCallback(async () => {
        setIsLoading(true);
        setError(null);
        try {
            const params = new URLSearchParams({ page: String(page), page_size: '25' });
            if (filters.admin_id) params.set('admin_id', filters.admin_id);
            if (filters.event_type) params.set('event_type', filters.event_type);
            if (filters.target_entity_type) params.set('target_entity_type', filters.target_entity_type);
            if (filters.date_from) params.set('date_from', filters.date_from);
            if (filters.date_to) params.set('date_to', filters.date_to);

            const response = await fetch(`${API_BASE}/get_audit_log.php?${params.toString()}`, {
                credentials: 'include',
            });
            if (isAuthFailure(response.status)) return forceAdminReauth();
            const result = await response.json();
            if (result.success) {
                setLogs(result.data);
                setPagination(result.pagination);
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
        setFilters((prev) => ({ ...prev, [field]: value }));
    };

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

    return (
        <div className="audit-log-wrapper">
            <div className="audit-header-section">
                <div>
                    <h3 className="page-title">Admin Activity Audit Log</h3>
                    <p className="page-subtitle">Every action and change made by an administrator — visible to Super Admins only</p>
                </div>
            </div>

            <div className="audit-filter-bar">
                <div className="filter-group">
                    <label>Admin</label>
                    <select value={filters.admin_id} onChange={(e) => handleFilterChange('admin_id', e.target.value)}>
                        <option value="">All admins</option>
                        {admins.map((a) => (
                            <option key={a.admin_id} value={a.admin_id}>{a.username}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label>Action</label>
                    <select value={filters.event_type} onChange={(e) => handleFilterChange('event_type', e.target.value)}>
                        <option value="">All actions</option>
                        {Object.entries(EVENT_TYPE_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label>Target Type</label>
                    <select value={filters.target_entity_type} onChange={(e) => handleFilterChange('target_entity_type', e.target.value)}>
                        <option value="">All targets</option>
                        {Object.entries(TARGET_ENTITY_LABELS).map(([value, label]) => (
                            <option key={value} value={value}>{label}</option>
                        ))}
                    </select>
                </div>
                <div className="filter-group">
                    <label>From</label>
                    <input type="date" value={filters.date_from} onChange={(e) => handleFilterChange('date_from', e.target.value)} />
                </div>
                <div className="filter-group">
                    <label>To</label>
                    <input type="date" value={filters.date_to} onChange={(e) => handleFilterChange('date_to', e.target.value)} />
                </div>
            </div>

            {error && <div className="audit-alert audit-alert-error">{error}</div>}

            <div className="table-responsive-custom">
                <table className="audit-table">
                    <thead>
                        <tr>
                            <th>TIMESTAMP</th>
                            <th>ACTOR</th>
                            <th>ACTION</th>
                            <th>TARGET</th>
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
                            logs.map((log) => (
                                <React.Fragment key={log.log_id}>
                                    <tr className="audit-row">
                                        <td className="data-cell">{formatDateTime(log.created_at)}</td>
                                        <td>
                                            <div className="actor-cell">
                                                <span className="actor-username">{log.actor_username}</span>
                                                <span className={`modern-badge ${log.actor_role === 'Super' ? 'badge-super' : 'badge-admin'}`}>
                                                    {log.actor_role}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="data-cell">{EVENT_TYPE_LABELS[log.event_type] || log.event_type}</td>
                                        <td className="data-cell">
                                            {log.target_entity_type
                                                ? `${TARGET_ENTITY_LABELS[log.target_entity_type] || log.target_entity_type}${log.target_entity_id ? ` #${log.target_entity_id}` : ''}`
                                                : '-'}
                                        </td>
                                        <td>
                                            <span className={`modern-badge ${log.outcome === 'success' ? 'badge-active' : 'badge-failure'}`}>
                                                {log.outcome}
                                            </span>
                                        </td>
                                        <td className="text-right">
                                            {log.changed_fields && log.changed_fields.length > 0 ? (
                                                <button className="btn-details" onClick={() => toggleExpand(log.log_id)}>
                                                    {expandedLogId === log.log_id ? 'Hide' : 'View'}
                                                </button>
                                            ) : '-'}
                                        </td>
                                    </tr>
                                    {expandedLogId === log.log_id && log.changed_fields && (
                                        <tr className="audit-detail-row">
                                            <td colSpan="6">
                                                <div className="audit-detail-panel">
                                                    <p className="audit-detail-description">{log.description}</p>
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
                                                    <p className="audit-detail-meta">
                                                        IP: {log.ip_address || 'unknown'}
                                                    </p>
                                                </div>
                                            </td>
                                        </tr>
                                    )}
                                </React.Fragment>
                            ))
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
