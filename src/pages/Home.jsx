import { useEffect, useState } from "react";
import { Link } from "react-router-dom"; // Recommended for navigation
import Header from "../components/Header";
import Hero from "../components/Hero";
import Services from "../components/Services";
import Footer from "../components/Footer";
import Preloader from "../components/Preloader";
import AnnouncementsFeed from "../components/AnnouncementsFeed";

// Reusable Counter Component to handle state properly in React
const AnimatedCounter = ({ target, label }) => {
  const [count, setCount] = useState(0);

  useEffect(() => {
    let current = 0;
    const speed = 200; // Adjust for faster/slower counting
    const increment = target / speed;

    const timer = setInterval(() => {
      current += increment;
      if (current >= target) {
        setCount(target);
        clearInterval(timer);
      } else {
        setCount(Math.ceil(current));
      }
    }, 20);

    return () => clearInterval(timer); // Cleanup interval on unmount
  }, [target]);

  return (
    <div className="stat-item">
      <h3>{count.toLocaleString()}</h3>
      <p>{label}</p>
    </div>
  );
};

function Home() {
  const [activeAlert, setActiveAlert] = useState(null);

  useEffect(() => {
    const checkAlerts = async () => {
      try {
        const res = await fetch('/api_backend/disaster_risk.php?action=get_all');
        const data = await res.json();
        if (data && data.success && Array.isArray(data.alerts)) {
          const current = data.alerts.find((a) => Number(a.is_active) === 1);
          if (current) setActiveAlert(current);
        }
      } catch {
        // Silently skip if network fails
      }
    };
    checkAlerts();
  }, []);

  return (
    <>
      <Preloader />
      <Header />
      <Hero />

      {/* Emergency Calamity Warning Banner if Active Alert exists */}
      {activeAlert && (
        <section style={{ maxWidth: '1140px', margin: '25px auto 0', padding: '0 20px' }}>
          <div
            style={{
              background:
                activeAlert.alert_level === 'Severe'
                  ? '#fef2f2'
                  : activeAlert.alert_level === 'Warning'
                  ? '#fff7ed'
                  : '#fffbeb',
              border: `2px solid ${
                activeAlert.alert_level === 'Severe'
                  ? '#ef4444'
                  : activeAlert.alert_level === 'Warning'
                  ? '#f97316'
                  : '#f59e0b'
              }`,
              borderRadius: '16px',
              padding: '20px 24px',
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: '15px',
              boxShadow: '0 8px 25px rgba(0,0,0,0.06)'
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: '15px', maxWidth: '800px' }}>
              <div
                style={{
                  fontSize: '1.8rem',
                  color:
                    activeAlert.alert_level === 'Severe'
                      ? '#dc2626'
                      : activeAlert.alert_level === 'Warning'
                      ? '#ea580c'
                      : '#d97706'
                }}
              >
                <i className="bi bi-exclamation-triangle-fill"></i>
              </div>
              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '4px', flexWrap: 'wrap' }}>
                  <span
                    style={{
                      background:
                        activeAlert.alert_level === 'Severe'
                          ? '#dc2626'
                          : activeAlert.alert_level === 'Warning'
                          ? '#ea580c'
                          : '#d97706',
                      color: '#fff',
                      padding: '2px 10px',
                      borderRadius: '12px',
                      fontSize: '0.72rem',
                      fontWeight: 800,
                      textTransform: 'uppercase'
                    }}
                  >
                    {activeAlert.alert_level} Alert Level
                  </span>
                  <strong style={{ color: '#1e293b', fontSize: '1.05rem' }}>{activeAlert.title}</strong>
                </div>
                <p style={{ margin: 0, fontSize: '0.85rem', color: '#475569' }}>
                  {activeAlert.instructions?.substring(0, 140)}...
                </p>
              </div>
            </div>

            <Link
              to="/disaster-risk"
              style={{
                background: '#043927',
                color: '#fff',
                padding: '10px 18px',
                borderRadius: '10px',
                textDecoration: 'none',
                fontWeight: 700,
                fontSize: '0.85rem',
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                whiteSpace: 'nowrap'
              }}
            >
              <i className="bi bi-shield-check"></i> Evacuation Centers & Hotlines
            </Link>
          </div>
        </section>
      )}

      <AnnouncementsFeed />

      {/* 1. Stats Section */}
      <section className="stats-section">
        <div className="stats-grid">
          <AnimatedCounter target={28000} label="Residents" />
          <AnimatedCounter target={1540} label="Documents Issued" />
          <AnimatedCounter target={98} label="Solved Cases" />
          <AnimatedCounter target={24} label="Active Staff" />
        </div>
      </section>

      {/* 2. Heritage Section */}
      <section className="heritage-section">
        <div className="heritage-container">
          <div className="heritage-text">
            <span className="badge-gold">Our Legacy</span>
            <h2>Know Your<br />Barangay</h2>
            <p>
              Discover the rich history of Pasong Buaya II. From humble beginnings 
              to a thriving digital community, meet the leaders and the visionaries 
              dedicating their service to you.
            </p>
            
            {/* Replaced window.location with React Router Link */}
            <Link to="/about" className="btn-magnetic gold-btn">
              <i className="bi bi-book-half"></i> Explore Our Story
            </Link>
          </div>

          <div className="heritage-visual">
            <div className="visual-card">
              <div className="floating-stat">
                <span>ESTABLISHED</span>
                <strong>1990</strong>
              </div>
            </div>
          </div>
        </div>
      </section>

      

      <Services />
      <Footer />

      {/* Toast Notification Container */}
      <div className="toast-container" id="toastContainer"></div>
    </>
  );
}

export default Home;