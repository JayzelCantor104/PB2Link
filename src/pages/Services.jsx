import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import '../styles/services.css'; 

const Services = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All Services');
  const navigate = useNavigate();

 // Pull the user object directly from AuthContext
  const { user } = useAuth();

  const servicesList = [
    {
      id: 'clearance',
      title: 'Barangay Clearance',
      description: 'Apply for your official Barangay Clearance digitally in just a few minutes.',
      icon: 'bi-file-earmark-text-fill',
      category: 'Documents'
    },
    {
      id: 'residency',
      title: 'Certificate of Residency',
      description: 'Request your residency certificate without visiting the office.',
      icon: 'bi-house-check-fill',
      category: 'Documents'
    },
    {
      id: 'id',
      title: 'Barangay ID',
      description: 'Apply for your official Barangay ID for verification and records.',
      icon: 'bi-person-badge-fill',
      category: 'Documents'
    },
    {
      id: 'business',
      title: 'Business Clearance',
      description: 'Secure your barangay clearance for business operations quickly.',
      icon: 'bi-briefcase-fill',
      category: 'Permits'
    },
    {
      id: 'indigency',
      title: 'Certificate of Indigency',
      description: 'Get certification assistance for scholarship or medical aid purposes.',
      icon: 'bi-heart-pulse-fill',
      category: 'Documents'
    },
    {
      id: 'volunteer',
      title: 'Volunteer Registration',
      description: 'Join community projects and outreach programs within the barangay.',
      icon: 'bi-people-fill',
      category: 'Community'
    },
    {
      id: 'Amenities',
      title: 'Amenity Reservation',
      description: 'Schedule and book barangay facilities like the multi-purpose hall or court.',
      icon: 'bi-calendar-event-fill',
      category: 'Community',
      link: '/amenity-reservation' 
    },
  ];

 const handleRequestClick = (service) => {
    if (!user) {
      // System Alert for Unauthenticated Users
      const confirmLogin = window.confirm("You Must Login First.");
      if (confirmLogin) {
        navigate('/login');
      }
      return; 
    } 
    
    // Check if the user is an Active resident (adjust 'status' if your backend uses a different property name like 'account_status')
    if (user.status !== 'Active') {
      window.alert("Only Active residents are allowed to request documents. Please verify your account status.");
      return; 
    }

    // Navigate to custom link if it exists, otherwise use dynamic request path
    if (service.link) {
      navigate(service.link);
    } else {
      navigate(`/request/${service.id}`);
    }
  };

  
  const filteredServices = servicesList.filter(service => {
    const matchesSearch = service.title.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesFilter = activeFilter === 'All Services' || service.category === activeFilter;
    return matchesSearch && matchesFilter;
  });

  // GOMS/KLM Compliant Custom Hover Tooltip Tracking Engine
  useEffect(() => {
    const tooltipElement = document.getElementById('custom-tooltip');
    if (!tooltipElement) return;

    const handleMouseOver = (e) => {
      const target = e.target.closest('[data-tooltip-text]');
      if (!target) return;

      tooltipElement.textContent = target.getAttribute('data-tooltip-text');
      tooltipElement.style.display = 'block';
      
      void tooltipElement.offsetWidth; 
      tooltipElement.style.opacity = '1';
    };

    const handleMouseMove = (e) => {
      if (tooltipElement.style.display === 'block') {
        tooltipElement.style.left = `${e.clientX + 14}px`;
        tooltipElement.style.top = `${e.clientY + 14}px`;
      }
    };

    const handleMouseOut = (e) => {
      const target = e.target.closest('[data-tooltip-text]');
      if (!target) return;
      
      tooltipElement.style.opacity = '0';
      tooltipElement.style.display = 'none';
    };

    document.addEventListener('mouseover', handleMouseOver);
    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseout', handleMouseOut);

    return () => {
      document.removeEventListener('mouseover', handleMouseOver);
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseout', handleMouseOut);
    };
  }, []);

  return (
    <>
      <Preloader />
      <Header />

      {/* Global Dynamic Structural Tooltip Node Component Element */}
      <div id="custom-tooltip" role="tooltip" aria-hidden="true"></div>

      <main className="services-page-wrapper">
        {/* CSS Animated Ambient Canvas Backing Array Layers */}
        <div className="premium-ambient-bg" aria-hidden="true">
          <div className="ambient-orb orb-alpha"></div>
          <div className="ambient-orb orb-beta"></div>
          <div className="ambient-orb orb-gamma"></div>
        </div>

        <div className="sp-container">
          
          <div className="sp-header">
            <h1>Barangay Public Services</h1>
            <p>Access official Pasong Buaya II requests digitally. Search or filter to begin your application.</p>
          </div>

          <div 
            className="sp-search-bar"
            data-tooltip-text="Type here to locate government forms, credentials, or reservations instantly."
          >
            <input 
              type="text" 
              placeholder="Search services (e.g. Clearance, ID, Reservation)..." 
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              aria-label="Search available official barangay services"
            />
            <i className="bi bi-search" aria-hidden="true"></i>
          </div>

          <div 
            className="sp-filters"
            role="tablist"
            aria-label="Filter internal services by operational branch category"
          >
            {['All Services', 'Documents', 'Permits', 'Community'].map(filter => (
              <button 
                key={filter}
                onClick={() => setActiveFilter(filter)}
                className={`sp-filter-btn ${activeFilter === filter ? 'active' : 'inactive'}`}
                role="tab"
                aria-selected={activeFilter === filter}
                data-tooltip-text={`Filter viewports exclusively to ${filter.toLowerCase()} resources.`}
              >
                {filter}
              </button>
            ))}
          </div>

          {/* DESIGNED BIG CARD WRAPPER LAYER LAYER */}
          <div className="sp-main-glass-card">
            <div className="sp-grid" aria-live="polite">
              
              {filteredServices.length > 0 ? (
                filteredServices.map((service, index) => (
                  <div 
                    key={service.id} 
                    className="sp-service-card"
                    style={{ animationDelay: `${index * 40}ms` }}
                    data-tooltip-text={`Official application portal for ${service.title}.`}
                  >
                    <div className="sp-icon-wrapper">
                       <i className={`bi ${service.icon} sp-service-icon`} aria-hidden="true"></i>
                    </div>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    <button 
                      className="sp-btn-request" 
                      onClick={() => handleRequestClick(service)}
                      aria-label={`Initiate direct application processing sequence for ${service.title}`}
                    > 
                      <span>Request Now</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="sp-no-results" role="status">
                  <i className="bi bi-search" style={{ fontSize: '2.5rem', color: '#94a3b8', marginBottom: '12px', display: 'block' }} aria-hidden="true"></i>
                  <h3>No matching official services found</h3>
                  <p>Refine your search term keywords or filter criteria and try again.</p>
                </div>
              )}

            </div>
          </div>

        </div>
      </main>

      <Footer />
    </>
  );
};

export default Services;