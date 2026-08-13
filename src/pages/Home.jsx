import { useEffect, useState } from "react";
import { Link } from "react-router-dom"; // Recommended for navigation
import Header from "../components/Header";
import Hero from "../components/Hero";
import Services from "../components/Services";
import Footer from "../components/Footer";
import Preloader from "../components/Preloader";

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
  return (
    <>
      <Preloader />
      <Header />
      <Hero />
      
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