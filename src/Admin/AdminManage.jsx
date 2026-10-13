import React, { useState, useEffect } from 'react';
import './AdminManage.css';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';

// Make sure this points to your exact PHP backend folder
import { forceAdminReauth, isAuthFailure } from '../lib/apiClient';
import { AccessModal, PositionPermissionsCard } from './AdminAccess';

const API_BASE = '/api_backend';

const AdminManage = () => {
    const [admins, setAdmins] = useState([]);
    // Positions and permissions (migration 020): labels and defaults come with the list.
    const [accessMeta, setAccessMeta] = useState(null);
    const [accessAdmin, setAccessAdmin] = useState(null);
    const [search, setSearch] = useState('');
    const [filter, setFilter] = useState('all');
    // The open section is a per-viewer convenience; the page works without storage.
    const [tab, setTabState] = useState(() => {
        try { return localStorage.getItem('pb2_manage_admins_tab') || 'admins'; } catch { return 'admins'; }
    });
    const setTab = (key) => {
        setTabState(key);
        try { localStorage.setItem('pb2_manage_admins_tab', key); } catch { /* storage blocked */ }
    };
    const { toast, showToast, confirmToast, closeToast } = useToast();
    const [isLoading, setIsLoading] = useState(true); 
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        action: 'create', admin_id: '', username: '', fullname: '', email: '', mobile_num: '', role: 'Admin', password: ''
    });

    useEffect(() => {
        fetchAdmins();
    }, [search]);

    // Automatic account approval switch (system_settings.php, migration 017).
    const [autoApprove, setAutoApprove] = useState(null);
    const [savingAutoApprove, setSavingAutoApprove] = useState(false);
    useEffect(() => {
        fetch(`${API_BASE}/system_settings.php`, { credentials: 'include' })
            .then(res => res.json())
            .then(data => {
                if (data.success) {
                    setAutoApprove(!!data.settings.auto_approve_accounts);
                    if (Array.isArray(data.settings.issue_flag_tiers)) setFlagTiers(data.settings.issue_flag_tiers.map(String));
                    if (data.settings.hazard_alert_mode) setHazardMode(data.settings.hazard_alert_mode);
                    if (data.settings.advisory_sms_mode) setSmsMode(data.settings.advisory_sms_mode);
                }
            })
            .catch(() => {});
    }, []);

    // What happens when a live hazard feed detects something serious (migration 022).
    const [hazardMode, setHazardMode] = useState(null);
    const [savingHazardMode, setSavingHazardMode] = useState(false);
    const changeHazardMode = async (next) => {
        if (next === hazardMode) return;
        const ok = await confirmToast(
            {
                off: 'Stop recording detections?',
                draft: 'Send detections to staff for review?',
                auto: 'Publish advisories automatically?',
            }[next],
            {
                off: 'Residents still see the live PAGASA, PHIVOLCS and GDACS readings, but staff will not be prompted to issue an advisory.',
                draft: 'When a feed detects something serious, Disaster Risk and the Dashboard show a pre-filled advisory. Nothing is published until staff review it.',
                auto: 'When PAGASA raises a wind signal over Cavite, GDACS issues an Orange/Red storm alert for the Philippines, or a strong quake hits near Imus, an advisory is published on the public page at once, without review. Model rainfall still waits for staff. It is texted to residents only if Advisory SMS is Automatic.',
            }[next],
            { confirmLabel: next === 'auto' ? 'Turn On Auto-publish' : 'Save', danger: next === 'auto' }
        );
        if (!ok) return;
        setSavingHazardMode(true);
        try {
            const res = await fetch(`${API_BASE}/system_settings.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ hazard_alert_mode: next })
            });
            if (isAuthFailure(res.status)) { forceAdminReauth(); return; }
            const data = await res.json();
            if (data.success) {
                setHazardMode(data.settings.hazard_alert_mode);
                showToast('Setting Saved', data.message, 'success');
            } else {
                showToast('Not Saved', data.message || 'Unable to save the setting.', 'error');
            }
        } catch {
            showToast('Connection Error', 'Unable to reach the server.', 'error');
        } finally {
            setSavingHazardMode(false);
        }
    };

    // Whether advisories are texted to all residents automatically (migration 023).
    const [smsMode, setSmsMode] = useState(null);
    const [savingSmsMode, setSavingSmsMode] = useState(false);
    const changeSmsMode = async (next) => {
        if (next === smsMode) return;
        const ok = await confirmToast(
            next === 'auto' ? 'Text advisories automatically?' : 'Switch advisory SMS to manual?',
            next === 'auto'
                ? 'Every advisory that goes live (published by staff or by the hazard feed, raised to a higher level, or reactivated) is texted at once to ALL active residents with a mobile number. Each text uses SMS credits and cannot be recalled.'
                : 'Advisories will not be texted on their own. Staff send them from the SMS dispatcher, which can target all residents, an area, a sector or one number.',
            { confirmLabel: next === 'auto' ? 'Turn On Automatic SMS' : 'Switch to Manual', danger: next === 'auto' }
        );
        if (!ok) return;
        setSavingSmsMode(true);
        try {
            const res = await fetch(`${API_BASE}/system_settings.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ advisory_sms_mode: next })
            });
            if (isAuthFailure(res.status)) { forceAdminReauth(); return; }
            const data = await res.json();
            if (data.success) {
                setSmsMode(data.settings.advisory_sms_mode);
                showToast('Setting Saved', data.message, 'success');
            } else {
                showToast('Not Saved', data.message || 'Unable to save the setting.', 'error');
            }
        } catch {
            showToast('Connection Error', 'Unable to reach the server.', 'error');
        } finally {
            setSavingSmsMode(false);
        }
    };

    // Community Issue Map flag colours (migration 019): minimum reports for
    // orange, red and purple; 1 report is yellow.
    const [flagTiers, setFlagTiers] = useState(null);
    const [savingTiers, setSavingTiers] = useState(false);
    const saveFlagTiers = async () => {
        const nums = flagTiers.map(Number);
        if (nums.some(n => !Number.isInteger(n)) || nums[0] < 2 || nums[0] >= nums[1] || nums[1] >= nums[2]) {
            showToast('Check the numbers', 'Use whole numbers in increasing order, starting at 2 or more (e.g. 2, 5, 10).', 'error');
            return;
        }
        setSavingTiers(true);
        try {
            const res = await fetch(`${API_BASE}/system_settings.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ issue_flag_tiers: nums })
            });
            if (isAuthFailure(res.status)) { forceAdminReauth(); return; }
            const data = await res.json();
            if (data.success) {
                setFlagTiers(data.settings.issue_flag_tiers.map(String));
                showToast('Setting Saved', data.message, 'success');
            } else {
                showToast('Not Saved', data.message || 'Unable to save the setting.', 'error');
            }
        } catch {
            showToast('Connection Error', 'Unable to reach the server.', 'error');
        } finally {
            setSavingTiers(false);
        }
    };

    const toggleAutoApprove = async () => {
        const next = !autoApprove;
        const ok = await confirmToast(
            next ? 'Turn on automatic approval?' : 'Turn off automatic approval?',
            next
                ? 'New registrations that pass every check (email and SMS codes, ID scan, selfie, PhilSys, age 18+, no duplicate) will be approved at once. Anything flagged still comes to Pending Users.'
                : 'Every new registration will wait on Pending Users for a staff member to approve it.',
            { confirmLabel: next ? 'Turn On' : 'Turn Off' }
        );
        if (!ok) return;
        setSavingAutoApprove(true);
        try {
            const res = await fetch(`${API_BASE}/system_settings.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify({ auto_approve_accounts: next })
            });
            if (isAuthFailure(res.status)) { forceAdminReauth(); return; }
            const data = await res.json();
            if (data.success) {
                setAutoApprove(!!data.settings.auto_approve_accounts);
                showToast('Setting Saved', data.message, 'success');
            } else {
                showToast('Not Saved', data.message || 'Unable to save the setting.', 'error');
            }
        } catch {
            showToast('Connection Error', 'Unable to reach the server.', 'error');
        } finally {
            setSavingAutoApprove(false);
        }
    };

    const fetchAdmins = async () => {
        setIsLoading(true);
        try {
            const response = await fetch(`${API_BASE}/admin_manage.php?search=${search}`, {
                credentials: 'include'
            });
            if (isAuthFailure(response.status)) return forceAdminReauth();
            const result = await response.json();
            if (result.status === 'success') {
                setAdmins(result.data);
                if (result.positions) {
                    setAccessMeta({
                        positions: result.positions,
                        permission_labels: result.permission_labels || {},
                        position_permissions: result.position_permissions || {},
                    });
                }
            }
        } catch (error) {
            console.error("Error fetching admins:", error);
        } finally {
            setIsLoading(false);
        }
    };

    const handleAction = async (payload) => {
        try {
            const response = await fetch(`${API_BASE}/admin_manage.php`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                credentials: 'include',
                body: JSON.stringify(payload)
            });
            if (isAuthFailure(response.status)) return forceAdminReauth();
            const result = await response.json();
            
            const ok = result.status === 'success';
            showToast(ok ? 'Success' : 'Something went wrong', result.message, ok ? 'success' : 'error');
            if (ok) {
                setIsModalOpen(false);
                fetchAdmins();
            }
        } catch (error) {
            showToast('Server Error', 'Server error occurred. Please try again.', 'error');
        }
    };

    const handleSubmit = async (e) => {
        e.preventDefault();
        // Inviting sends a real invitation email at once.
        if (formData.action === 'create') {
            const ok = await confirmToast(
                'Send this admin invitation?',
                `An invitation to set up a ${formData.role === 'Super' ? 'Super Admin' : 'Standard Admin'} account will be emailed to ${formData.email}.`,
                { confirmLabel: 'Send Invitation' }
            );
            if (!ok) return;
        }
        handleAction(formData);
    };

    const deleteAdmin = async (id, username) => {
        const ok = await confirmToast(
            'Delete Administrator?',
            `"${username}" will be permanently removed and lose access to the admin portal.`,
            { confirmLabel: 'Delete', danger: true }
        );
        if (ok) handleAction({ action: 'delete', admin_id: id });
    };

    const resendInvite = async (id) => {
        const ok = await confirmToast('Resend Invitation?', 'A new invitation email will be sent to this user.', { confirmLabel: 'Resend' });
        if (ok) handleAction({ action: 'resend', admin_id: id });
    };

    const openModal = (admin = null) => {
        if (admin) {
            setFormData({
                action: 'update', admin_id: admin.admin_id, username: admin.username,
                fullname: admin.fullname, email: admin.email, mobile_num: admin.mobile_num || '', role: admin.role, password: ''
            });
        } else {
            setFormData({
                action: 'create', admin_id: '', username: '', fullname: '', email: '', mobile_num: '', role: 'Admin', password: ''
            });
        }
        setIsModalOpen(true);
    };

    const formatDate = (dateString) => {
        if (!dateString) return '-';
        return new Date(dateString).toLocaleDateString('en-US', { month: 'short', day: '2-digit', year: 'numeric' });
    };

    const formatDateTime = (dateString) => {
        if (!dateString) return 'Never';
        return new Date(dateString).toLocaleString('en-US', { 
            month: 'short', day: '2-digit', year: 'numeric', 
            hour: '2-digit', minute: '2-digit', hour12: false 
        }).replace(',', '');
    };

    const counts = {
        all: admins.length,
        active: admins.filter(a => a.status === 'active').length,
        pending: admins.filter(a => a.status !== 'active').length,
        super: admins.filter(a => a.role === 'Super').length,
        unverified: admins.filter(a => !a.email_verified_at || (a.mobile_num && !a.mobile_verified_at) || !a.mobile_num).length,
    };
    const FILTERS = [
        ['all', 'All'],
        ['active', 'Active'],
        ['pending', 'Pending invitation'],
        ['super', 'Super Admins'],
        ['unverified', 'Contact not verified'],
    ];
    const visibleAdmins = admins.filter(a => {
        if (filter === 'active') return a.status === 'active';
        if (filter === 'pending') return a.status !== 'active';
        if (filter === 'super') return a.role === 'Super';
        if (filter === 'unverified') return !a.email_verified_at || !a.mobile_num || !a.mobile_verified_at;
        return true;
    });
    const showFilter = (key) => { setFilter(key); setTab('admins'); };

    const TABS = [
        ['admins', 'bi-people-fill', 'Administrators', counts.all],
        ['access', 'bi-key-fill', 'Positions & Access', null],
        ['settings', 'bi-sliders', 'System Settings', null],
    ];

    return (
        <div className="admin-manage-wrapper">

            <Toast toast={toast} onClose={closeToast} />

            {/* Header */}
            <div className="admin-header-section">
                <div>
                    <h3 className="page-title">Manage Admins</h3>
                    <p className="page-subtitle">Staff accounts, what each one may do, and system-wide settings. Only Super Admins can open this page.</p>
                </div>
                <button className="btn-primary-elegant" onClick={() => openModal()}>
                    <i className="bi bi-person-plus-fill" aria-hidden="true" style={{ marginRight: '8px' }}></i>
                    Invite Admin
                </button>
            </div>

            {/* At a glance: each count opens the list filtered to it */}
            <div className="am-summary">
                {[
                    ['all', 'bi-people', 'Administrators', counts.all],
                    ['active', 'bi-check-circle', 'Active', counts.active],
                    ['pending', 'bi-envelope', 'Pending invitations', counts.pending],
                    ['super', 'bi-star', 'Super Admins', counts.super],
                    ['unverified', 'bi-exclamation-circle', 'Contact not verified', counts.unverified],
                ].map(([key, icon, label, n]) => (
                    <button key={key} type="button" className={`am-summary-item${key === 'unverified' && n > 0 ? ' is-warn' : ''}${tab === 'admins' && filter === key ? ' is-current' : ''}`} onClick={() => showFilter(key)}>
                        <i className={`bi ${icon}`} aria-hidden="true"></i>
                        <strong>{isLoading ? '–' : n}</strong>
                        <span>{label}</span>
                    </button>
                ))}
            </div>

            {/* Sections */}
            <div className="am-tabs" role="tablist" aria-label="Manage Admins sections">
                {TABS.map(([key, icon, label, badge]) => (
                    <button
                        key={key}
                        type="button"
                        role="tab"
                        id={`am-tab-${key}`}
                        aria-selected={tab === key}
                        aria-controls={`am-panel-${key}`}
                        className={`am-tab${tab === key ? ' is-active' : ''}`}
                        onClick={() => setTab(key)}
                    >
                        <i className={`bi ${icon}`} aria-hidden="true"></i>
                        <span>{label}</span>
                        {badge !== null && <em className="am-tab-badge">{badge}</em>}
                    </button>
                ))}
            </div>

            {accessAdmin && accessMeta && (
                <AccessModal
                    admin={accessAdmin}
                    meta={accessMeta}
                    onClose={() => setAccessAdmin(null)}
                    onSaved={() => { setAccessAdmin(null); fetchAdmins(); }}
                    notify={showToast}
                />
            )}

            {/* ---- Administrators ---- */}
            {tab === 'admins' && (
                <div role="tabpanel" id="am-panel-admins" aria-labelledby="am-tab-admins">
                    <div className="am-toolbar">
                        <div className="search-pill-container">
                            <i className="bi bi-search search-icon" aria-hidden="true"></i>
                            <input
                                type="text"
                                className="search-input"
                                placeholder="Search by name, username or email..."
                                value={search}
                                onChange={(e) => setSearch(e.target.value)}
                                aria-label="Search administrators"
                            />
                            {search && (
                                <button type="button" className="am-search-clear" onClick={() => setSearch('')} aria-label="Clear search">
                                    <i className="bi bi-x-circle-fill" aria-hidden="true"></i>
                                </button>
                            )}
                        </div>
                        <div className="am-filters" role="group" aria-label="Filter administrators">
                            {FILTERS.map(([key, label]) => (
                                <button key={key} type="button" className={`am-filter${filter === key ? ' is-active' : ''}`} aria-pressed={filter === key} onClick={() => setFilter(key)}>
                                    {label} <span>{counts[key]}</span>
                                </button>
                            ))}
                        </div>
                    </div>

                    <div className="am-list">
                        <div className="am-list-head" aria-hidden="true">
                            <span>Administrator</span>
                            <span>Role & access</span>
                            <span>Status</span>
                            <span className="text-right">Actions</span>
                        </div>
                        {isLoading ? (
                            <div className="empty-state"><div className="spinner"></div> Loading administrators...</div>
                        ) : visibleAdmins.length === 0 ? (
                            <div className="empty-state">
                                {search || filter !== 'all' ? 'No administrator matches this search or filter.' : 'No administrators yet. Use Invite Admin to add one.'}
                                {(search || filter !== 'all') && (
                                    <button type="button" className="am-link" onClick={() => { setSearch(''); setFilter('all'); }}>Show everyone</button>
                                )}
                            </div>
                        ) : visibleAdmins.map(admin => (
                            <div key={admin.admin_id} className="am-row">
                                <div className="user-profile-cell">
                                    <div className={`avatar-circle${admin.role === 'Super' ? ' is-super' : ''}`}>
                                        {(admin.fullname || admin.username).charAt(0).toUpperCase()}
                                    </div>
                                    <div className="user-details">
                                        <span className="user-username">{admin.fullname || admin.username}</span>
                                        <span className="user-fullname">@{admin.username}</span>
                                        <span className="am-contact">
                                            <i className="bi bi-envelope" aria-hidden="true"></i> {admin.email}
                                            <span className={`am-verify-tag ${admin.email_verified_at ? 'is-ok' : 'is-no'}`}>{admin.email_verified_at ? 'verified' : 'not verified'}</span>
                                        </span>
                                        <span className="am-contact">
                                            <i className="bi bi-phone" aria-hidden="true"></i> {admin.mobile_num || 'No mobile number'}
                                            {admin.mobile_num && <span className={`am-verify-tag ${admin.mobile_verified_at ? 'is-ok' : 'is-no'}`}>{admin.mobile_verified_at ? 'verified' : 'not verified'}</span>}
                                        </span>
                                    </div>
                                </div>

                                <div className="am-cell">
                                    <span className="am-cell-label">Role & access</span>
                                    {admin.role === 'Super' ? (
                                        <span className="modern-badge badge-super"><i className="bi bi-star-fill" aria-hidden="true"></i> Super Admin</span>
                                    ) : (
                                        <span className="modern-badge badge-admin">Standard Admin</span>
                                    )}
                                    <span className="am-position">{admin.position || 'No position set'}</span>
                                    {admin.role === 'Super' ? (
                                        <span className="am-perm-note">Has every permission</span>
                                    ) : (admin.permissions || []).length > 0 && accessMeta ? (
                                        <span className="am-perms">
                                            {admin.permissions.map(p => (
                                                <span key={p} className="am-perm-chip" title={accessMeta.permission_labels[p]}>
                                                    {p === 'payments.settings' ? 'Fees & QR' : p === 'payments.verify' ? 'Verify payments' : p}
                                                </span>
                                            ))}
                                        </span>
                                    ) : (
                                        <span className="am-perm-note">No extra permissions</span>
                                    )}
                                </div>

                                <div className="am-cell">
                                    <span className="am-cell-label">Status</span>
                                    {admin.status === 'active' ? (
                                        <span className="modern-badge badge-active">Active</span>
                                    ) : (
                                        <span className="modern-badge badge-pending">Invitation pending</span>
                                    )}
                                    <span className="am-meta">Last sign-in: {formatDateTime(admin.last_login)}</span>
                                    <span className="am-meta">Added {formatDate(admin.created_at)}</span>
                                </div>

                                <div className="am-actions">
                                    {admin.status !== 'active' && (
                                        <button type="button" className="am-action" onClick={() => resendInvite(admin.admin_id)}>
                                            <i className="bi bi-envelope-arrow-up" aria-hidden="true"></i> Resend invite
                                        </button>
                                    )}
                                    {accessMeta && (
                                        <button type="button" className="am-action" onClick={() => setAccessAdmin(admin)}>
                                            <i className="bi bi-key" aria-hidden="true"></i> Access
                                        </button>
                                    )}
                                    <button type="button" className="am-action" onClick={() => openModal(admin)}>
                                        <i className="bi bi-pencil" aria-hidden="true"></i> Edit
                                    </button>
                                    <button type="button" className="am-action is-danger" onClick={() => deleteAdmin(admin.admin_id, admin.username)} aria-label={`Delete ${admin.username}`} title="Delete administrator">
                                        <i className="bi bi-trash3" aria-hidden="true"></i>
                                    </button>
                                </div>
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* ---- Positions & access ---- */}
            {tab === 'access' && (
                <div role="tabpanel" id="am-panel-access" aria-labelledby="am-tab-access">
                    <p className="am-panel-intro">
                        <i className="bi bi-info-circle" aria-hidden="true"></i> Each admin can hold a barangay position. A position gives its default permissions below.
                        To give or remove a permission for just one person, open <strong>Administrators</strong> and use their <strong>Access</strong> button. Super Admins always have every permission.
                    </p>
                    {accessMeta ? (
                        <PositionPermissionsCard key={JSON.stringify(accessMeta.position_permissions)} meta={accessMeta} onSaved={fetchAdmins} notify={showToast} />
                    ) : (
                        <div className="empty-state"><div className="spinner"></div> Loading positions...</div>
                    )}
                </div>
            )}

            {/* ---- System settings, grouped by area ---- */}
            {tab === 'settings' && (
                <div role="tabpanel" id="am-panel-settings" aria-labelledby="am-tab-settings">
                    <p className="am-panel-intro">
                        <i className="bi bi-info-circle" aria-hidden="true"></i> These apply to the whole portal. Every change asks you to confirm and is saved in the Audit Log.
                    </p>

                    <section className="am-group">
                        <h4 className="am-group-title"><i className="bi bi-person-check" aria-hidden="true"></i> Resident accounts</h4>
                        {autoApprove !== null && (
                            <div className="am-setting-card">
                                <div>
                                    <h4>Automatic account approval: <span className={autoApprove ? 'am-on' : 'am-off'}>{autoApprove ? 'ON' : 'OFF'}</span></h4>
                                    <p>
                                        {autoApprove
                                            ? 'Registrations that pass every check (email and SMS codes, server-verified ID scan, selfie, PhilSys, age 18+, no duplicate) are approved at once. Flagged ones go to Pending Users with the reasons. Sector claims always wait for staff.'
                                            : 'Every new registration waits on Pending Users for a staff member to approve it.'}
                                    </p>
                                </div>
                                <button type="button" className={autoApprove ? 'am-setting-btn is-off' : 'am-setting-btn'} onClick={toggleAutoApprove} disabled={savingAutoApprove}>
                                    {savingAutoApprove ? 'Saving...' : autoApprove ? 'Turn Off' : 'Turn On'}
                                </button>
                            </div>
                        )}
                    </section>

                    <section className="am-group">
                        <h4 className="am-group-title"><i className="bi bi-shield-exclamation" aria-hidden="true"></i> Disaster alerts</h4>
                        {hazardMode && (
                            <div className="am-setting-card">
                                <div>
                                    <h4>Hazard feed alerts: <span className={hazardMode === 'auto' ? 'am-on' : hazardMode === 'off' ? 'am-off' : 'am-mid'}>{{ off: 'OFF', draft: 'DRAFT FOR STAFF', auto: 'AUTO-PUBLISH' }[hazardMode]}</span></h4>
                                    <p>What happens when PAGASA, GDACS or PHIVOLCS shows something serious for Pasong Buaya II.</p>
                                    <div className="am-mode-options" role="radiogroup" aria-label="Hazard feed alerts">
                                        {[
                                            ['off', 'Off', 'Show the live feeds only.'],
                                            ['draft', 'Draft for staff', 'Staff review a pre-filled advisory.'],
                                            ['auto', 'Auto-publish', 'Publish an advisory at once.'],
                                        ].map(([value, label, hint]) => (
                                            <label key={value} className={`am-mode-option${hazardMode === value ? ' is-selected' : ''}`}>
                                                <input type="radio" name="hazard_alert_mode" value={value} checked={hazardMode === value} disabled={savingHazardMode} onChange={() => changeHazardMode(value)} />
                                                <span><strong>{label}</strong><small>{hint}</small></span>
                                            </label>
                                        ))}
                                    </div>
                                </div>
                            </div>
                        )}
                        {smsMode && (
                            <div className="am-setting-card">
                                <div>
                                    <h4>Advisory SMS: <span className={smsMode === 'auto' ? 'am-on' : 'am-mid'}>{smsMode === 'auto' ? 'AUTOMATIC' : 'MANUAL'}</span></h4>
                                    <p>Whether a disaster advisory is texted to every active resident as soon as it goes live. Texts use SMS credits and are counted, but never blocked by the monthly limit.</p>
                                    <div className="am-mode-options is-two" role="radiogroup" aria-label="Advisory SMS">
                                        {[
                                            ['manual', 'Manual', 'Staff send texts from the SMS dispatcher: all residents, an area, a sector or one number.'],
                                            ['auto', 'Automatic', 'Text all residents when an advisory is published, raised to a higher level, or reactivated.'],
                                        ].map(([value, label, hint]) => (
                                            <label key={value} className={`am-mode-option${smsMode === value ? ' is-selected' : ''}`}>
                                                <input type="radio" name="advisory_sms_mode" value={value} checked={smsMode === value} disabled={savingSmsMode} onChange={() => changeSmsMode(value)} />
                                                <span><strong>{label}</strong><small>{hint}</small></span>
                                            </label>
                                        ))}
                                    </div>
                                    {hazardMode === 'auto' && smsMode === 'auto' && (
                                        <p className="am-warn-note"><i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> With both on, a serious feed reading publishes an advisory and texts every resident without staff review.</p>
                                    )}
                                </div>
                            </div>
                        )}
                    </section>

                    <section className="am-group">
                        <h4 className="am-group-title"><i className="bi bi-flag" aria-hidden="true"></i> Community Issue Map</h4>
                        {flagTiers && (
                            <div className="am-setting-card">
                                <div>
                                    <h4>Flag colours</h4>
                                    <p>A flag changes colour as more residents report the same problem. 1 report is yellow; set where orange, red and purple start.</p>
                                    <div className="am-tier-inputs">
                                        {[['orange', '#f97316'], ['red', '#dc2626'], ['purple', '#7c3aed']].map(([name, color], idx) => (
                                            <label key={name}>
                                                <span className="am-tier-swatch" style={{ background: color }}></span>
                                                {name[0].toUpperCase() + name.slice(1)} from
                                                <input
                                                    type="number"
                                                    min={idx === 0 ? 2 : 3}
                                                    max={1000}
                                                    inputMode="numeric"
                                                    value={flagTiers[idx]}
                                                    onChange={(e) => setFlagTiers(t => t.map((v, i) => (i === idx ? e.target.value : v)))}
                                                />
                                                reports
                                            </label>
                                        ))}
                                    </div>
                                </div>
                                <button type="button" className="am-setting-btn" onClick={saveFlagTiers} disabled={savingTiers}>
                                    {savingTiers ? 'Saving...' : 'Save Colours'}
                                </button>
                            </div>
                        )}
                    </section>
                </div>
            )}

            {/* Glassmorphism Modal */}
            {isModalOpen && (
                <div className="glass-modal-overlay">
                    <div className="glass-modal-content">
                        <div className="modal-header-custom">
                            <h5 className="modal-title-custom">
                                {formData.action === 'create' ? 'Invite New Administrator' : 'Edit Administrator Profile'}
                            </h5>
                            <button className="modal-close-btn" onClick={() => setIsModalOpen(false)}>
                                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><line x1="18" y1="6" x2="6" y2="18"></line><line x1="6" y1="6" x2="18" y2="18"></line></svg>
                            </button>
                        </div>
                        <div className="modal-body-custom">
                            <form onSubmit={handleSubmit}>
                                <div className="form-group">
                                    <label>Username</label>
                                    <input type="text" className="elegant-input keep-case" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} required />
                                </div>
                                <div className="form-group">
                                    <label>Full Name</label>
                                    <input type="text" className="elegant-input" value={formData.fullname} onChange={e => setFormData({...formData, fullname: e.target.value})} required />
                                </div>
                                <div className="form-group">
                                    <label>Email Address</label>
                                    <input type="email" className="elegant-input" value={formData.email} onChange={e => setFormData({...formData, email: e.target.value})} required />
                                </div>
                                <div className="form-group">
                                    <label>Mobile Number</label>
                                    <input type="text" inputMode="numeric" maxLength={11} placeholder="09XXXXXXXXX" className="elegant-input"
                                        value={formData.mobile_num}
                                        onChange={e => setFormData({...formData, mobile_num: e.target.value.replace(/\D/g, '')})}
                                        pattern="09[0-9]{9}" title="11 digits starting with 09" required={formData.action === 'create'} />
                                    <small>The admin confirms this number with an SMS code when activating the account. A changed email or number must be verified again.</small>
                                </div>
                                <div className="form-group">
                                    <label>System Role</label>
                                    <select className="elegant-input" value={formData.role} onChange={e => setFormData({...formData, role: e.target.value})}>
                                        <option value="Admin">Standard Admin</option>
                                        <option value="Super">Super Admin</option>
                                    </select>
                                </div>
                                
                                {formData.action === 'update' && (
                                    <div className="form-group">
                                        <label>Reset Password <span className="label-optional">(Optional)</span></label>
                                        <input type="password" className="elegant-input" placeholder="Leave blank to keep current password" value={formData.password} onChange={e => setFormData({...formData, password: e.target.value})} />
                                    </div>
                                )}

                                <div className="modal-footer-custom">
                                    <button type="button" className="btn-cancel-elegant" onClick={() => setIsModalOpen(false)}>Cancel</button>
                                    <button type="submit" className="btn-primary-elegant">
                                        {formData.action === 'create' ? 'Send Invitation' : 'Save Changes'}
                                    </button>
                                </div>
                            </form>
                        </div>
                    </div>
                </div>
            )}
        </div>
    );
};

export default AdminManage;