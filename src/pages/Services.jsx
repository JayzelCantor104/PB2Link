import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';
import Toast from '../components/Toast';
import { useToast } from '../lib/useToast';
import '../styles/services.css';

const API_BASE = '/api_backend';

const Services = () => {
  const [searchTerm, setSearchTerm] = useState('');
  const [activeFilter, setActiveFilter] = useState('All Services');
  const [servicesList, setServicesList] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  // Pull user object directly from AuthContext
  const { user } = useAuth();
  const { toast, showToast, confirmToast, closeToast } = useToast();

  // Static/Fixed Services List (for dedicated custom pages)
  const staticServices = [
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
      category: 'Permits',
      link: '/business-clearance' // Points to your custom multi-step page
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
    {
      id: 'incident',
      title: 'Report Incident',
      description: 'Report a public safety concern, dispute, or emergency to barangay officials with photo evidence.',
      icon: 'bi-exclamation-triangle-fill',
      category: 'Community',
      link: '/incident-report',
      actionLabel: 'Report Now'
    }
  ];

  useEffect(() => {
    loadMergedServices();
  }, []);

  const loadMergedServices = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/services.php?action=get_all`);
      const data = await res.json();

      if (data.success && Array.isArray(data.services)) {
        // Map database records to frontend structure
        const dynamicFetched = data.services
          .filter(s => s.is_active === 1 || s.is_active === '1')
          .map(s => ({
            id: s.service_id,
            title: s.title,
            description: s.description || 'Request this official barangay service online.',
            category: mapCategoryToFilter(s.category),
            icon: mapCategoryToIcon(s.category, s.title),
            isDynamic: true
          }));

        // Combine static and dynamic services while eliminating duplicates by title
        const combined = [...staticServices];

        dynamicFetched.forEach(dynItem => {
          const exists = combined.some(
            statItem => statItem.title.toLowerCase().trim() === dynItem.title.toLowerCase().trim()
          );
          if (!exists) {
            combined.push(dynItem);
          }
        });

        setServicesList(combined);
      } else {
        // Fallback to static list if database response fails
        setServicesList(staticServices);
      }
    } catch (err) {
      console.error('Failed to load dynamic services, using static fallback:', err);
      setServicesList(staticServices);
    } finally {
      setLoading(false);
    }
  };

  // Helper: Standardize Backend categories into Filter tabs
  const mapCategoryToFilter = (category) => {
    switch (category) {
      case 'Clearance & Certification':
        return 'Documents';
      case 'Permit':
        return 'Permits';
      case 'Registration':
      case 'Facility Reservation':
      case 'Other':
      default:
        return 'Community';
    }
  };

  // Helper: Assign Bootstrap Icons based on category or title
  const mapCategoryToIcon = (category, title) => {
    const lowerTitle = title.toLowerCase();
    if (lowerTitle.includes('clearance')) return 'bi-file-earmark-text-fill';
    if (lowerTitle.includes('residency') || lowerTitle.includes('certificate')) return 'bi-house-check-fill';
    if (lowerTitle.includes('id')) return 'bi-person-badge-fill';
    if (lowerTitle.includes('business') || category === 'Permit') return 'bi-briefcase-fill';
    if (lowerTitle.includes('indigency')) return 'bi-heart-pulse-fill';
    if (lowerTitle.includes('volunteer') || lowerTitle.includes('bayanihan')) return 'bi-people-fill';
    return 'bi-layers-fill';
  };

  const handleRequestClick = async (service) => {
    if (!user) {
      const goToLogin = await confirmToast(
        'Login Required',
        `Please log in to your resident account to use ${service.title}.`,
        { confirmLabel: 'Log In', cancelLabel: 'Not Now' }
      );
      if (goToLogin) navigate('/login');
      return;
    }

    if (user.status !== 'Active') {
      showToast('Account Not Yet Active', 'Only verified (Active) residents can request services. Please wait for your profile to be approved.', 'warning');
      return;
    }

    // Direct routing for static custom links vs dynamic form engine
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
      <Toast toast={toast} onClose={closeToast} />

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
              {loading ? (
                <div style={{ textAlign: 'center', padding: '40px', color: '#64748b' }}>
                  Loading available barangay services...
                </div>
              ) : filteredServices.length > 0 ? (
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
                      <span>{service.actionLabel || 'Request Now'}</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="sp-no-results" role="status">
                  <i
                    className="bi bi-search"
                    style={{ fontSize: '2.5rem', color: '#94a3b8', marginBottom: '12px', display: 'block' }}
                    aria-hidden="true"
                  ></i>
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