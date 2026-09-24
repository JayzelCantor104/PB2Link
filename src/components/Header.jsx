import { useState, useEffect } from 'react';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
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
            <div className="user-dropdown" onClick={toggleDropdown}>
              <div className="user-avatar">
                {user.email?.charAt(0).toUpperCase()}
              </div>
              <span className="user-label">
                {user.email?.split('@')[0]}
              </span>
              <span className="dropdown-arrow">▼</span>
              <div
                className={`dropdown-menu ${dropdownOpen ? 'show' : ''}`}
                onClick={(e) => e.stopPropagation()}
              >
                <div className="dropdown-header">
                  <p>Signed in as</p>
                  <strong>{user.email}</strong>
                </div>
                <Link to="/profile" onClick={closeAll}>
                  👤 Edit Profile
                </Link>
                <Link to="/dashboard" onClick={closeAll}>
                  📂 My Dashboard
                </Link>
                <div className="dropdown-divider" />
                <a href="#logout" className="logout-link" onClick={handleLogout}>
                  🚪 Logout
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
          {user.email?.charAt(0).toUpperCase()}
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