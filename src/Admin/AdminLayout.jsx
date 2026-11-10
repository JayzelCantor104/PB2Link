import React, { useEffect, useState } from 'react';
import { Link, useLocation, useNavigate, Outlet } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AdminContactVerify from './AdminContactVerify';
import ProductTour from '../components/ProductTour';
import { AdminAccessContext, permissionsForPath } from '../lib/adminAccess';
import './admin_style.css';

const API_BASE = '/api_backend';

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

  // Admin fields show text as typed (website text, staff notes); see index.css.
  // On <body> so dialogs rendered there through portals follow it too.
  useEffect(() => {
    document.body.classList.add('pb2-admin');
    return () => document.body.classList.remove('pb2-admin');
  }, []);

  // Email + mobile verification status (admin_contact_verify.php, migration 015).
  const [contactStatus, setContactStatus] = useState(null);
  const [verifyOpen, setVerifyOpen] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/admin_contact_verify.php`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ action: 'status' })
    })
      .then(res => res.json())
      .then(data => { if (active && data.success && data.status) setContactStatus(data.status); })
      .catch(() => {});
    return () => { active = false; };
  }, []);
  const contactsUnverified = contactStatus && !(contactStatus.email_verified && contactStatus.mobile_verified);

  // Tab access (admin_access.php, admin_permissions.php): re-read on every
  // page change, so a change by the Super Admin applies at once. The server
  // checks every request itself; this only decides what the screens show.
  const [access, setAccess] = useState({ loaded: false, failed: false, role: adminUser?.role || null, permissions: [] });
  useEffect(() => {
    let active = true;
    fetch(`${API_BASE}/admin_access.php`, { credentials: 'include', cache: 'no-store' })
      .then(res => res.json())
      .then(data => {
        if (!active) return;
        if (data.success) setAccess({ loaded: true, failed: false, role: data.role, permissions: data.permissions || [] });
        else setAccess((a) => ({ ...a, loaded: a.loaded, failed: !a.loaded }));
      })
      .catch(() => { if (active) setAccess((a) => ({ ...a, failed: !a.loaded })); });
    return () => { active = false; };
  }, [cp]);
  const isSuper = access.role === 'Super';
  const can = (perm) => isSuper || access.permissions.includes(perm);
  const canAny = (list) => list.some(can);
  const pageNeeds = permissionsForPath(cp);
  const pageBlocked = access.loaded && pageNeeds && !canAny(pageNeeds);

  // Registrations waiting for staff, for the Residents link (admin_residents.php).
  const [pendingResidents, setPendingResidents] = useState(0);
  // Residents whose profile change (with its proof) waits on Profile Approvals.
  const [profileChanges, setProfileChanges] = useState(0);
  const canResidents = can('module.residents');
  useEffect(() => {
    if (!canResidents) return undefined;
    let active = true;
    fetch(`${API_BASE}/admin_residents.php?action=counts`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => { if (active && data.success) { setPendingResidents(data.counts?.Pending || 0); setProfileChanges(data.profile_changes || 0); } })
      .catch(() => {});
    return () => { active = false; };
  }, [cp, canResidents]);
  // Issue Map posts staff haven't looked at yet (new, held for a check, or hidden by residents' reports).
  const [issuesToCheck, setIssuesToCheck] = useState(0);
  const [issueTick, setIssueTick] = useState(0);
  // The Issue Map page fires this after staff open or act on a post.
  useEffect(() => {
    const bump = () => setIssueTick(t => t + 1);
    window.addEventListener('pb2-issue-counts', bump);
    return () => window.removeEventListener('pb2-issue-counts', bump);
  }, []);
  const canIssues = can('module.issues');
  useEffect(() => {
    if (!canIssues) return undefined;
    let active = true;
    fetch(`${API_BASE}/admin_issue_map.php?action=counts`, { credentials: 'include' })
      .then(res => res.json())
      .then(data => { if (active && data.success) setIssuesToCheck(data.counts?.issues || 0); })
      .catch(() => {});
    return () => { active = false; };
  }, [cp, canIssues, issueTick]);
  const requestLinks = ['module.documents', 'module.services', 'module.incidents', 'module.amenities', 'module.residents', 'module.waste'];

  const currentAdminName = adminUser?.fullname || adminUser?.username || "Admin";
  const PAGE_TITLES = {
    'dashboard': 'Dashboard Overview',
    'profiling': 'Residents',
    'address-list': 'Address List',
    'documents': 'Document Requests',
    'services': 'Services & Form Builder',
    'incidents': 'Incident Reports',
    'amenities': 'Amenities Management',
    'profiles': 'User Profile Updates',
    'announcements': 'Announcements',
    'waste-management': 'Waste Management & Pickup',
    'disaster-risk': 'Disaster Risk Management',
    'issue-map': 'Community Issue Map',
    'payments': 'Payments & Fees',
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

          {can('module.residents') && (
          <Link to="/admin/profiling" className={`nav-link ${cp.includes('profiling') ? 'active' : ''}`}>
            <i className="bi bi-people-fill"></i> Residents
            {pendingResidents > 0 && <span className="nav-count" title={`${pendingResidents} registration(s) to review`}>{pendingResidents}</span>}
          </Link>
          )}

          {can('module.address') && (
          <Link to="/admin/address-list" className={`nav-link ${cp.includes('address-list') ? 'active' : ''}`}>
            <i className="bi bi-signpost-split"></i> Address List
          </Link>
          )}

          {/* --- REQUESTS & SERVICES DROPDOWN (only the links this admin may open) --- */}
          {canAny(requestLinks) && (
          <div style={{ width: '100%' }}>
            <div 
              className={`nav-link ${
                cp.includes('documents') || cp.includes('services') || cp.includes('incidents') || cp.includes('amenities') || cp.includes('profiles') || cp.includes('waste-management') ? 'active' : ''
              }`}
              onClick={() => setRequestsDropdownOpen(!requestsDropdownOpen)}
              style={{ cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <span><i className="bi bi-folder2-open"></i> Requests & Services</span>
              {!requestsDropdownOpen && profileChanges > 0 && <span className="nav-count" title="Profile changes waiting under User Profiles">{profileChanges}</span>}
              <i className={`bi bi-chevron-${requestsDropdownOpen ? 'up' : 'down'}`} style={{ fontSize: '0.75rem', marginRight: '5px' }}></i>
            </div>

            {requestsDropdownOpen && (
              <div style={{ display: 'flex', flexDirection: 'column', background: 'rgba(0,0,0,0.15)', padding: '5px 0', margin: '5px 15px 5px 15px', borderRadius: '8px' }}>
                {can('module.documents') && (
                <Link to="/admin/documents" className={`nav-link ${cp.includes('documents') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-file-earmark-text" style={{ fontSize: '0.9rem' }}></i> Document Requests
                </Link>
                )}
                {can('module.services') && (
                <Link to="/admin/services" className={`nav-link ${cp.includes('services') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-gear-fill" style={{ fontSize: '0.9rem' }}></i> Services Management
                </Link>
                )}
                {can('module.incidents') && (
                <Link to="/admin/incidents" className={`nav-link ${cp.includes('incidents') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-exclamation-triangle-fill" style={{ fontSize: '0.9rem' }}></i> Incident
                </Link>
                )}
                {can('module.amenities') && (
                <Link to="/admin/amenities" className={`nav-link ${cp.includes('amenities') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-building" style={{ fontSize: '0.9rem' }}></i> Amenities
                </Link>
                )}
                {can('module.residents') && (
                <Link to="/admin/profiles" className={`nav-link ${cp.includes('profiles') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-person-badge-fill" style={{ fontSize: '0.9rem' }}></i> User Profiles
                  {profileChanges > 0 && <span className="nav-count" title={`${profileChanges} resident(s) waiting for a profile change review`}>{profileChanges}</span>}
                </Link>
                )}
                {can('module.waste') && (
                <Link to="/admin/waste-management" className={`nav-link ${cp.includes('waste-management') ? 'active' : ''}`} style={{ padding: '8px 15px', fontSize: '0.8rem', marginRight: '0' }}>
                  <i className="bi bi-recycle" style={{ fontSize: '0.9rem' }}></i> Waste Management
                </Link>
                )}
              </div>
            )}
          </div>
          )}

          {can('module.announcements') && (
          <Link to="/admin/announcements" className={`nav-link ${cp.includes('announcements') ? 'active' : ''}`}>
            <i className="bi bi-megaphone-fill"></i> Announcements
          </Link>
          )}

          {can('module.disaster') && (
          <Link to="/admin/disaster-risk" className={`nav-link ${cp.includes('disaster-risk') ? 'active' : ''}`}>
            <i className="bi bi-shield-shaded"></i> Disaster Risk
          </Link>
          )}

          {can('module.issues') && (
          <Link to="/admin/issue-map" className={`nav-link ${cp.includes('issue-map') ? 'active' : ''}`}>
            <i className="bi bi-flag-fill"></i> Issue Map
            {issuesToCheck > 0 && <span className="nav-count" title={`${issuesToCheck} issue(s) with posts to check`}>{issuesToCheck}</span>}
          </Link>
          )}

          {canAny(['payments.verify', 'payments.settings']) && (
            <Link to="/admin/payments" className={`nav-link ${cp.includes('payments') ? 'active' : ''}`}>
              <i className="bi bi-wallet2"></i> Payments
            </Link>
          )}

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
          <h1 className="header-title-main">{currentHeaderTitle}</h1>
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
        {contactsUnverified && (
          <div className="acv-banner" role="status">
            <i className="bi bi-shield-exclamation" aria-hidden="true"></i>
            <span>
              {!contactStatus.mobile
                ? 'Add and verify your mobile number so you can receive codes and reset your password by SMS.'
                : 'Please verify your email address and mobile number with one-time codes.'}
            </span>
            <button type="button" className="acv-btn is-primary" onClick={() => setVerifyOpen(true)}>Verify now</button>
          </div>
        )}
        <AdminAccessContext.Provider value={{ loaded: access.loaded, role: access.role, permissions: access.permissions }}>
          {!access.loaded ? (
            access.failed ? (
              <div className="admin-no-access" role="alert">
                <i className="bi bi-wifi-off" aria-hidden="true"></i>
                <h3>Couldn't check your access</h3>
                <p>The server couldn't be reached. Check the connection, then reload the page.</p>
                <button type="button" className="acv-btn is-primary" onClick={() => window.location.reload()}>Reload</button>
              </div>
            ) : (
              <div className="admin-no-access is-loading"><p>Loading…</p></div>
            )
          ) : pageBlocked ? (
            <div className="admin-no-access" role="alert">
              <i className="bi bi-shield-lock" aria-hidden="true"></i>
              <h3>You don't have access to this page</h3>
              <p>Ask the Super Admin if you need it for your work.</p>
              <Link to="/admin/dashboard" className="acv-btn is-primary">Go to the Dashboard</Link>
            </div>
          ) : (
            <Outlet />
          )}
        </AdminAccessContext.Provider>
      </main>
      {verifyOpen && contactStatus && (
        <AdminContactVerify status={contactStatus} onStatus={setContactStatus} onClose={() => setVerifyOpen(false)} />
      )}
      {/* Page tours and tip dots for staff (text in src/lib/adminTours.js); one saved state per admin. */}
      <ProductTour area="admin" key={adminUser?.admin_id || 'admin'} />
    </div>
  );
};

export default AdminLayout;