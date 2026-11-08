import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = '/api_backend';

// "What do you need today?" on the Home page: jumps to a service (as Services
// Management lists them, services.php get_catalog), a page, or Track Request
// with a tracking code (CLR-, RES-, BID-, BIZ-, IND-, …). A combobox: arrow
// keys move through the results, Enter opens one, Escape clears.
const PAGES = [
  { title: 'Track my requests', route: '/track-request', icon: 'bi-search', kind: 'Page', words: 'status payment tracking' },
  { title: 'All services', route: '/services', icon: 'bi-grid', kind: 'Page', words: 'documents request' },
  { title: 'Announcements', route: '/announcements', icon: 'bi-megaphone', kind: 'Page', words: 'news posts' },
  { title: 'Disaster risk and evacuation centers', route: '/disaster-risk', icon: 'bi-house-heart', kind: 'Page', words: 'advisory typhoon flood evacuation weather' },
  { title: 'Emergency info and hotlines', route: '/emergency', icon: 'bi-telephone', kind: 'Page', words: 'emergency hotline 911 call' },
  { title: 'Preparedness: flood risk and checklists', route: '/preparedness', icon: 'bi-shield-check', kind: 'Page', words: 'go bag flood street checklist guide' },
  { title: 'Garbage collection schedule', route: '/waste-management', icon: 'bi-trash3', kind: 'Page', words: 'waste basura segregation truck' },
  { title: 'Community issue map', route: '/issue-map', icon: 'bi-flag', kind: 'Page', words: 'report problem streetlight pothole' },
  { title: 'About the barangay and council', route: '/about', icon: 'bi-people', kind: 'Page', words: 'officials kagawad captain history' },
  { title: 'My profile', route: '/profile', icon: 'bi-person', kind: 'Page', words: 'account edit password' },
  { title: 'Accessibility', route: '/accessibility', icon: 'bi-universal-access', kind: 'Page', words: 'pwd text size' },
];
// Used until the catalog loads (or if it can't).
const FALLBACK_SERVICES = [
  ['Barangay Clearance', '/request/clearance'], ['Certificate of Residency', '/request/residency'],
  ['Barangay ID', '/request/id'], ['Business Clearance', '/request/business'],
  ['Certificate of Indigency', '/request/indigency'], ['Volunteer Registration', '/request/volunteer'],
  ['Book a facility', '/amenity-reservation'], ['Report an incident', '/incident-report'],
].map(([title, route]) => ({ title, route, icon: 'bi-file-earmark-text', kind: 'Service', words: '' }));

const TRACKING_RE = /^[A-Z]{2,4}-[A-Z0-9-]{3,}$/i;
const norm = (s) => String(s || '').toLowerCase();

const HomeSearch = () => {
  const navigate = useNavigate();
  const [q, setQ] = useState('');
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(0);
  const [services, setServices] = useState(FALLBACK_SERVICES);
  const listId = useId();
  const inputRef = useRef(null);

  useEffect(() => {
    let alive = true;
    fetch(`${API_BASE}/services.php?action=get_catalog`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || !d.success || !Array.isArray(d.items)) return;
        setServices(d.items.filter((i) => Number(i.is_active) === 1).map((i) => ({
          title: i.title, route: i.route, icon: i.icon || 'bi-file-earmark-text', kind: 'Service', words: `${i.label || ''} ${i.category || ''}`,
        })));
      })
      .catch(() => {});
    return () => { alive = false; };
  }, []);

  const results = useMemo(() => {
    const v = q.trim();
    if (!v) return [];
    if (TRACKING_RE.test(v)) {
      return [{ title: `Track ${v.toUpperCase()}`, route: `/track-request?code=${encodeURIComponent(v.toUpperCase())}`, icon: 'bi-search', kind: 'Tracking code' }];
    }
    const words = norm(v).split(/\s+/);
    const hits = [...services, ...PAGES].filter((item) => {
      const hay = norm(`${item.title} ${item.words}`);
      return words.every((w) => hay.includes(w));
    });
    return hits.length ? hits.slice(0, 7) : [{ title: `No match for “${v}”. See all services`, route: '/services', icon: 'bi-grid', kind: '' }];
  }, [q, services]);

  const go = (item) => {
    if (!item) return;
    setQ('');
    setOpen(false);
    navigate(item.route);
  };

  const onKeyDown = (e) => {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      if (!results.length) return;
      e.preventDefault();
      setOpen(true);
      setActive((a) => (a + (e.key === 'ArrowDown' ? 1 : -1) + results.length) % results.length);
    } else if (e.key === 'Enter') {
      if (open && results[active]) { e.preventDefault(); go(results[active]); }
    } else if (e.key === 'Escape') {
      setQ('');
      setOpen(false);
    }
  };

  const showList = open && results.length > 0;
  return (
    <div className="hm-search" role="search">
      <i className="bi bi-search" aria-hidden="true"></i>
      <label htmlFor={`${listId}-q`} className="sr-only">What do you need today?</label>
      <input
        ref={inputRef}
        id={`${listId}-q`}
        type="search"
        className="keep-case"
        autoComplete="off"
        placeholder="What do you need today? Try “clearance” or a tracking code"
        value={q}
        onChange={(e) => { setQ(e.target.value); setActive(0); setOpen(true); }}
        onFocus={() => q && setOpen(true)}
        onBlur={() => setTimeout(() => setOpen(false), 120)}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={showList}
        aria-controls={`${listId}-list`}
        aria-autocomplete="list"
        aria-activedescendant={showList ? `${listId}-o${active}` : undefined}
      />
      {showList && (
        <ul className="hm-search-results" id={`${listId}-list`} role="listbox" aria-label="Results">
          {results.map((item, i) => (
            <li key={`${item.route}-${item.title}`} id={`${listId}-o${i}`} role="option" aria-selected={i === active}
              className={i === active ? 'is-active' : ''}
              onMouseDown={(e) => { e.preventDefault(); go(item); }}
              onMouseEnter={() => setActive(i)}>
              <i className={`bi ${item.icon}`} aria-hidden="true"></i>
              <span>{item.title}</span>
              {item.kind && <small>{item.kind}</small>}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
};

export default HomeSearch;
