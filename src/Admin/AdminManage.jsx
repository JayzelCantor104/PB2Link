import React, { useState, useEffect } from 'react';
import './AdminManage.css';

// Make sure this points to your exact PHP backend folder
import { forceAdminReauth, isAuthFailure } from '../lib/apiClient';

const API_BASE = '/api_backend';

const AdminManage = () => {
    const [admins, setAdmins] = useState([]);
    const [search, setSearch] = useState('');
    const [flash, setFlash] = useState(null);
    const [isLoading, setIsLoading] = useState(true); 
    
    const [isModalOpen, setIsModalOpen] = useState(false);
    const [formData, setFormData] = useState({
        action: 'create', admin_id: '', username: '', fullname: '', email: '', role: 'Admin', password: ''
    });

    useEffect(() => {
        fetchAdmins();
    }, [search]);

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
            
            setFlash({ type: result.status, message: result.message });
            if (result.status === 'success') {
                setIsModalOpen(false);
                fetchAdmins(); 
            }
            setTimeout(() => setFlash(null), 4000);
        } catch (error) {
            setFlash({ type: 'error', message: 'Server error occurred.' });
        }
    };

    const handleSubmit = (e) => {
        e.preventDefault();
        handleAction(formData);
    };

    const deleteAdmin = (id, username) => {
        if (window.confirm(`Are you sure you want to permanently delete the administrator "${username}"?`)) {
            handleAction({ action: 'delete', admin_id: id });
        }
    };

    const resendInvite = (id) => {
        if (window.confirm('Resend the invitation email to this user?')) {
            handleAction({ action: 'resend', admin_id: id });
        }
    };

    const openModal = (admin = null) => {
        if (admin) {
            setFormData({
                action: 'update', admin_id: admin.admin_id, username: admin.username,
                fullname: admin.fullname, email: admin.email, role: admin.role, password: ''
            });
        } else {
            setFormData({
                action: 'create', admin_id: '', username: '', fullname: '', email: '', role: 'Admin', password: ''
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

    return (
        <div className="admin-manage-wrapper">
            
            {flash && (
                <div className={`modern-alert alert-${flash.type}`}>
                    {flash.type === 'success' ? (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M22 11.08V12a10 10 0 1 1-5.93-9.14"></path><polyline points="22 4 12 14.01 9 11.01"></polyline></svg>
                    ) : (
                        <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"></circle><line x1="12" y1="8" x2="12" y2="12"></line><line x1="12" y1="16" x2="12.01" y2="16"></line></svg>
                    )}
                    <span>{flash.message}</span>
                </div>
            )}

            {/* Header Section */}
            <div className="admin-header-section">
                <div>
                    <h3 className="page-title">System Administrators</h3>
                    <p className="page-subtitle">Manage system access and invitations</p>
                </div>
                <button className="btn-primary-elegant" onClick={() => openModal()}>
                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" style={{marginRight: '8px'}}><path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2"></path><circle cx="8.5" cy="7" r="4"></circle><line x1="20" y1="8" x2="20" y2="14"></line><line x1="23" y1="11" x2="17" y2="11"></line></svg>
                    Invite Admin
                </button>
            </div>

            {/* Search Pill */}
            <div className="search-pill-container">
                <svg className="search-icon" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="11" cy="11" r="8"></circle><line x1="21" y1="21" x2="16.65" y2="16.65"></line></svg>
                <input 
                    type="text" 
                    className="search-input" 
                    placeholder="Search users by name or email..." 
                    value={search}
                    onChange={(e) => setSearch(e.target.value)}
                />
                <button className="btn-search-elegant">Search</button>
            </div>

            {/* Custom Card Table */}
            <div className="table-responsive-custom">
                <table className="elegant-table">
                    <thead>
                        <tr>
                            <th>USER DETAILS</th>
                            <th>ROLE</th>
                            <th>STATUS</th>
                            <th>LAST LOGIN</th>
                            <th>DATE ADDED</th>
                            <th className="text-right">ACTIONS</th>
                        </tr>
                    </thead>
                    <tbody>
                        {isLoading ? (
                            <tr>
                                <td colSpan="6" className="empty-state">
                                    <div className="spinner"></div> Loading administrators...
                                </td>
                            </tr>
                        ) : admins.length === 0 ? (
                            <tr>
                                <td colSpan="6" className="empty-state">
                                    No administrators found.
                                </td>
                            </tr>
                        ) : (
                            admins.map(admin => (
                                <tr key={admin.admin_id} className="table-row-card">
                                    <td>
                                        <div className="user-profile-cell">
                                            <div className="avatar-circle">
                                                {admin.username.charAt(0).toUpperCase()}
                                            </div>
                                            <div className="user-details">
                                                <span className="user-username">{admin.username}</span>
                                                <span className="user-fullname">{admin.fullname}</span>
                                                <span className="user-email">{admin.email}</span>
                                            </div>
                                        </div>
                                    </td>
                                    <td>
                                        {admin.role === 'Super' ? (
                                            <span className="modern-badge badge-super">
                                                <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
                                                Super Admin
                                            </span>
                                        ) : (
                                            <span className="modern-badge badge-admin">Standard Admin</span>
                                        )}
                                    </td>
                                    <td>
                                        {admin.status === 'active' ? (
                                            <span className="modern-badge badge-active">Active</span>
                                        ) : (
                                            <span className="modern-badge badge-pending">Pending</span>
                                        )}
                                    </td>
                                    <td className="data-cell">{formatDateTime(admin.last_login)}</td>
                                    <td className="data-cell">{formatDate(admin.created_at)}</td>
                                    <td className="actions-cell text-right">
                                        <div className="action-buttons-group">
                                            {admin.status !== 'active' && (
                                                <button className="btn-icon icon-mail" onClick={() => resendInvite(admin.admin_id)} title="Resend Invite">
                                                    <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M4 4h16c1.1 0 2 .9 2 2v12c0 1.1-.9 2-2 2H4c-1.1 0-2-.9-2-2V6c0-1.1.9-2 2-2z"></path><polyline points="22,6 12,13 2,6"></polyline></svg>
                                                </button>
                                            )}
                                            <button className="btn-icon icon-edit" onClick={() => openModal(admin)} title="Edit User">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7"></path><path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z"></path></svg>
                                            </button>
                                            <button className="btn-icon icon-delete" onClick={() => deleteAdmin(admin.admin_id, admin.username)} title="Delete User">
                                                <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polyline points="3 6 5 6 21 6"></polyline><path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2"></path><line x1="10" y1="11" x2="10" y2="17"></line><line x1="14" y1="11" x2="14" y2="17"></line></svg>
                                            </button>
                                        </div>
                                    </td>
                                </tr>
                            ))
                        )}
                    </tbody>
                </table>
            </div>

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
                                    <input type="text" className="elegant-input" value={formData.username} onChange={e => setFormData({...formData, username: e.target.value})} required />
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