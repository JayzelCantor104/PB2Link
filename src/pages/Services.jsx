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
      category: 'Permits'
      // No `link`: falls through to /request/business (App.jsx), like the other documents.
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

  // Every service, as Services Management set it up (services.php get_catalog,
  // migration 031): names, descriptions, icons and order of the built-in
  // services and the open custom services. A built-in service staff closed is
  // still listed, as unavailable. If the catalog can't load, the built-in list
  // below is shown as before.
  const loadMergedServices = async () => {
    try {
      setLoading(true);
      const res = await fetch(`${API_BASE}/services.php?action=get_catalog`);
      const data = await res.json();
      if (data.success && Array.isArray(data.items)) {
        setServicesList(data.items.map(item => ({
          id: `${item.kind}-${item.id}`,
          title: item.title,
          description: item.description || 'Request this official barangay service online.',
          category: mapCategoryToFilter(item.category),
          icon: item.icon || mapCategoryToIcon(item.category, item.title),
          link: item.route,
          actionLabel: item.kind === 'builtin' && item.id === 'incident' ? 'Report Now' : undefined,
          closed: Number(item.is_active) !== 1,
          closedMessage: item.closed_message || '',
        })));
      } else {
        setServicesList(staticServices);
      }
    } catch (err) {
      console.error('Failed to load services, using the built-in list:', err);
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
  // Whole words only, so e.g. "Burial Aid" doesn't get the ID card icon.
  const mapCategoryToIcon = (category, title) => {
    const has = (re) => re.test(String(title || ''));
    if (has(/\bclearance\b/i)) return 'bi-file-earmark-text-fill';
    if (has(/\b(residency|certificate|certification)\b/i)) return 'bi-house-check-fill';
    if (has(/\bid\b/i)) return 'bi-person-badge-fill';
    if (has(/\b(business|permit)\b/i) || category === 'Permit') return 'bi-briefcase-fill';
    if (has(/\b(indigency|medical|health|burial|financial)\b/i)) return 'bi-heart-pulse-fill';
    if (has(/\b(volunteer|bayanihan|feeding|outreach|community)\b/i)) return 'bi-people-fill';
    if (has(/\b(scholar|scholarship|school|education)\b/i)) return 'bi-mortarboard-fill';
    if (category === 'Facility Reservation') return 'bi-calendar-event-fill';
    if (category === 'Registration') return 'bi-clipboard2-check-fill';
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

    if (service.closed) {
      showToast('Not Available Right Now', service.closedMessage || `${service.title} is not accepting requests right now.`, 'warning');
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
                    className={`sp-service-card${service.closed ? ' is-closed' : ''}`}
                    style={{ animationDelay: `${index * 40}ms` }}
                    data-tooltip-text={`Official application portal for ${service.title}.`}
                  >
                    <div className="sp-icon-wrapper">
                      <i className={`bi ${service.icon} sp-service-icon`} aria-hidden="true"></i>
                    </div>
                    <h3>{service.title}</h3>
                    <p>{service.description}</p>
                    {service.closed && (
                      <p className="sp-closed-note" role="status">
                        <i className="bi bi-pause-circle" aria-hidden="true"></i> Not accepting requests right now.{service.closedMessage ? ` ${service.closedMessage}` : ''}
                      </p>
                    )}
                    <button
                      className="sp-btn-request"
                      onClick={() => handleRequestClick(service)}
                      disabled={service.closed}
                      aria-label={service.closed ? `${service.title} is not available right now` : `Request ${service.title}`}
                    >
                      <span>{service.closed ? 'Not Available' : (service.actionLabel || 'Request Now')}</span>
                    </button>
                  </div>
                ))
              ) : (
                <div className="sp-no-results" role="status">
                  <i
                    className="bi bi-search"
                    style={{ fontSize: '2.5rem', color: '#64748b', marginBottom: '12px', display: 'block' }}
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