import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useLocation, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { getProfilePhotoUrl, getInitial, getDisplayName } from '../lib/profilePhoto';
import '../styles/header.css';

// One list drives the desktop menus and the phone drawer, so they never drift.
const MENUS = [
  {
    key: 'services',
    label: 'Services',
    items: [
      { to: '/services', icon: 'bi-file-earmark-text', label: 'Request a Document', desc: 'Clearance, residency, ID, indigency and more' },
      { to: '/amenity-reservation', icon: 'bi-calendar-check', label: 'Book a Facility', desc: 'Covered court, hall and vehicles' },
      { to: '/incident-report', icon: 'bi-shield-exclamation', label: 'Report an Incident', desc: 'Sent straight to barangay staff' },
      { to: '/track-request', icon: 'bi-search', label: 'Track My Requests', desc: 'Status, payments and pick-up' },
    ],
  },
  {
    key: 'community',
    label: 'Community',
    items: [
      { to: '/announcements', icon: 'bi-megaphone', label: 'Announcements', desc: 'News and notices from the barangay' },
      { to: '/waste-management', icon: 'bi-trash3', label: 'Garbage Collection', desc: 'Schedules, routes and segregation' },
      { to: '/disaster-risk', icon: 'bi-shield-check', label: 'Disaster Preparedness', desc: 'Alerts, evacuation centers, hotlines' },
      { to: '/issue-map', icon: 'bi-geo-alt', label: 'Community Issue Map', desc: 'Report and follow local problems' },
    ],
  },
];

const Header = () => {
  const [isScrolled, setIsScrolled] = useState(false);
  const [openMenu, setOpenMenu] = useState(null); // 'services' | 'community' | 'account' | null
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
  const navRef = useRef(null);

  useEffect(() => {
    const handleScroll = () => setIsScrolled(window.scrollY > 10);
    handleScroll();
    window.addEventListener('scroll', handleScroll, { passive: true });
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  useEffect(() => {
    setMobileOpen(false);
    setOpenMenu(null);
  }, [location.pathname]);

  useEffect(() => {
    document.body.style.overflow = mobileOpen ? 'hidden' : '';
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileOpen]);

  // Close an open menu on an outside click or Esc.
  useEffect(() => {
    if (!openMenu && !mobileOpen) return undefined;
    const onPointer = (e) => {
      if (openMenu && navRef.current && !navRef.current.contains(e.target)) setOpenMenu(null);
    };
    const onKey = (e) => {
      if (e.key === 'Escape') {
        setOpenMenu(null);
        setMobileOpen(false);
      }
    };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [openMenu, mobileOpen]);

  const closeAll = () => {
    setOpenMenu(null);
    setMobileOpen(false);
  };

  const handleLogout = (e) => {
    e.preventDefault();
    logout();
    navigate('/');
    closeAll();
  };

  const isActive = (path) => location.pathname === path || (path !== '/' && location.pathname.startsWith(`${path}/`));
  const menuActive = (menu) => menu.items.some((i) => isActive(i.to)) || (menu.key === 'services' && location.pathname.startsWith('/request/'));

  const avatar = (cls) => (
    <span className={cls}>
      {user.profile_picture ? <img src={getProfilePhotoUrl(user.profile_picture)} alt="" /> : getInitial(user)}
    </span>
  );

  return (
    <header
      id="main-header"
      className={`pb2-header${isScrolled ? ' scrolled' : ''}${mobileOpen ? ' mobile-menu-open' : ''}`}
    >
      <div className="pb2-header-inner" ref={navRef}>
        {/* Brand */}
        <Link to="/" className="pb2-brand" onClick={closeAll} aria-label="Pasong Buaya II, home">
          <img
            src="/assets/img/PB2_logo.png"
            alt=""
            className="pb2-brand-logo"
            onError={(e) => { e.currentTarget.style.display = 'none'; }}
          />
          <span className="pb2-brand-text">
            <strong>Pasong Buaya II</strong>
            <small>Digital Barangay Portal</small>
          </span>
        </Link>

        {/* Desktop navigation */}
        <nav className="pb2-nav" aria-label="Main">
          <Link to="/" className={`pb2-nav-link${isActive('/') ? ' is-active' : ''}`} onClick={closeAll}>
            Home
          </Link>

          {MENUS.map((menu) => (
            <div
              key={menu.key}
              className={`pb2-nav-item${openMenu === menu.key ? ' is-open' : ''}`}
              onMouseEnter={() => setOpenMenu(menu.key)}
              onMouseLeave={() => setOpenMenu((m) => (m === menu.key ? null : m))}
            >
              <button
                type="button"
                className={`pb2-nav-link${menuActive(menu) ? ' is-active' : ''}`}
                aria-haspopup="true"
                aria-expanded={openMenu === menu.key}
                // Hover already opens it on desktop; a click (touch, keyboard) opens it too.
                // Outside click, Esc or moving away closes it.
                onClick={() => setOpenMenu(menu.key)}
              >
                {menu.label}
                <i className="bi bi-chevron-down pb2-chevron" aria-hidden="true"></i>
              </button>
              <div className="pb2-menu" role="menu">
                {menu.items.map((item) => (
                  <Link
                    key={item.to}
                    to={item.to}
                    role="menuitem"
                    className={`pb2-menu-item${isActive(item.to) ? ' is-active' : ''}`}
                    onClick={closeAll}
                  >
                    <i className={`bi ${item.icon}`} aria-hidden="true"></i>
                    <span>
                      <strong>{item.label}</strong>
                      <small>{item.desc}</small>
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          ))}

          <Link to="/about" className={`pb2-nav-link${isActive('/about') ? ' is-active' : ''}`} onClick={closeAll}>
            About
          </Link>
        </nav>

        {/* Account */}
        <div className="pb2-actions">
          {user ? (
            <div className={`pb2-nav-item pb2-account${openMenu === 'account' ? ' is-open' : ''}`}>
              <button
                type="button"
                className="pb2-account-btn"
                onClick={() => setOpenMenu((m) => (m === 'account' ? null : 'account'))}
                aria-haspopup="true"
                aria-expanded={openMenu === 'account'}
              >
                {avatar('pb2-avatar')}
                <span className="pb2-account-name">{getDisplayName(user)}</span>
                <i className="bi bi-chevron-down pb2-chevron" aria-hidden="true"></i>
              </button>
              <div className="pb2-menu pb2-menu-right" role="menu">
                <div className="pb2-account-card">
                  {avatar('pb2-avatar is-large')}
                  <span>
                    <strong>{getDisplayName(user)}</strong>
                    <small>{user.email}</small>
                    <em><i className="bi bi-patch-check-fill" aria-hidden="true"></i> Verified Resident</em>
                  </span>
                </div>
                <Link to="/track-request" role="menuitem" className="pb2-menu-item is-compact" onClick={closeAll}>
                  <i className="bi bi-search" aria-hidden="true"></i><span><strong>My Requests</strong></span>
                </Link>
                <Link to="/profile" role="menuitem" className="pb2-menu-item is-compact" onClick={closeAll}>
                  <i className="bi bi-person-gear" aria-hidden="true"></i><span><strong>Edit Profile</strong></span>
                </Link>
                <div className="pb2-menu-divider" />
                <a href="#logout" role="menuitem" className="pb2-menu-item is-compact is-danger" onClick={handleLogout}>
                  <i className="bi bi-box-arrow-right" aria-hidden="true"></i><span><strong>Log Out</strong></span>
                </a>
              </div>
            </div>
          ) : (
            <>
              <Link to="/login" className="pb2-btn-text" onClick={closeAll}>Log In</Link>
              <Link to="/register" className="pb2-btn-primary" onClick={closeAll}>Register</Link>
            </>
          )}

          <button
            className={`pb2-burger${mobileOpen ? ' is-open' : ''}`}
            onClick={() => setMobileOpen((o) => !o)}
            type="button"
            aria-label={mobileOpen ? 'Close navigation menu' : 'Open navigation menu'}
            aria-expanded={mobileOpen}
            aria-controls="pb2-drawer"
          >
            <span />
            <span />
            <span />
          </button>
        </div>
      </div>

      {/* Phone drawer: same sections as the desktop menus. Rendered on <body>:
          the header's backdrop-filter would otherwise trap position:fixed
          children inside the 72px header box. */}
      {createPortal(<>
      <aside id="pb2-drawer" className={`pb2-drawer${mobileOpen ? ' open' : ''}`} aria-hidden={!mobileOpen}>
        <div className="pb2-drawer-head">
          {user ? (
            <div className="pb2-drawer-user">
              {avatar('pb2-avatar')}
              <span>
                <strong>{getDisplayName(user)}</strong>
                <small>{user.email}</small>
              </span>
            </div>
          ) : (
            <strong className="pb2-drawer-title">Menu</strong>
          )}
          <button className="pb2-drawer-close" onClick={closeAll} type="button" aria-label="Close menu">
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>

        <nav className="pb2-drawer-body" aria-label="Main">
          <Link to="/" className={`pb2-drawer-link${isActive('/') ? ' is-active' : ''}`} onClick={closeAll}>
            <i className="bi bi-house" aria-hidden="true"></i> Home
          </Link>
          {MENUS.map((menu) => (
            <div key={menu.key} className="pb2-drawer-group">
              <span className="pb2-drawer-label">{menu.label}</span>
              {menu.items.map((item) => (
                <Link key={item.to} to={item.to} className={`pb2-drawer-link${isActive(item.to) ? ' is-active' : ''}`} onClick={closeAll}>
                  <i className={`bi ${item.icon}`} aria-hidden="true"></i> {item.label}
                </Link>
              ))}
            </div>
          ))}
          <div className="pb2-drawer-group">
            <span className="pb2-drawer-label">Barangay</span>
            <Link to="/about" className={`pb2-drawer-link${isActive('/about') ? ' is-active' : ''}`} onClick={closeAll}>
              <i className="bi bi-people" aria-hidden="true"></i> About & Council
            </Link>
          </div>
        </nav>

        <div className="pb2-drawer-foot">
          {user ? (
            <>
              <Link to="/profile" className="pb2-drawer-link" onClick={closeAll}>
                <i className="bi bi-person-gear" aria-hidden="true"></i> Edit Profile
              </Link>
              <a href="#logout" className="pb2-drawer-link is-danger" onClick={handleLogout}>
                <i className="bi bi-box-arrow-right" aria-hidden="true"></i> Log Out
              </a>
            </>
          ) : (
            <div className="pb2-drawer-auth">
              <Link to="/login" className="pb2-btn-outline" onClick={closeAll}>Log In</Link>
              <Link to="/register" className="pb2-btn-primary" onClick={closeAll}>Register</Link>
            </div>
          )}
        </div>
      </aside>

      <div className={`pb2-overlay${mobileOpen ? ' show' : ''}`} onClick={closeAll} aria-hidden="true" />
      </>, document.body)}
    </header>
  );
};

export default Header;
