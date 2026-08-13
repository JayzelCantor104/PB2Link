import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import Header from '../components/Header';
import Hero from '../components/Hero';
import Services from '../components/Services';
import Footer from '../components/Footer';
import Preloader from '../components/Preloader';

function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();

  useEffect(() => {
    // Redirect to login if not authenticated
    if (!user) {
      navigate('/login');
    }

    // Stats counter animation
    function startCounters() {
      const counters = document.querySelectorAll('.counter');
      const speed = 200;

      counters.forEach(counter => {
        const updateCount = () => {
          const target = +counter.getAttribute('data-target');
          const count = +counter.innerText;
          const inc = target / speed;

          if (count < target) {
            counter.innerText = Math.ceil(count + inc);
            setTimeout(updateCount, 20);
          } else {
            counter.innerText = target.toLocaleString(); // Add commas
          }
        };
        updateCount();
      });
    }

    // Start counters after a delay
    setTimeout(startCounters, 1000);
  }, [user, navigate]);

  if (!user) {
    return <div></div>;
  }

  return (
    <>
      <Preloader />
      
      <Header />
      <Hero />
      
      <div className="stats-section">
        <div className="stats-grid">
          <div className="stat-item">
            <h3 className="counter" data-target="28000">0</h3>
            <p>Residents</p>
          </div>
          <div className="stat-item">
            <h3 className="counter" data-target="1540">0</h3>
            <p>Documents Issued</p>
          </div>
          <div className="stat-item">
            <h3 className="counter" data-target="98">0</h3>
            <p>Solved Cases</p>
          </div>
          <div className="stat-item">
            <h3 className="counter" data-target="24">0</h3>
            <p>Active Staff</p>
          </div>
        </div>
      </div>

      <section className="heritage-section">
        <div className="heritage-container">
          <div className="heritage-text">
            <span className="badge-gold">Our Legacy</span>
            <h2>Know Your<br />Barangay</h2>
            <p>Discover the rich history of Pasong Buaya II. From humble beginnings to a thriving digital community, meet the leaders and the visionaries dedicating their service to you.</p>
            
            <button className="btn-magnetic gold-btn" onClick={() => window.location.href='/about'}>
              <i className="bi bi-book-half"></i> Explore Our Story
            </button>
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

export default Dashboard;
