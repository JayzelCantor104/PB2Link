import { Link } from 'react-router-dom';
import { CERT_CONTACTS } from '../lib/certificates';

// Site footer on every resident page (styles: src/styles/footer.css).
// The phone numbers come from the barangay's own printed form
// (CERT_CONTACTS in src/lib/certificates.js), so the footer and the
// certificates always show the same numbers. Edit them there.
const telHref = (n) => `tel:${n.replace(/[^0-9+]/g, '')}`;
const LANDLINE = CERT_CONTACTS.col1[0][1];
const VAWC = CERT_CONTACTS.col1[1][1];
const LOCAL_EXT = CERT_CONTACTS.col2[0][1];

const COLUMNS = [
  {
    title: 'Services',
    links: [
      ['/services', 'bi-file-earmark-text', 'Request a Document'],
      ['/amenity-reservation', 'bi-calendar-check', 'Book a Facility'],
      ['/incident-report', 'bi-shield-exclamation', 'Report an Incident'],
      ['/track-request', 'bi-search', 'Track My Requests'],
    ],
  },
  {
    title: 'Community',
    links: [
      ['/issue-map', 'bi-geo-alt', 'Community Issue Map'],
      ['/waste-management', 'bi-trash3', 'Garbage Collection'],
      ['/announcements', 'bi-megaphone', 'Announcements'],
      ['/about', 'bi-people', 'About & Council'],
    ],
  },
  {
    title: 'Disaster & Safety',
    links: [
      ['/disaster-risk', 'bi-cloud-lightning-rain', 'Advisories & Evacuation'],
      ['/preparedness', 'bi-shield-check', 'Preparedness & Hotlines'],
      ['/emergency', 'bi-life-preserver', 'Emergency Info (works offline)'],
    ],
  },
];

const Footer = () => {
  const year = new Date().getFullYear();
  return (
    <footer className="pb2-footer">
      {/* Emergency strip */}
      <div className="pf-emergency">
        <div className="pf-wrap pf-emergency-inner">
          <span className="pf-emergency-text">
            <i className="bi bi-exclamation-octagon-fill" aria-hidden="true"></i>
            <span><strong>In an emergency, call 911.</strong> For barangay assistance, call {LANDLINE}.</span>
          </span>
          <span className="pf-emergency-actions">
            <a className="pf-pill is-red" href="tel:911"><i className="bi bi-telephone-fill" aria-hidden="true"></i> Call 911</a>
            <Link className="pf-pill" to="/emergency"><i className="bi bi-life-preserver" aria-hidden="true"></i> Emergency Info</Link>
          </span>
        </div>
      </div>

      <div className="pf-wrap pf-main">
        {/* Brand */}
        <div className="pf-brand">
          <div className="pf-brand-head">
            <img src="/assets/img/PB2_logo.png" alt="" className="pf-seal" onError={(e) => { e.currentTarget.style.display = 'none'; }} />
            <div>
              <span className="pf-kicker">Republic of the Philippines</span>
              <h2>Barangay Pasong Buaya II</h2>
              <span className="pf-sub">City of Imus, Province of Cavite</span>
            </div>
          </div>
          <p className="pf-mission">
            The official online portal of Barangay Pasong Buaya II. Request documents, book facilities, report problems
            and stay informed, anytime and from any device.
          </p>
          <span className="pf-badge"><i className="bi bi-patch-check-fill" aria-hidden="true"></i> Official Barangay Portal</span>
        </div>

        {/* Link columns */}
        {COLUMNS.map((col) => (
          <nav key={col.title} className="pf-col" aria-label={col.title}>
            <h3>{col.title}</h3>
            <ul className="pf-links">
              {col.links.map(([to, icon, label]) => (
                <li key={to}>
                  <Link to={to}><i className={`bi ${icon}`} aria-hidden="true"></i><span>{label}</span></Link>
                </li>
              ))}
            </ul>
          </nav>
        ))}

        {/* Contact */}
        <div className="pf-col pf-contact">
          <h3>Contact Us</h3>
          <ul className="pf-contact-list">
            <li>
              <span className="pf-ic" aria-hidden="true"><i className="bi bi-building"></i></span>
              <span><small>Barangay Hall</small>Pasong Buaya II, City of Imus, Cavite</span>
            </li>
            <li>
              <span className="pf-ic" aria-hidden="true"><i className="bi bi-telephone"></i></span>
              <span>
                <small>Landline</small>
                <a href={telHref(LANDLINE)}>{LANDLINE}</a>
                {' · '}
                <a href={telHref(LOCAL_EXT)}>{LOCAL_EXT}</a>
              </span>
            </li>
            <li>
              <span className="pf-ic" aria-hidden="true"><i className="bi bi-heart-pulse"></i></span>
              <span><small>VAWC Hotline</small><a href={telHref(VAWC)}>{VAWC}</a></span>
            </li>
            <li>
              <span className="pf-ic" aria-hidden="true"><i className="bi bi-clock"></i></span>
              <span><small>Office Hours</small>Monday to Friday, 8:00 AM to 5:00 PM</span>
            </li>
            <li>
              <span className="pf-ic" aria-hidden="true"><i className="bi bi-facebook"></i></span>
              <span><small>Facebook</small>Barangay Pasong Buaya 2</span>
            </li>
          </ul>
        </div>
      </div>

      <div className="pf-bottom">
        <div className="pf-wrap pf-bottom-inner">
          <p>© {year} Barangay Pasong Buaya II, City of Imus, Cavite. All rights reserved.</p>
          <nav className="pf-legal" aria-label="Legal">
            <Link to="/privacy">Privacy Policy</Link>
            <Link to="/terms">Terms of Service</Link>
            <Link to="/accessibility">Accessibility</Link>
          </nav>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
