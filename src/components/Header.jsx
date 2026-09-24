import { useState, useEffect, useRef } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProfilePhotoUrl, getInitial, getDisplayName } from '../lib/profilePhoto';
import '../styles/header.css';

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [dropdownOpen, setDropdownOpen] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const { user: authUser, logout } = useAuth();

  const isAccountAdmin =
    authUser &&
    (authUser.isAdmin === true ||
      authUser.isAdmin === 'true' ||
      Number(authUser.isAdmin) === 1);

  const user = authUser && !isAccountAdmin ? authUser : null;
  const location = useLocation();
  const navigate = useNavigate();
  const dropdownRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => {
      setIsScrolled(window.scrollY > 50);
    };
    window.addEventListener('scroll', handleScroll);
    return () => {
      window.removeEventListener('scroll', handleScroll);
    };
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setDropdownOpen(false);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // Close the account menu on an outside click or Esc.
  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const onPointer = (e) => {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false);
    };
    const onKey = (e) => { if (e.key === 'Escape') setDropdownOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [dropdownOpen]);

  const toggleDropdown = () => setDropdownOpen((prev) => !prev);
  const toggleMobile = () => setMobileOpen((prev) => !prev);

  const closeAll = () => {
    setDropdownOpen(false);
    setMobileOpen(false);
  };

  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    navigate('/');
    closeAll();
  };

  const getActiveClass = (path) => (location.pathname === path ? 'active' : '');

  return (
    <header
      id="main-header"
      className={`${isScrolled ? 'scrolled' : ''} ${mobileOpen ? 'mobile-menu-open' : ''}`}
    >
      <div className="header-container">
        {/* BRAND LOGO */}
        <Link to="/" className="brand-logo" onClick={closeAll}>
          <div className="logo-icon">
            <img
              src="/assets/img/PB2_logo.png"
              alt="Pasong Buaya 2 Logo"
              onError={(e) => {
                e.target.style.display = 'none';
                if (e.target.nextElementSibling) {
                  e.target.nextElementSibling.style.display = 'block';
                }
              }}
            />
            <div className="logo-fallback" style={{ display: 'none' }}>
              PB2
            </div>
          </div>
          <div className="brand-text">
            <span className="brand-main">Pasong Buaya II</span>
            <span className="brand-sub">Digital Barangay Portal</span>
          </div>
        </Link>

        {/* DESKTOP NAVIGATION */}
        <nav className="desktop-nav">
          <Link to="/" className={getActiveClass('/')} onClick={closeAll}>
            Home
          </Link>

          <div className="nav-dropdown">
            <button className="nav-dropdown-btn" type="button">
              Services <span className="nav-arrow">▼</span>
            </button>
            <div className="nav-dropdown-menu">
              <Link to="/services" onClick={closeAll}>
                All Services Catalog
              </Link>
              <Link to="/request/clearance" onClick={closeAll}>
                Barangay Clearance
              </Link>
              <Link to="/request/business" onClick={closeAll}>
                Business Clearance
              </Link>
              <Link to="/amenity-reservation" onClick={closeAll}>
                Facility Reservation
              </Link>
            </div>
          </div>

          <div className="nav-dropdown">
            <button className="nav-dropdown-btn" type="button">
              Community <span className="nav-arrow">▼</span>
            </button>
            <div className="nav-dropdown-menu">
              <Link to="/announcements" onClick={closeAll}>
                Announcements
              </Link>
              <Link to="/waste-management" onClick={closeAll}>
                Waste Schedule
              </Link>
              <Link to="/disaster-risk" onClick={closeAll}>
                Disaster Risk
              </Link>
            </div>
          </div>

          <div className="nav-dropdown">
            <button className="nav-dropdown-btn" type="button">
              Help & Reports <span className="nav-arrow">▼</span>
            </button>
            <div className="nav-dropdown-menu">
              <Link to="/incident-report" onClick={closeAll}>
                Report Incident
              </Link>
              <Link to={user ? '/dashboard' : '/login'} onClick={closeAll}>
                Track Request
              </Link>
            </div>
          </div>
        </nav>

        {/* HEADER ACTIONS */}
        <div className="header-actions">
          {user ? (
            <div ref={dropdownRef} className={`user-dropdown ${dropdownOpen ? 'is-open' : ''}`}>
              <button
                type="button"
                className="user-dropdown-trigger"
                onClick={toggleDropdown}
                aria-haspopup="menu"
                aria-expanded={dropdownOpen}
              >
                <div className="user-avatar">
                  {user.profile_picture ? (
                    <img src={getProfilePhotoUrl(user.profile_picture)} alt="" />
                  ) : (
                    getInitial(user)
                  )}
                </div>
                <span className="user-label">{getDisplayName(user)}</span>
                <i className="bi bi-chevron-down dropdown-arrow" aria-hidden="true"></i>
              </button>

              <div className={`dropdown-menu ${dropdownOpen ? 'show' : ''}`} role="menu">
                <div className="dropdown-header">
                  <div className="dropdown-avatar">
                    {user.profile_picture ? (
                      <img src={getProfilePhotoUrl(user.profile_picture)} alt="" />
                    ) : (
                      getInitial(user)
                    )}
                  </div>
                  <div className="dropdown-identity">
                    <strong>{getDisplayName(user)}</strong>
                    <small className="dropdown-email">{user.email}</small>
                    <span className="dropdown-badge">
                      <i className="bi bi-patch-check-fill" aria-hidden="true"></i> Verified Resident
                    </span>
                  </div>
                </div>

                <Link to="/profile" role="menuitem" onClick={closeAll}>
                  <i className="bi bi-person-gear" aria-hidden="true"></i> Edit Profile
                </Link>

                <div className="dropdown-divider" />
                <a href="#logout" role="menuitem" className="logout-link" onClick={handleLogout}>
                  <i className="bi bi-box-arrow-right" aria-hidden="true"></i> Logout
                </a>
              </div>
            </div>
          ) : (
            <>
              <Link to="/login" className="btn-text" onClick={closeAll}>
                Log In
              </Link>
              <Link to="/register" className="btn-primary" onClick={closeAll}>
                Get Started
              </Link>
            </>
          )}

          <button
            className={`mobile-toggle ${mobileOpen ? 'active' : ''}`}
            onClick={toggleMobile}
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* MOBILE DRAWER VIEW */}
<div className={`mobile-drawer ${mobileOpen ? 'open' : ''}`}>
  {/* Drawer Header Bar */}
  <div className="mobile-drawer-header">
    <div className="mobile-drawer-brand">
      <span className="brand-title">PB2Link</span>
    </div>
    <div className="mobile-drawer-actions">
      {user && (
        <span className="mobile-user-avatar">
          {user.profile_picture ? (
            <img src={getProfilePhotoUrl(user.profile_picture)} alt="" />
          ) : (
            getInitial(user)
          )}
        </span>
      )}
      <button className="mobile-drawer-close" onClick={closeAll} aria-label="Close menu">
        ✕
      </button>
    </div>
  </div>

  {/* Navigation Links */}
  <div className="mobile-drawer-links">
    <Link to="/" className={getActiveClass('/')} onClick={closeAll}>
      Home
    </Link>
    <Link to="/services" className={getActiveClass('/services')} onClick={closeAll}>
      Services Catalog
    </Link>
    <Link to="/announcements" className={getActiveClass('/announcements')} onClick={closeAll}>
      Announcements
    </Link>
    <Link to="/waste-management" className={getActiveClass('/waste-management')} onClick={closeAll}>
      Waste Schedule
    </Link>
    <Link to="/disaster-risk" className={getActiveClass('/disaster-risk')} onClick={closeAll}>
      Disaster Risk
    </Link>
    <Link to="/incident-report" className={getActiveClass('/incident-report')} onClick={closeAll}>
      Report Incident
    </Link>
    <Link to={user ? '/dashboard' : '/login'} className={getActiveClass(user ? '/dashboard' : '/login')} onClick={closeAll}>
      Track Request
    </Link>
  </div>

  {/* Bottom Account Action Buttons */}
<div className="mobile-drawer-footer">
  {user ? (
    <div className="mobile-logged-in-menu">
      <Link to="/profile" className={getActiveClass('/profile')} onClick={closeAll}>
        👤 My Profile
      </Link>
      <a href="#logout" className="mobile-logout-link" onClick={handleLogout}>
        🚪 Logout
      </a>
    </div>
  ) : (
    <div className="mobile-auth-buttons">
      <Link to="/login" className="mobile-btn-outline" onClick={closeAll}>
        Log In
      </Link>
      <Link to="/register" className="mobile-btn-primary" onClick={closeAll}>
        Register
      </Link>
    </div>
  )}
</div>
</div>

      <div
        className={`mobile-overlay ${mobileOpen ? 'show' : ''}`}
        onClick={closeAll}
        aria-hidden="true"
      />
    </header>
  );
};

export default Header;