import React from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './admin_style.css';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  
  // 1. Extract the active user metadata instance directly out of your AuthContext
  const { adminUser, adminLogout } = useAuth();
  const cp = location.pathname;

  // 2. Safely fall back to a generic title if the user instance or full name property is empty
  const currentAdminName = adminUser?.fullname || adminUser?.username || "Admin";


  const PAGE_TITLES = {
  'dashboard': 'Dashboard Overview',
  'profiling': 'Resident Profiling',
  'pending-users': 'Pending Users',
  'documents': 'Document Requests',
  'incidents': 'Incident Reports',
  'amenities': 'Amenities Management',
  'profiles': 'User Profile Updates',
  'manage-admins': 'System Administrators',
  'audit-log': 'Admin Activity Audit Log'
};

const matchedKey = Object.keys(PAGE_TITLES).find(key => cp.includes(key));
const currentHeaderTitle = matchedKey ? PAGE_TITLES[matchedKey] : 'Admin Panel';

  return (
    <div className="admin-wrapper">
      {/* --- SIDEBAR --- */}
      <nav className="admin-sidebar">
        <div className="brand-section">
          <h4>
            <i className="fas fa-leaf" style={{ color: '#ffaa17', marginRight: '10px' }}></i> PB2 ADMIN
          </h4>
        </div>

        <div className="nav-links-container" style={{ marginTop: '20px' }}>
          <Link to="/admin/dashboard" className={`nav-link ${cp.includes('dashboard') ? 'active' : ''}`}>
            <i className="fas fa-th-large"></i> Dashboard
          </Link>
          <Link to="/admin/pending-users" className={`nav-link ${cp.includes('pending-users') ? 'active' : ''}`}>
            <i className="fas fa-hourglass-half"></i> Pending Users
          </Link>
          <Link to="/admin/profiling" className={`nav-link ${cp.includes('profiling') ? 'active' : ''}`}>
            <i className="fas fa-users"></i> Profiling
          </Link>
          <Link to="/admin/documents" className={`nav-link ${cp.includes('documents') ? 'active' : ''}`}>
            <i className="fas fa-file-contract"></i> Documents
          </Link>
          <Link to="/admin/incidents" className={`nav-link ${cp.includes('incidents') ? 'active' : ''}`}>
            <i className="fas fa-exclamation-triangle"></i> Incident
          </Link>
          <Link to="/admin/amenities" className={`nav-link ${cp.includes('amenities') ? 'active' : ''}`}>
            <i className="fas fa-swimming-pool"></i> Amenities
          </Link>
          <Link to="/admin/profiles" className={`nav-link ${cp.includes('profiles') ? 'active' : ''}`}>
            <i className="fas fa-swimming-pool"></i> User Profiles
          </Link>

          {/* --- SUPERADMIN ONLY LINK --- */}
          {adminUser?.role === 'Super' && (
            <Link to="/admin/manage-admins" className={`nav-link ${cp.includes('manage-admins') ? 'active' : ''}`}>
              <i className="fas fa-users-cog"></i> Manage Admins
            </Link>
          )}
          {adminUser?.role === 'Super' && (
            <Link to="/admin/audit-log" className={`nav-link ${cp.includes('audit-log') ? 'active' : ''}`}>
              <i className="fas fa-clipboard-list"></i> Audit Log
            </Link>
          )}
        </div>

        <div style={{ position: 'absolute', bottom: '20px', left: '0', width: '90%', padding: '0 20px' }}>
          <button onClick={() => { adminLogout(); navigate('/admin/login'); }} className="btn-logout-custom">
            <i className="fas fa-sign-out-alt"></i> Logout
          </button>
        </div>
      </nav>

   {/* --- HIGH-END TOP HEADER --- */}
    <header className="top-header-premium">
  <div className="header-title-container">
    <span className="header-title-eyebrow">Barangay Pasong Buaya II</span>
    <h4 className="header-title-main">
      {cp.includes('dashboard') ? "Dashboard Overview" : 
       cp.includes('profiling') ? "Resident Profiling" : 
       cp.includes('pending-users') ? "Pending Users" : 
       cp.includes('documents') ? "Document Requests" : 
       cp.includes('incidents') ? "Incident Reports" : 
       cp.includes('amenities') ? "Amenities Management" : 
       cp.includes('profiles') ? "User Profile Updates" : 
       cp.includes('manage-admins') ? "System Administrators" :
       cp.includes('audit-log') ? "Admin Activity Audit Log" : "Admin Panel"}
    </h4>
  </div>

  <div className="header-profile-premium">
    <div className="admin-meta-info">
      <span className="admin-display-name">{currentAdminName}</span>
      <span className="admin-display-email">{adminUser?.email || "system.session"}</span>
    </div>

    {/* Elegant Dynamic Role Badge */}
    {adminUser?.role === 'Super' ? (
      <span className="premium-role-badge badge-super-solid">
        <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '4px' }}><polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon></svg>
        Super Admin
      </span>
    ) : (
      <span className="premium-role-badge badge-admin-outline">
        Admin
      </span>
    )}

    {/* Premium Initial Ring (Replaces the generic shield icon) */}
    <div className="premium-initial-ring">
      {currentAdminName.charAt(0).toUpperCase()}
    </div>
  </div>
</header>


      {/* --- MAIN CONTENT --- */}
      <main className="main-content">
        <Outlet />
      </main>
    </div>
  );
};

export default AdminLayout;