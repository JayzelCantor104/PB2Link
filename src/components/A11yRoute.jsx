import { useEffect } from 'react';
import { useLocation } from 'react-router-dom';

// Per-page accessibility basics, in one place instead of every page:
//   - "Skip to main content" link, the first stop for keyboard users (2.4.1);
//   - a browser tab title per page (2.4.2), from PAGE_TITLES;
//   - a main region (1.3.1): pages render Header, content, Footer under #root;
//     a page without <main> gets role="main" on its content. Home and the admin
//     layout use a real <main>.
// Rendered once inside the Router in App.jsx.

const SITE = 'PB2Link';
const ADMIN = 'PB2Link Admin';

// Most specific first; ":" segments match anything.
const PAGE_TITLES = [
  ['/', 'Barangay Pasong Buaya II'],
  ['/services', 'Services'],
  ['/announcements', 'Announcements'],
  ['/about', 'About the Barangay'],
  ['/incident-report', 'Report an Incident'],
  ['/waste-management', 'Garbage Collection'],
  ['/disaster-risk', 'Disaster Risk & Alerts'],
  ['/preparedness', 'Be Prepared'],
  ['/accessibility', 'Accessibility'],
  ['/emergency', 'Emergency Information'],
  ['/issue-map', 'Community Issue Map'],
  ['/login', 'Log In'],
  ['/register', 'Register'],
  ['/forgot-password', 'Forgot Password'],
  ['/reset-password', 'Reset Password'],
  ['/setup-password', 'Set Up Your Admin Account'],
  ['/dashboard', 'My Dashboard'],
  ['/track-request', 'Track My Requests'],
  ['/profile', 'Edit Profile'],
  ['/amenity-reservation', 'Book a Facility'],
  ['/request/clearance', 'Barangay Clearance'],
  ['/request/residency', 'Certificate of Residency'],
  ['/request/id', 'Barangay ID'],
  ['/request/business', 'Business Clearance'],
  ['/request/indigency', 'Certificate of Indigency'],
  ['/request/volunteer', 'Volunteer Registration'],
  ['/request/:id', 'Request a Service'],
  ['/admin/login', 'Admin Log In', ADMIN],
  ['/admin/forgot-password', 'Forgot Password', ADMIN],
  ['/admin/reset-password', 'Reset Password', ADMIN],
  ['/admin/dashboard', 'Dashboard', ADMIN],
  ['/admin/profiling', 'Residents', ADMIN],
  ['/admin/address-list', 'Address List', ADMIN],
  ['/admin/profiles', 'Profile Approvals', ADMIN],
  ['/admin/documents', 'Documents', ADMIN],
  ['/admin/incidents', 'Incidents', ADMIN],
  ['/admin/amenities/view/:id', 'Booking Details', ADMIN],
  ['/admin/amenities', 'Amenities', ADMIN],
  ['/admin/announcements', 'Announcements', ADMIN],
  ['/admin/waste-management', 'Waste Management', ADMIN],
  ['/admin/disaster-risk', 'Disaster Risk', ADMIN],
  ['/admin/issue-map', 'Issue Map', ADMIN],
  ['/admin/payments', 'Payments', ADMIN],
  ['/admin/services', 'Services', ADMIN],
  ['/admin/manage-admins', 'Manage Admins', ADMIN],
  ['/admin/audit-log', 'Audit Log', ADMIN],
  ['/admin', 'Admin', ADMIN],
];

const matches = (pattern, path) => {
  const a = pattern.split('/').filter(Boolean);
  const b = path.split('/').filter(Boolean);
  return a.length === b.length && a.every((seg, i) => seg.startsWith(':') || seg === b[i]);
};

const pageTitle = (path) => {
  const clean = path.replace(/\/+$/, '') || '/';
  const hit = PAGE_TITLES.find(([p]) => matches(p, clean));
  if (!hit) return SITE;
  const [, name, site = SITE] = hit;
  return clean === '/' ? `${SITE}: ${name}` : `${name} · ${site}`;
};

// The page's main region: an existing <main>, else the content between the
// site header and footer (role="main" added).
const findMain = () => {
  const existing = document.querySelector('main, [role="main"]');
  if (existing) return existing;
  const root = document.getElementById('root');
  if (!root) return null;
  const candidates = [...root.children].filter((el) => !el.matches('header, footer, nav, style, script, a.pb2-skip-link')
    && getComputedStyle(el).position !== 'fixed' && el.getBoundingClientRect().height > 0);
  if (candidates.length !== 1) return null;
  candidates[0].setAttribute('role', 'main');
  return candidates[0];
};

const A11yRoute = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    document.title = pageTitle(pathname);
    // After the page has rendered its content.
    const t = setTimeout(findMain, 0);
    return () => clearTimeout(t);
  }, [pathname]);

  const skip = (e) => {
    e.preventDefault();
    const main = findMain();
    const target = main || document.querySelector('h1');
    if (!target) return;
    if (!target.hasAttribute('tabindex')) target.setAttribute('tabindex', '-1');
    target.focus();
    target.scrollIntoView({ block: 'start' });
  };

  return (
    <a href="#main-content" className="pb2-skip-link" onClick={skip}>Skip to main content</a>
  );
};

export default A11yRoute;
