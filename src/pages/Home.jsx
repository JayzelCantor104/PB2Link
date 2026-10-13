import { Link } from "react-router-dom";
import Header from "../components/Header";
import Hero from "../components/Hero";
import Footer from "../components/Footer";
import Preloader from "../components/Preloader";
import HomeSnapshot from "../components/HomeSnapshot";

function Home() {
  return (
    <>
      <Preloader />
      <Header />
      <Hero />

      {/* Today at a glance: advisory, announcements, weather, garbage
          collection, community issues and quick services (all live data). */}
      <HomeSnapshot />

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

      <Footer />

      {/* Toast Notification Container */}
      <div className="toast-container" id="toastContainer"></div>
    </>
  );
}

export default Home;
