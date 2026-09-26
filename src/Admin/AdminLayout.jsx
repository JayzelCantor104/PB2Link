import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './admin_style.css';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();

  // 1. Extract active user and logout method safely from AuthContext
  const { user, adminUser, logout } = useAuth();
  const activeAdmin = adminUser || user;

  const cp = location.pathname;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  // Close off-canvas drawer on page navigation
  useEffect(() => {
    setMobileNavOpen(false);
  }, [cp]);

  // 2. Resolve display name and role safely across schema formats
  const currentAdminName = activeAdmin?.fullname || activeAdmin?.email?.split('@')[0] || "Admin";
  const userRole = activeAdmin?.role || activeAdmin?.actor_role || "Admin";

  const PAGE_TITLES = {
    'dashboard': 'Dashboard Overview',
    'pending-users': 'Pending Users',
    'profiling': 'Resident Profiling',
    'documents': 'Document Requests',
    'services': 'Services & Form Builder',
    'incidents': 'Incident Reports',
    'amenities': 'Amenities Management',
    'profiles': 'User Profile Updates',
    'announcements': 'Announcements',
    'waste-management': 'Waste Management & Pickup',
    'disaster-risk': 'Disaster Risk Management',
    'manage-admins': 'System Administrators',
    'audit-log': 'Admin Activity Audit Log'
  };

  const matchedKey = Object.keys(PAGE_TITLES).find(key => cp.includes(key));
  const currentHeaderTitle = matchedKey ? PAGE_TITLES[matchedKey] : 'Admin Panel';

  // Handle Logout cleanly
  const handleLogout = async () => {
    if (logout) {
      await logout();
    }
    navigate('/login', { replace: true });
  };

  return (
    <div className="admin-wrapper">
      {/* Backdrop behind off-canvas sidebar on mobile */}
      {mobileNavOpen && (
        <div className="admin-sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />
      )}

      {/* --- SIDEBAR --- */}
      <nav className={`admin-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="brand-section">
          <h4>
            <i className="fas fa-leaf" style={{ color: '#ffaa17', marginRight: '10px' }}></i>
            PB2 ADMIN
          </h4>
          <button
            className="admin-sidebar-close"
            onClick={() => setMobileNavOpen(false)}
            aria-label="Close menu"
          >
            <i className="fas fa-times"></i>
          </button>
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
            <i className="fas fa-file-contract"></i> Document Requests
          </Link>
          <Link to="/admin/services" className={`nav-link ${cp.includes('services') ? 'active' : ''}`}>
            <i className="fas fa-cogs"></i> Services Management
          </Link>
          <Link to="/admin/incidents" className={`nav-link ${cp.includes('incidents') ? 'active' : ''}`}>
            <i className="fas fa-exclamation-triangle"></i> Incident
          </Link>
          <Link to="/admin/amenities" className={`nav-link ${cp.includes('amenities') ? 'active' : ''}`}>
            <i className="fas fa-swimming-pool"></i> Amenities
          </Link>
          <Link to="/admin/profiles" className={`nav-link ${cp.includes('profiles') ? 'active' : ''}`}>
            <i className="fas fa-id-card"></i> User Profiles
          </Link>
          <Link to="/admin/announcements" className={`nav-link ${cp.includes('announcements') ? 'active' : ''}`}>
            <i className="fas fa-bullhorn"></i> Announcements
          </Link>
          <Link to="/admin/waste-management" className={`nav-link ${cp.includes('waste-management') ? 'active' : ''}`}>
            <i className="fas fa-recycle"></i> Waste Management
          </Link>
          <Link to="/admin/disaster-risk" className={`nav-link ${cp.includes('disaster-risk') ? 'active' : ''}`}>
            <i className="fas fa-shield-alt"></i> Disaster Risk
          </Link>

          {/* --- SUPERADMIN ONLY LINKS --- */}
          {userRole === 'Super' && (
            <Link to="/admin/manage-admins" className={`nav-link ${cp.includes('manage-admins') ? 'active' : ''}`}>
              <i className="fas fa-users-cog"></i> Manage Admins
            </Link>
          )}
          {userRole === 'Super' && (
            <Link to="/admin/audit-log" className={`nav-link ${cp.includes('audit-log') ? 'active' : ''}`}>
              <i className="fas fa-clipboard-list"></i> Audit Log
            </Link>
          )}
        </div>

        <div style={{ position: 'absolute', bottom: '20px', left: '0', width: '90%', padding: '0 20px' }}>
          <button onClick={handleLogout} className="btn-logout-custom">
            <i className="fas fa-sign-out-alt"></i> Logout
          </button>
        </div>
      </nav>

      {/* --- HIGH-END TOP HEADER --- */}
      <header className="top-header-premium">
        <button
          className="admin-menu-toggle"
          onClick={() => setMobileNavOpen(true)}
          aria-label="Open menu"
        >
          <i className="fas fa-bars"></i>
        </button>
        <div className="header-title-container">
          <span className="header-title-eyebrow">Barangay Pasong Buaya II</span>
          <h4 className="header-title-main">{currentHeaderTitle}</h4>
        </div>
        <div className="header-profile-premium">
          <div className="admin-meta-info">
            <span className="admin-display-name">{currentAdminName}</span>
            <span className="admin-display-email">{activeAdmin?.email || "system.session"}</span>
          </div>

          {/* Elegant Dynamic Role Badge */}
          {userRole === 'Super' ? (
            <span className="premium-role-badge badge-super-solid">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '4px' }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
              Super Admin
            </span>
          ) : (
            <span className="premium-role-badge badge-admin-outline">
              {userRole}
            </span>
          )}

          {/* Premium Initial Ring */}
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