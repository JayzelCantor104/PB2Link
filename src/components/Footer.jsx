const Footer = () => {
  return (
    <footer>
      <div className="footer-container">
        <div className="footer-col">
          <div className="footer-brand">
            <h4>Barangay Pasong Buaya II</h4>
          </div>
          <p className="footer-mission">
            Serving our community through innovation, compassion, and transparency. 
            Bridging the gap between residents and local government.
          </p>
        </div>

        <div className="footer-col">
          <h5>Quick Access</h5>
          <ul className="footer-links">
            <li><a href="/">Home</a></li>
            <li><a href="/services">Request Documents</a></li>
            <li><a href="/incident-report">Report Incident</a></li>
            <li><a href="/login">Resident Login</a></li>
          </ul>
        </div>

        <div className="footer-col">
          <h5>Contact Us</h5>
          <ul className="contact-list">
            <li>📍 <strong>Hall:</strong> Pasong Buaya II, Imus City, Cavite</li>
            <li>📧 <strong>Email:</strong> info@pasongbuaya2.gov.ph</li>
            <li>📞 <strong>Emergency:</strong> (046) 123-4567</li>
            <li>🕒 <strong>Hours:</strong> Mon-Fri, 8:00 AM - 5:00 PM</li>
          </ul>
        </div>
      </div>

      <div className="footer-bottom">
        <p>&copy; 2026 Barangay Pasong Buaya II. All Rights Reserved.</p>
        <div className="legal-links">
          <a href="#">Privacy Policy</a> | <a href="#">Terms of Service</a>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
