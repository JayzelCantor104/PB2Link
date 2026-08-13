import { useState, useEffect } from 'react'; 
import { useLocation, useNavigate, Link } from 'react-router-dom'; // 1. Added Link here
import { useAuth } from '../context/AuthContext'; 

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
  const navigate = useNavigate(); 

  // Scroll effect 
  useEffect(() => { 
    const handleScroll = () => { 
      setIsScrolled(window.scrollY > 50); 
    }; 
    window.addEventListener('scroll', handleScroll); 
    return () => window.removeEventListener('scroll', handleScroll); 
  }, []); 

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
    { to: '/services', label: 'Services' }, 
    { to: '/incident-report', label: 'Report Incident' }, 
    { to: getDashboardPath(), label: 'Track Request' } 
  ]; 

  const getActiveClass = (path) => location.pathname === path ? 'active' : ''; 

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
            <Link key={index} to={link.to} className={getActiveClass(link.to)} onClick={closeAll}> 
              {link.label} 
            </Link> 
          ))} 
        </nav> 

        {/* Header Actions */} 
        <div className="header-actions"> 
          {user ? ( 
            /* Logged In - Regular Citizen Profile Dropdown Layout */ 
            <div className="user-dropdown" onClick={toggleDropdown}> 
              <div className="user-avatar" style={{ backgroundColor: '#047857' }}> 
                {user.email?.charAt(0).toUpperCase()} 
              </div> 
              <span className="user-label">
                {user.email?.split('@')[0]}
              </span> 
              <span className="dropdown-arrow">▼</span> 
              
              <div className={`dropdown-menu ${dropdownOpen ? 'show' : ''}`} onClick={(e) => e.stopPropagation()}> 
                <div className="dropdown-header"> 
                  <p>Signed in as</p> 
                  <strong>{user.email}</strong> 
                </div> 
                
                {/* 2. CRITICAL FIX: Swapped out <a> tags to <Link> tags here */}
                <Link to="/profile" onClick={closeAll}>👤 Edit Profile</Link> 
                <Link to="/dashboard" onClick={closeAll}>📂 My Dashboard</Link> 
                
                <div className="dropdown-divider"></div> 
                <a href="#" className="logout-link" onClick={handleLogout}>🚪 Logout</a> 
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