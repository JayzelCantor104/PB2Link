import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import './admin_style.css';

const AdminLayout = () => {
  const location = useLocation();
  const navigate = useNavigate();
  const { adminUser, adminLogout } = useAuth();
  const cp = location.pathname;
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const [requestsDropdownOpen, setRequestsDropdownOpen] = useState(
    cp.includes('documents') || cp.includes('services') || cp.includes('incidents') || cp.includes('amenities') || cp.includes('profiles') || cp.includes('waste-management')
  );

  useEffect(() => {
    setMobileNavOpen(false);
  }, [cp]);

  const currentAdminName = adminUser?.fullname || adminUser?.username || "Admin";
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

  return (
    <div className="admin-wrapper" style={{ display: 'flex', width: '100vw', minHeight: '100vh' }}>
      <link rel="stylesheet" href="https://cdn.jsdelivr.net/npm/bootstrap-icons@1.11.3/font/bootstrap-icons.min.css" />
      {mobileNavOpen && <div className="admin-sidebar-backdrop" onClick={() => setMobileNavOpen(false)} />}

      {/* --- SIDEBAR --- */}
      <nav className={`admin-sidebar ${mobileNavOpen ? 'mobile-open' : ''}`}>
        <div className="brand-section">
          <h4>
            <i className="bi bi-tree-fill" style={{ color: '#ffaa17', marginRight: '10px' }}></i> PB2 ADMIN
          </h4>
          <button className="admin-sidebar-close" onClick={() => setMobileNavOpen(false)} aria-label="Close menu">
            <i className="bi bi-x-lg"></i>
          </button>
        </div>

        <div className="nav-links-container" style={{ marginTop: '15px', overflowY: 'auto', maxHeight: 'calc(100vh - 140px)', paddingBottom: '70px', width: '100%', boxSizing: 'border-box' }}>
          <Link to="/admin/dashboard" className={`nav-link ${cp.includes('dashboard') ? 'active' : ''}`}>
            <i className="bi bi-grid-fill"></i> Dashboard
          </Link>

          <Link to="/admin/pending-users" className={`nav-link ${cp.includes('pending-users') ? 'active' : ''}`}>
            <i className="bi bi-hourglass-split"></i> Pending Users
          </Link>

          <Link to="/admin/profiling" className={`nav-link ${cp.includes('profiling') ? 'active' : ''}`}>
            <i className="bi bi-people-fill"></i> Profiling
          </Link>

          {/* --- REQUESTS & SERVICES DROPDOWN --- */}
          <div style={{ width: '100%' }}>
            <div 
              className={`nav-link ${
                cp.includes('documents') || cp.includes('services') || cp.includes('incidents') || cp.includes('amenities') || cp.includes('profiles') || cp.includes('waste-management') ? 'active' : ''
              }`}
              onClick={() => setRequestsDropdownOpen(!requestsDropdownOpen)}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span><i className="bi bi-folder2-open"></i> Requests & Services</span>
              <i className={`bi bi-chevron-${requestsDropdownOpen ? 'up' : 'down'}`} style={{ fontSize: '0.75rem', marginRight: '5px' }}></i>
            </div>

            {requestsDropdownOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)', padding: '5px 0', margin: '5px 15px 5px 15px', borderRadius: '8px' }}>
                <Link to="/admin/documents" className={`nav-link ${cp.includes('documents') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-file-earmark-text" style={{ fontSize: '0.9rem' }}></i> Document Requests
                </Link>
                <Link to="/admin/services" className={`nav-link ${cp.includes('services') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-gear-fill" style={{ fontSize: '0.9rem' }}></i> Services Management
                </Link>
                <Link to="/admin/incidents" className={`nav-link ${cp.includes('incidents') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: '0.9rem' }}></i> Incident
                </Link>
                <Link to="/admin/amenities" className={`nav-link ${cp.includes('amenities') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-building" style={{ fontSize: '0.9rem' }}></i> Amenities
                </Link>
                <Link to="/admin/profiles" className={`nav-link ${cp.includes('profiles') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-person-badge-fill" style={{ fontSize: '0.9rem' }}></i> User Profiles
                </Link>
                <Link to="/admin/waste-management" className={`nav-link ${cp.includes('waste-management') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-recycle" style={{ fontSize: '0.9rem' }}></i> Waste Management
                </Link>
              </div>
            )}
          </div>

          <Link to="/admin/announcements" className={`nav-link ${cp.includes('announcements') ? 'active' : ''}`}>
            <i className="bi bi-megaphone-fill"></i> Announcements
          </Link>

          <Link to="/admin/disaster-risk" className={`nav-link ${cp.includes('disaster-risk') ? 'active' : ''}`}>
            <i className="bi bi-shield-shaded"></i> Disaster Risk
          </Link>

          {adminUser?.role === 'Super' && (
            <>
              <Link to="/admin/manage-admins" className={`nav-link ${cp.includes('manage-admins') ? 'active' : ''}`}>
                <i className="bi bi-person-gear"></i> Manage Admins
              </Link>
              <Link to="/admin/audit-log" className={`nav-link ${cp.includes('audit-log') ? 'active' : ''}`}>
                <i className="bi bi-journal-text"></i> Audit Log
              </Link>
            </>
          )}
        </div>

        <div style={{ position: 'absolute', bottom: '20px', left: '0', width: '100%', padding: '0 15px', boxSizing: 'border-box' }}>
          <button onClick={() => { adminLogout(); navigate('/admin/login'); }} className="btn-logout-custom">
            <i className="bi bi-box-arrow-right"></i> Logout
          </button>
        </div>
      </nav>

      {/* --- TOP HEADER --- */}
      <header className="top-header-premium">
        <button className="admin-menu-toggle" onClick={() => setMobileNavOpen(true)} aria-label="Open menu">
          <i className="bi bi-list"></i>
        </button>
        <div className="header-title-container">
          <span className="header-title-eyebrow">Barangay Pasong Buaya II</span>
          <h4 className="header-title-main">{currentHeaderTitle}</h4>
        </div>
        <div className="header-profile-premium">
          <div className="admin-meta-info">
            <span className="admin-display-name">{currentAdminName}</span>
            <span className="admin-display-email">{adminUser?.email || "system.session"}</span>
          </div>
          {adminUser?.role === 'Super' ? (
            <span className="premium-role-badge badge-super-solid">
              <svg width="12" height="12" viewBox="0 0 24 24" fill="currentColor" style={{ marginRight: '4px' }}>
                <polygon points="12 2 15.09 8.26 22 9.27 17 14.14 18.18 21.02 12 17.77 5.82 21.02 7 14.14 2 9.27 8.91 8.26 12 2"></polygon>
              </svg>
              Super Admin
            </span>
          ) : (
            <span className="premium-role-badge badge-admin-outline"> Admin </span>
          )}
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