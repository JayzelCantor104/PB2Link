import { Link } from "react-router-dom";
import Header from "../components/Header";
import Hero from "../components/Hero";
import Footer from "../components/Footer";
import Preloader from "../components/Preloader";
import HomeSnapshot from "../components/HomeSnapshot";
import { useAuth } from "../context/AuthContext";
import useHomeData from "../lib/useHomeData";

function Home() {
  // Same rule as the Header: an admin account signed in on the citizen side
  // isn't treated as a resident.
  const { user } = useAuth();
  const isAccountAdmin = user && (user.isAdmin === true || user.isAdmin === "true" || Number(user.isAdmin) === 1);
  const resident = !!user && !isAccountAdmin;
  // Live data, loaded once for the welcome bar and the dashboard.
  const home = useHomeData(resident);

  return (
    <>
      <Preloader />
      <Header />
      {/* The page's main region (WCAG 1.3.1); a div, not <main>, because some
          stylesheets style bare main elements. */}
      <div role="main" id="main-content">
        <Hero home={home} resident={resident} />

        {/* My Barangay: customizable tiles (advisory, requests, weather,
            garbage, street, issues, services, hotlines) and the
            announcements side panel (all live data). */}
        <HomeSnapshot home={home} resident={resident} />

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
      </div>

      <Footer />

      {/* Toast Notification Container */}
      <div className="toast-container" id="toastContainer"></div>
    </>
  );
}

export default Home;
