import { useState, useEffect, useRef } from 'react'; 
import { useLocation, useNavigate, Link } from 'react-router-dom'; // 1. Added Link here
import { useAuth } from '../context/AuthContext';
import { getProfilePhotoUrl, getInitial, getDisplayName } from '../lib/profilePhoto';

const Header = () => { 
  const [isScrolled, setIsScrolled] = useState(false); 
  const [dropdownOpen, setDropdownOpen] = useState(false); 
  const [mobileOpen, setMobileOpen] = useState(false); 
  
  const { user: authUser, logout } = useAuth(); 
  
  // Check if the logged-in session is an administrator
  const isAccountAdmin = authUser && (authUser.isAdmin === true || authUser.isAdmin === 'true' || Number(authUser.isAdmin) === 1); 
  
  // MASKING RULE: If they are an admin, treat them as logged out (null) on public citizen pages
  const user = authUser && !isAccountAdmin ? authUser : null; 

  const location = useLocation(); 
  const dropdownRef = useRef(null);
  const navigate = useNavigate(); 

  // Scroll effect 
  useEffect(() => { 
    const handleScroll = () => { 
      setIsScrolled(window.scrollY > 50); 
    }; 
    window.addEventListener('scroll', handleScroll); 
    return () => window.removeEventListener('scroll', handleScroll); 
  }, []); 

  // Close the account menu on an outside click or Esc.
  useEffect(() => {
    if (!dropdownOpen) return undefined;
    const onPointer = (e) => { if (dropdownRef.current && !dropdownRef.current.contains(e.target)) setDropdownOpen(false); };
    const onKey = (e) => { if (e.key === 'Escape') setDropdownOpen(false); };
    document.addEventListener('mousedown', onPointer);
    document.addEventListener('keydown', onKey);
    return () => {
      document.removeEventListener('mousedown', onPointer);
      document.removeEventListener('keydown', onKey);
    };
  }, [dropdownOpen]);

  const toggleDropdown = () => setDropdownOpen(!dropdownOpen); 
  const toggleMobile = () => setMobileOpen(!mobileOpen); 
  const closeAll = () => { 
    setDropdownOpen(false); 
    setMobileOpen(false); 
  }; 

  const handleLogout = () => { 
    logout(); 
    navigate('/'); 
    closeAll(); 
  }; 

  // Since admins are filtered out, this link safely targets citizen tracking spaces
  const getDashboardPath = () => { 
    return user ? '/dashboard' : '/login'; 
  }; 

  const navLinks = [ 
    { to: '/', label: 'Home', exact: true }, 
    // Report Incident and the request forms live under Services, so keep
    // Services highlighted while on them.
    { to: '/services', label: 'Services', alsoActive: ['/incident-report', '/request/', '/business-clearance', '/amenity-reservation'] },
    { to: '/waste-management', label: 'Waste Schedule' },
    { to: '/disaster-risk', label: 'Disaster Risk' },
    { to: getDashboardPath(), label: 'Track Request' }
  ];

  const getActiveClass = (link) => {
    const path = location.pathname;
    if (path === link.to) return 'active';
    return (link.alsoActive || []).some(p => path.startsWith(p)) ? 'active' : '';
  };

  return ( 
    <header id="main-header" className={isScrolled ? 'scrolled' : ''}> 
      <div className="header-container"> 
        {/* Brand Logo - Swapped to Link component */} 
        <Link to="/" className="brand-logo" onClick={closeAll}> 
          <div className="logo-icon"> 
            <img 
              src="/assets/img/PB2_logo.png" 
              alt="Pasong Buaya 2 Logo" 
              style={{ width: '80px', height: 'auto', animation: 'pulseLogo 2s infinite ease-in-out' }} 
              onError={(e) => { 
                e.target.style.display = 'none'; 
                e.target.nextElementSibling.style.display = 'block'; 
              }} 
            /> 
            <div className="logo-fallback" style={{ display: 'none' }}>PB2</div> 
          </div> 
          <div className="brand-text"> 
            <span className="brand-main">Pasong Buaya II</span> 
            <span className="brand-sub">Digital Barangay Portal</span> 
          </div> 
        </Link> 

        {/* Desktop Nav - Swapped to Link component */} 
        <nav className="desktop-nav"> 
          {navLinks.map((link, index) => ( 
            <Link key={index} to={link.to} className={getActiveClass(link)} onClick={closeAll}> 
              {link.label} 
            </Link> 
          ))} 
        </nav> 

        {/* Header Actions */} 
        <div className="header-actions"> 
          {user ? ( 
            /* Logged In - Regular Citizen Profile Dropdown Layout */ 
            <div ref={dropdownRef} className={`user-dropdown ${dropdownOpen ? 'is-open' : ''}`}>
              <button type="button" className="user-dropdown-trigger" onClick={toggleDropdown} aria-haspopup="menu" aria-expanded={dropdownOpen}>
                <div className="user-avatar">
                  {user.profile_picture ? (
                    <img src={getProfilePhotoUrl(user.profile_picture)} alt="" />
                  ) : getInitial(user)}
                </div>
                <span className="user-label">{getDisplayName(user)}</span>
                <i className="bi bi-chevron-down dropdown-arrow" aria-hidden="true"></i>
              </button>

              <div className={`dropdown-menu ${dropdownOpen ? 'show' : ''}`} role="menu">
                <div className="dropdown-header">
                  <div className="dropdown-avatar">
                    {user.profile_picture ? (
                      <img src={getProfilePhotoUrl(user.profile_picture)} alt="" />
                    ) : getInitial(user)}
                  </div>
                  <div className="dropdown-identity">
                    <strong>{getDisplayName(user)}</strong>
                    <small className="dropdown-email">{user.email}</small>
                    <span className="dropdown-badge"><i className="bi bi-patch-check-fill" aria-hidden="true"></i> Verified Resident</span>
                  </div>
                </div>

                <Link to="/profile" role="menuitem" onClick={closeAll}>
                  <i className="bi bi-person-gear" aria-hidden="true"></i> Edit Profile
                </Link>

                <div className="dropdown-divider"></div>
                <a href="#" role="menuitem" className="logout-link" onClick={(e) => { e.preventDefault(); handleLogout(); }}>
                  <i className="bi bi-box-arrow-right" aria-hidden="true"></i> Logout
                </a>
              </div>
            </div>
          ) : ( 
            /* Not Logged In / Admin Hidden View Options */ 
            <> 
              <Link to="/login" className="btn-text" onClick={closeAll}>Log In</Link> 
              <Link to="/register" className="btn-primary" onClick={closeAll}>Get Started</Link> 
            </> 
          )} 

          {/* Mobile Toggle */} 
          <button className="mobile-toggle" onClick={toggleMobile}> 
            <span></span> 
            <span></span> 
            <span></span> 
          </button> 
        </div> 
      </div> 

      {/* Mobile Nav Menu Space */} 
      <div className={`mobile-nav ${mobileOpen ? 'open' : ''}`} id="mobileNav"> 
        {navLinks.map((link, index) => ( 
          <Link key={index} to={link.to} onClick={closeAll}> 
            {link.label} 
          </Link> 
        ))} 
        {user ? ( 
          <> 
            <Link to="/profile" onClick={closeAll}>My Profile</Link> 
            <a href="#" className="logout-link" onClick={handleLogout} style={{ color: '#ef4444' }}>Logout</a> 
          </> 
        ) : ( 
          <div className="mobile-auth"> 
            <Link to="/login" onClick={closeAll}>Log In</Link> 
            <Link to="/register" className="btn-primary" onClick={closeAll}>Register</Link> 
          </div> 
        )} 
      </div> 
    </header> 
  ); 
}; 

export default Header;