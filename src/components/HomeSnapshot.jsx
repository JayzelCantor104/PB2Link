import { useCallback, useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import AnnouncementModal from './AnnouncementModal';
import { audienceTag, headlineOf, isPinned, FILES_BASE } from './announcementUtils';
import { CATEGORY_LOOKUP, DEFAULT_TIERS, OPEN_STATUSES, TIER_COLORS, tierOf } from './issueMapConfig';
import { getWeatherInfo } from '../lib/weatherCodes';
import { advisoryText, getAdvisoryLang } from '../lib/advisoryLanguage';
import StreetFloodRisk from './StreetFloodRisk';
import EmergencyHotlines from './EmergencyHotlines';
import '../styles/home-snapshot.css';
import '../styles/home-dashboard.css';

// ---------- helpers ----------
const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];

const shortDate = (v) => new Date(String(v).replace(' ', 'T')).toLocaleDateString('en-PH', { month: 'short', day: 'numeric' });
const timeOf = (v) => new Date(String(v).replace(' ', 'T')).toLocaleTimeString('en-PH', { hour: 'numeric', minute: '2-digit' });

// Waste type → a colour family, always shown with its text label.
const wasteKind = (type) => {
  const t = String(type || '').toLowerCase();
  if (t.includes('hazard') || t.includes('special')) return { cls: 'is-hazard', label: 'Hazardous' };
  if (t.includes('recycl')) return { cls: 'is-recycle', label: 'Recyclables' };
  if (t.includes('non') || t.includes('residual')) return { cls: 'is-residual', label: 'Residual' };
  if (t.includes('bio') || t.includes('nabubulok')) return { cls: 'is-bio', label: 'Biodegradable' };
  return { cls: 'is-residual', label: type || 'Mixed' };
};
const zoneShort = (zone) => String(zone || '').split(' - ')[0];

const Skeleton = ({ lines = 3 }) => (
  <div className="hs-skeleton" aria-hidden="true">
    {Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${90 - i * 15}%` }}></span>)}
  </div>
);

// ---------- saved per device (never required: private mode just forgets) ----------
const load = (key, fallback) => {
  try { const v = localStorage.getItem(key); return v ? JSON.parse(v) : fallback; } catch { return fallback; }
};
const save = (key, value) => { try { localStorage.setItem(key, JSON.stringify(value)); } catch { /* ignore */ } };

const LAYOUT_KEY = 'pb2_home_layout';
const PANEL_KEY = 'pb2_home_panel';
const READ_KEY = 'pb2_home_read';
const DEFAULT_LAYOUT = {
  order: ['advisory', 'requests', 'weather', 'garbage', 'street', 'issues', 'services', 'hotlines'],
  wide: {},
  hidden: [],
};
const PANEL = { min: 280, max: 560, step: 40, initial: 360 };

const statusTone = (s) => {
  const v = String(s || '').toLowerCase();
  if (/(ready|claimed|approved|completed|released)/.test(v)) return 'is-ok';
  if (/(declined|rejected|cancel)/.test(v)) return 'is-bad';
  return 'is-warn';
};

/**
 * "My Barangay" on the Home page: tiles residents can reorder, widen or hide
 * (Customize; saved on this device), and the announcements in a side panel
 * that can be resized (drag the divider, the ‹ › buttons or arrow keys) or
 * collapsed. Every drag has a button alternative (WCAG 2.2, 2.5.7).
 * Data comes from useHomeData() in Home.jsx, shared with the hero.
 */
const HomeSnapshot = ({ home, resident }) => {
  const { alert, posts, weather, hazards, waste, issues: issueData, requests, failed } = home;
  const [openPost, setOpenPost] = useState(null);

  // ---------- layout ----------
  const [layout, setLayout] = useState(() => {
    const saved = load(LAYOUT_KEY, null);
    if (!saved || !Array.isArray(saved.order)) return DEFAULT_LAYOUT;
    // Tiles added in a later version go to the end.
    const order = [...saved.order.filter((k) => DEFAULT_LAYOUT.order.includes(k)), ...DEFAULT_LAYOUT.order.filter((k) => !saved.order.includes(k))];
    return { order, wide: saved.wide || {}, hidden: (saved.hidden || []).filter((k) => DEFAULT_LAYOUT.order.includes(k)) };
  });
  const [customizing, setCustomizing] = useState(false);
  const [dragKey, setDragKey] = useState(null);
  const [dropKey, setDropKey] = useState(null);
  const focusAfter = useRef(null);
  const updateLayout = (next) => { setLayout(next); save(LAYOUT_KEY, next); };

  // ---------- panel ----------
  const [panel, setPanel] = useState(() => {
    const p = load(PANEL_KEY, {});
    return { w: Math.min(PANEL.max, Math.max(PANEL.min, Number(p.w) || PANEL.initial)), collapsed: !!p.collapsed };
  });
  const updatePanel = (next) => { setPanel(next); save(PANEL_KEY, next); };
  const setWidth = useCallback((w) => setPanel((p) => {
    const next = { ...p, w: Math.round(Math.min(PANEL.max, Math.max(PANEL.min, w))) };
    save(PANEL_KEY, next);
    return next;
  }), []);
  const [read, setRead] = useState(() => new Set(load(READ_KEY, [])));
  const [filter, setFilter] = useState('all');
  const layoutRef = useRef(null);
  const collapseRef = useRef(null);
  const expandRef = useRef(null);

  useEffect(() => {
    if (!focusAfter.current) return;
    const el = document.querySelector(focusAfter.current);
    focusAfter.current = null;
    if (el) el.focus();
  });

  // ---------- derived data ----------
  const today = new Date();
  const todayLabel = today.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });
  const lang = getAdvisoryLang();

  const w = weather?.weather;
  const todayKey = w?.current?.time?.slice(0, 10);
  const dIdx = w?.daily?.time ? w.daily.time.indexOf(todayKey) : -1;
  const now = w?.current ? getWeatherInfo(w.current.weather_code) : null;
  const nextDays = w?.daily?.time ? w.daily.time.map((d, i) => ({ d, i })).filter(({ i }) => i > dIdx).slice(0, 3) : [];
  const pagasa = hazards?.typhoon?.pagasa;
  const storm = pagasa?.storms?.[0];

  const week = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(today);
    d.setDate(today.getDate() + k);
    const name = DAY_NAMES[d.getDay()];
    const runs = (waste || []).filter((s) => String(s.collection_day || '').toUpperCase().includes(name));
    return { date: d, name, runs, isToday: k === 0 };
  });
  const todayRuns = week[0].runs;
  const notices = (waste || []).filter((s) => s.status && s.status !== 'Active');

  const issues = issueData ? { list: issueData.list, tiers: issueData.tiers || DEFAULT_TIERS } : null;
  const openIssues = (issues?.list || []).filter((i) => OPEN_STATUSES.includes(i.status));
  const topIssues = [...openIssues].sort((a, b) => b.report_count - a.report_count).slice(0, 3);
  const inProgress = openIssues.filter((i) => i.status === 'In Progress').length;

  const myRequests = [...(requests || [])]
    .sort((a, b) => String(b.requested_at || '').localeCompare(String(a.requested_at || '')))
    .slice(0, 3);

  // ---------- tiles ----------
  const TILES = {
    advisory: {
      title: 'Advisory', icon: 'bi-exclamation-triangle-fill', to: '/disaster-risk', linkLabel: 'Disaster risk', wide: true,
      className: alert ? `hm-advisory is-${String(alert.alert_level || 'advisory').toLowerCase()}` : 'hm-advisory is-clear',
      render: () => (alert === undefined ? <Skeleton lines={2} /> : alert ? (
        <>
          <p className="hm-adv-line"><span className="hm-pill is-warn">{alert.alert_level}</span> <strong>{advisoryText(alert, lang).title}</strong></p>
          <p className="hm-adv-text">{advisoryText(alert, lang).instructions}</p>
          <div className="hm-adv-actions">
            <Link to="/emergency" className="hs-btn-ghost"><i className="bi bi-life-preserver" aria-hidden="true"></i> Emergency info</Link>
            <Link to="/disaster-risk" className="hs-btn-ghost"><i className="bi bi-geo-alt" aria-hidden="true"></i> Evacuation centers</Link>
          </div>
        </>
      ) : (
        <p className="hm-adv-line"><span className="hm-pill is-ok">Clear</span> <strong>No active advisory</strong> <span className="hm-muted">Storm, flood and earthquake advisories appear here.</span></p>
      )),
    },
    requests: {
      title: 'My Requests', icon: 'bi-file-earmark-text', to: '/track-request', linkLabel: 'Track all', residentOnly: true,
      render: () => (!requests && !failed.requests ? <Skeleton lines={3} />
        : failed.requests ? <p className="hs-empty">Your requests could not be loaded right now.</p>
          : myRequests.length === 0 ? (
            <p className="hs-empty">No requests yet. <Link to="/services">Request a document</Link>.</p>
          ) : (
            <ul className="hm-req-list">
              {myRequests.map((r) => (
                <li key={`${r.type}-${r.tracking_code}`}>
                  <Link to={`/track-request?code=${encodeURIComponent(r.tracking_code)}`} className="hm-req-item">
                    <span><strong>{r.type}</strong><small>{r.tracking_code}</small></span>
                    <span className={`hm-pill ${statusTone(r.status)}`}>{r.status}</span>
                  </Link>
                </li>
              ))}
            </ul>
          )),
    },
    weather: {
      title: 'Weather today', icon: 'bi-cloud-sun-fill', to: '/disaster-risk', linkLabel: 'Forecast & alerts',
      render: () => (
        <>
          {!w && !failed.weather && <Skeleton lines={3} />}
          {failed.weather && !w && <p className="hs-empty">The forecast could not be loaded right now.</p>}
          {w && now && (
            <>
              <div className="hs-wx-now">
                <i className={`bi ${now.icon} hs-wx-icon is-${now.tone}`} aria-hidden="true"></i>
                <div>
                  <strong className="hs-wx-temp">{Math.round(w.current.temperature_2m)}°C</strong>
                  <span className="hs-wx-label">{now.label}</span>
                  <span className="hs-wx-sub">Feels like {Math.round(w.current.apparent_temperature)}° · Humidity {w.current.relative_humidity_2m}%</span>
                </div>
              </div>
              {dIdx >= 0 && (
                <ul className="hs-wx-facts">
                  <li><span>High / low</span><strong>{Math.round(w.daily.temperature_2m_max[dIdx])}° / {Math.round(w.daily.temperature_2m_min[dIdx])}°</strong></li>
                  <li><span>Chance of rain</span><strong>{w.daily.precipitation_probability_max?.[dIdx] ?? '–'}%</strong></li>
                  <li><span>Wind</span><strong>{Math.round(w.current.wind_speed_10m)} km/h</strong></li>
                </ul>
              )}
              <ul className="hs-wx-days">
                {nextDays.map(({ d, i }) => {
                  const info = getWeatherInfo(w.daily.weather_code[i]);
                  return (
                    <li key={d}>
                      <span>{i === dIdx + 1 ? 'Tomorrow' : new Date(d).toLocaleDateString('en-PH', { weekday: 'short' })}</span>
                      <i className={`bi ${info.icon} is-${info.tone}`} role="img" title={info.label} aria-label={info.label}></i>
                      <strong>{Math.round(w.daily.temperature_2m_max[i])}° / {Math.round(w.daily.temperature_2m_min[i])}°</strong>
                      <small>{w.daily.precipitation_probability_max?.[i] ?? '–'}% rain</small>
                    </li>
                  );
                })}
              </ul>
              {pagasa && (
                <p className={`hs-wx-pagasa${storm?.cavite_signal ? ' is-signal' : ''}`}>
                  <i className={`bi ${storm?.cavite_signal ? 'bi-flag-fill' : 'bi-hurricane'}`} aria-hidden="true"></i>
                  {!pagasa.active && 'PAGASA: no tropical cyclone inside the Philippine Area of Responsibility.'}
                  {pagasa.active && storm && `PAGASA: ${storm.category} ${storm.name}${storm.cavite_signal ? `, Signal No. ${storm.cavite_signal} over Cavite` : ', no signal over Cavite'}.`}
                  {pagasa.active && !storm && 'PAGASA has an active storm bulletin. Open Forecast & alerts.'}
                </p>
              )}
              <p className="hs-source">Open-Meteo model forecast, updated {weather.source?.updated_at ? timeOf(weather.source.updated_at) : 'recently'}. Not an official PAGASA forecast.</p>
            </>
          )}
        </>
      ),
    },
    garbage: {
      title: 'Garbage collection', icon: 'bi-trash3-fill', to: '/waste-management', linkLabel: 'Schedules & routes', wide: true,
      render: () => (
        <>
          {!waste && !failed.waste && <Skeleton lines={2} />}
          {failed.waste && <p className="hs-empty">The collection schedule could not be loaded right now.</p>}
          {waste && (
            <>
              <p className="hs-waste-today">
                <strong>Today:</strong>{' '}
                {todayRuns.length === 0
                  ? 'No collection scheduled.'
                  : todayRuns.map((s) => `${zoneShort(s.zone_area)} (${s.collection_time}, ${wasteKind(s.waste_type).label})`).join(' · ')}
              </p>
              {/* Scrolls sideways on narrow tiles: focusable so arrow keys can scroll it (WCAG 2.1.1). */}
              <ol className="hs-week" tabIndex={0} aria-label="Garbage collection, next 7 days">
                {week.map((day) => (
                  <li key={day.name} className={`${day.isToday ? 'is-today' : ''}${day.runs.length === 0 ? ' is-none' : ''}`}>
                    <span className="hs-week-day">{day.isToday ? 'Today' : day.date.toLocaleDateString('en-PH', { weekday: 'short' })}</span>
                    <span className="hs-week-date">{day.date.getDate()}</span>
                    {day.runs.length === 0 ? (
                      <span className="hs-week-none">No pickup</span>
                    ) : day.runs.map((s) => {
                      const kind = wasteKind(s.waste_type);
                      return (
                        <span key={s.id} className={`hs-week-run ${kind.cls}${s.status !== 'Active' ? ' is-changed' : ''}`} title={`${s.zone_area} · ${s.collection_time} · ${s.waste_type}${s.status !== 'Active' ? ` · ${s.status}` : ''}`}>
                          <b>{zoneShort(s.zone_area)}</b>
                          <small>{kind.label}</small>
                          {s.status !== 'Active' && <em>{s.status}</em>}
                        </span>
                      );
                    })}
                  </li>
                ))}
              </ol>
              {notices.length > 0 && (
                <ul className="hs-waste-notices">
                  {notices.map((s) => (
                    <li key={s.id}><i className="bi bi-info-circle-fill" aria-hidden="true"></i> <strong>{zoneShort(s.zone_area)}: {s.status}.</strong> {s.notes || 'See Schedules & routes for details.'}</li>
                  ))}
                </ul>
              )}
            </>
          )}
        </>
      ),
    },
    street: {
      title: 'My street', icon: 'bi-water', to: '/preparedness', linkLabel: 'Be prepared', residentOnly: true,
      render: () => <StreetFloodRisk mine compact />,
    },
    issues: {
      title: 'Community issues', icon: 'bi-flag-fill', to: '/issue-map', linkLabel: 'Open the map',
      render: () => (
        <>
          {!issues && !failed.issues && <Skeleton lines={3} />}
          {failed.issues && <p className="hs-empty">The issue map could not be loaded right now.</p>}
          {issues && (
            <>
              <div className="hs-issue-stats">
                <div><strong>{openIssues.length}</strong><span>open</span></div>
                <div><strong>{inProgress}</strong><span>being fixed</span></div>
              </div>
              {topIssues.length === 0 ? (
                <p className="hs-empty">No open problems reported. See a broken streetlight or flooding? Pin it on the map.</p>
              ) : (
                <ul className="hs-issue-list">
                  {topIssues.map((i) => {
                    const tier = tierOf(i.report_count, issues.tiers);
                    const cat = CATEGORY_LOOKUP[i.category];
                    return (
                      <li key={i.issue_id}>
                        <Link to={`/issue-map?issue=${i.issue_id}`} className="hs-issue-item">
                          <span className="hs-issue-flag" style={{ background: TIER_COLORS[tier] }} aria-hidden="true">{cat?.emoji || '!'}</span>
                          <span className="hs-issue-main">
                            <strong>{cat?.label || i.category_label}</strong>
                            <small>{i.landmark || 'Location on map'} · {i.report_count} report{i.report_count === 1 ? '' : 's'} · {i.status}</small>
                          </span>
                          <i className="bi bi-chevron-right" aria-hidden="true"></i>
                        </Link>
                      </li>
                    );
                  })}
                </ul>
              )}
              <Link to="/issue-map" className="hs-btn-ghost"><i className="bi bi-geo-alt-fill" aria-hidden="true"></i> Report a problem</Link>
            </>
          )}
        </>
      ),
    },
    services: {
      title: 'Quick services', icon: 'bi-grid-fill', wide: true,
      render: () => (
        <>
          <ul className="hs-quick-grid">
            {[
              ['/services', 'bi-file-earmark-text', 'Request a document', 'Clearance, residency, ID…'],
              ['/track-request', 'bi-search', 'Track my requests', 'Status and payments'],
              ['/amenity-reservation', 'bi-calendar-check', 'Book a facility', 'Court, hall, vehicles'],
              ['/incident-report', 'bi-shield-exclamation', 'Report an incident', 'Sent to barangay staff'],
              ['/preparedness', 'bi-shield-check', 'Be prepared', 'Flood risk and checklists'],
              ['/about', 'bi-people-fill', 'Barangay council', 'Officials and history'],
            ].map(([to, icon, label, sub]) => (
              <li key={to}>
                <Link to={to} className="hs-quick-item">
                  <i className={`bi ${icon}`} aria-hidden="true"></i>
                  <span><strong>{label}</strong><small>{sub}</small></span>
                </Link>
              </li>
            ))}
          </ul>
          {!resident && (
            <p className="hs-signin">
              <i className="bi bi-person-circle" aria-hidden="true"></i> <Link to="/login">Sign in</Link> or <Link to="/register">create an account</Link> to request documents and track them.
            </p>
          )}
        </>
      ),
    },
    hotlines: {
      title: 'Emergency hotlines', icon: 'bi-telephone-fill', to: '/preparedness#prep-hotlines', linkLabel: 'All hotlines',
      render: () => <EmergencyHotlines compact limit={4} />,
    },
  };

  const shown = layout.order.filter((k) => TILES[k] && !layout.hidden.includes(k) && (resident || !TILES[k].residentOnly));
  const hiddenShown = layout.hidden.filter((k) => TILES[k] && (resident || !TILES[k].residentOnly));
  const isWide = (k) => layout.wide[k] ?? !!TILES[k].wide;

  const move = (k, dir) => {
    const i = shown.indexOf(k);
    const j = i + dir;
    if (j < 0 || j >= shown.length) return;
    const order = [...layout.order];
    const a = order.indexOf(shown[i]);
    const b = order.indexOf(shown[j]);
    [order[a], order[b]] = [order[b], order[a]];
    focusAfter.current = `[data-tile="${k}"] [data-act="${dir < 0 ? 'up' : 'down'}"]:not(:disabled), [data-tile="${k}"] [data-act="size"]`;
    updateLayout({ ...layout, order });
  };
  const toggleWide = (k) => {
    focusAfter.current = `[data-tile="${k}"] [data-act="size"]`;
    updateLayout({ ...layout, wide: { ...layout.wide, [k]: !isWide(k) } });
  };
  const hide = (k) => {
    focusAfter.current = '#hm-customize';
    updateLayout({ ...layout, hidden: [...layout.hidden, k] });
  };
  const unhide = (k) => {
    focusAfter.current = `[data-tile="${k}"] [data-act="hide"]`;
    updateLayout({ ...layout, hidden: layout.hidden.filter((x) => x !== k) });
  };
  const dropOn = (target) => {
    if (!dragKey || dragKey === target) return;
    const order = layout.order.filter((x) => x !== dragKey);
    order.splice(order.indexOf(target), 0, dragKey);
    updateLayout({ ...layout, order });
  };

  // ---------- announcements ----------
  const unread = (posts || []).filter((p) => !read.has(p.announcement_id)).length;
  const visiblePosts = (posts || []).filter((p) => filter === 'all'
    || (filter === 'unread' && !read.has(p.announcement_id))
    || (filter === 'for-me' && p.audience_type && p.audience_type !== 'Everyone'));
  const openAnnouncement = (p) => {
    const next = new Set(read);
    next.add(p.announcement_id);
    setRead(next);
    save(READ_KEY, [...next].slice(-200));
    setOpenPost(p);
  };
  const roomy = panel.w >= 420;

  // Divider: drag with a pointer, or the arrow keys when it has focus.
  const onResizerDown = (e) => {
    const el = e.currentTarget;
    el.setPointerCapture(e.pointerId);
    el.classList.add('is-active');
    const right = layoutRef.current.getBoundingClientRect().right;
    const onMove = (ev) => setWidth(right - ev.clientX - 6);
    const onUp = () => {
      el.classList.remove('is-active');
      el.removeEventListener('pointermove', onMove);
      el.removeEventListener('pointerup', onUp);
      el.removeEventListener('pointercancel', onUp);
    };
    el.addEventListener('pointermove', onMove);
    el.addEventListener('pointerup', onUp);
    el.addEventListener('pointercancel', onUp);
  };
  const onResizerKey = (e) => {
    const map = { ArrowLeft: panel.w + 20, ArrowRight: panel.w - 20, Home: PANEL.max, End: PANEL.min };
    if (e.key in map) { e.preventDefault(); setWidth(map[e.key]); }
  };

  return (
    <div className="hs-wrap hm-wrap" id="today" role="region" aria-labelledby="hs-title">
      <div
        ref={layoutRef}
        className={`hm-layout${panel.collapsed ? ' is-collapsed' : ''}`}
        style={{ '--hm-panel-w': `${panel.w}px` }}
      >
        {/* ---------------- My Barangay ---------------- */}
        <section className={`hm-dash${customizing ? ' is-customizing' : ''}`} aria-labelledby="hs-title">
          <div className="hm-dash-head">
            <div>
              <span className="hs-kicker">{todayLabel}</span>
              <h2 id="hs-title">My Barangay</h2>
            </div>
            <p className="hm-muted hm-dash-hint">
              {customizing ? 'Drag tiles, or use the arrows. Your layout is saved on this device.' : 'Your barangay today. Tap any tile to see more.'}
            </p>
            <div className="hm-dash-tools">
              <button type="button" id="hm-customize" className={`hm-btn${customizing ? ' is-on' : ''}`} aria-pressed={customizing} onClick={() => setCustomizing((c) => !c)}>
                <i className={`bi ${customizing ? 'bi-check2' : 'bi-grid-3x3-gap'}`} aria-hidden="true"></i> {customizing ? 'Done' : 'Customize'}
              </button>
              {customizing && (
                <button type="button" className="hm-btn" onClick={() => updateLayout(DEFAULT_LAYOUT)}>
                  <i className="bi bi-arrow-counterclockwise" aria-hidden="true"></i> Reset layout
                </button>
              )}
            </div>
          </div>

          {customizing && hiddenShown.length > 0 && (
            <div className="hm-hidden-tray">
              <span className="hm-muted">Hidden:</span>
              {hiddenShown.map((k) => (
                <button type="button" key={k} onClick={() => unhide(k)}><i className="bi bi-plus" aria-hidden="true"></i> {TILES[k].title}</button>
              ))}
            </div>
          )}

          <div className="hm-tiles">
            {shown.map((k, idx) => {
              const t = TILES[k];
              return (
                <article
                  key={k}
                  data-tile={k}
                  aria-labelledby={`hm-t-${k}`}
                  className={`hs-card hm-tile ${t.className || ''}${isWide(k) ? ' is-wide' : ''}${dragKey === k ? ' is-dragging' : ''}${dropKey === k && dragKey !== k ? ' is-drop' : ''}`}
                  draggable={customizing}
                  onDragStart={(e) => { setDragKey(k); e.dataTransfer.effectAllowed = 'move'; e.dataTransfer.setData('text/plain', k); }}
                  onDragEnd={() => { setDragKey(null); setDropKey(null); }}
                  onDragOver={(e) => { if (dragKey) { e.preventDefault(); setDropKey(k); } }}
                  onDrop={(e) => { e.preventDefault(); dropOn(k); setDragKey(null); setDropKey(null); }}
                >
                  <div className="hs-card-head hm-tile-head">
                    {customizing && <i className="bi bi-grip-vertical hm-grip" aria-hidden="true"></i>}
                    <h3 id={`hm-t-${k}`}><i className={`bi ${t.icon}`} aria-hidden="true"></i> {t.title}</h3>
                    {!customizing && t.to && <Link to={t.to} className="hs-more">{t.linkLabel} <i className="bi bi-arrow-right" aria-hidden="true"></i></Link>}
                    {customizing && (
                      <span className="hm-tile-tools">
                        <button type="button" className="hm-icon-btn" data-act="up" disabled={idx === 0} onClick={() => move(k, -1)} aria-label={`Move ${t.title} earlier`}><i className="bi bi-arrow-up" aria-hidden="true"></i></button>
                        <button type="button" className="hm-icon-btn" data-act="down" disabled={idx === shown.length - 1} onClick={() => move(k, 1)} aria-label={`Move ${t.title} later`}><i className="bi bi-arrow-down" aria-hidden="true"></i></button>
                        <button type="button" className="hm-icon-btn" data-act="size" onClick={() => toggleWide(k)} aria-label={isWide(k) ? `Make ${t.title} narrow` : `Make ${t.title} wide`}><i className={`bi ${isWide(k) ? 'bi-arrows-angle-contract' : 'bi-arrows-angle-expand'}`} aria-hidden="true"></i></button>
                        <button type="button" className="hm-icon-btn" data-act="hide" onClick={() => hide(k)} aria-label={`Hide ${t.title}`}><i className="bi bi-eye-slash" aria-hidden="true"></i></button>
                      </span>
                    )}
                  </div>
                  {t.render()}
                </article>
              );
            })}
          </div>
        </section>

        {/* ---------------- divider ---------------- */}
        <div
          className="hm-resizer"
          role="separator"
          tabIndex={0}
          aria-orientation="vertical"
          aria-label="Resize the announcements panel"
          aria-controls="hm-panel"
          aria-valuemin={PANEL.min}
          aria-valuemax={PANEL.max}
          aria-valuenow={panel.w}
          aria-valuetext={`${panel.w} pixels wide`}
          onPointerDown={onResizerDown}
          onKeyDown={onResizerKey}
        >
          <span className="hm-resizer-knob" aria-hidden="true"></span>
        </div>

        {/* ---------------- announcements ---------------- */}
        <aside id="hm-panel" className={`hs-card hm-panel${roomy ? ' is-roomy' : ''}`} aria-labelledby="hm-ann-title">
          <div className="hm-panel-head">
            <h2 id="hm-ann-title"><i className="bi bi-megaphone-fill" aria-hidden="true"></i> Announcements {unread > 0 && <span className="hm-badge">{unread} new</span>}</h2>
            <div className="hm-panel-tools">
              <button type="button" className="hm-icon-btn" onClick={() => setWidth(panel.w - PANEL.step)} disabled={panel.w <= PANEL.min} aria-label="Make the panel narrower" title="Narrower"><i className="bi bi-chevron-right" aria-hidden="true"></i></button>
              <button type="button" className="hm-icon-btn" onClick={() => setWidth(panel.w + PANEL.step)} disabled={panel.w >= PANEL.max} aria-label="Make the panel wider" title="Wider"><i className="bi bi-chevron-left" aria-hidden="true"></i></button>
              <button type="button" ref={collapseRef} className="hm-icon-btn" onClick={() => { updatePanel({ ...panel, collapsed: true }); setTimeout(() => expandRef.current?.focus(), 0); }} aria-label="Collapse the announcements panel" title="Collapse"><i className="bi bi-layout-sidebar-inset-reverse" aria-hidden="true"></i></button>
            </div>
          </div>
          <div className="hm-panel-filters" role="group" aria-label="Show">
            {[['all', 'All'], ['unread', 'Unread'], ['for-me', 'For me']].map(([k, l]) => (
              <button type="button" key={k} aria-pressed={filter === k} onClick={() => setFilter(k)}>{l}</button>
            ))}
          </div>
          <div className="hm-posts-wrap">
            {!posts && !failed.posts && <Skeleton lines={4} />}
            {failed.posts && <p className="hs-empty">Announcements could not be loaded right now.</p>}
            {posts && visiblePosts.length === 0 && (
              <p className="hs-empty">{posts.length === 0 ? 'No announcements at the moment.' : filter === 'unread' ? "You're all caught up." : 'Nothing here.'}</p>
            )}
            {posts && visiblePosts.length > 0 && (
              <ul className="hm-posts">
                {visiblePosts.map((p) => {
                  const img = p.images?.[0];
                  const tag = audienceTag(p);
                  const isNew = !read.has(p.announcement_id);
                  return (
                    <li key={p.announcement_id}>
                      <button type="button" className="hm-post" onClick={() => openAnnouncement(p)}>
                        {img ? (
                          <img src={`${FILES_BASE}/${img.image_path}`} alt="" loading="lazy" />
                        ) : (
                          <span className="hm-post-icon" aria-hidden="true"><i className="bi bi-megaphone"></i></span>
                        )}
                        <span className="hm-post-text">
                          <span className="hm-post-title">
                            {isNew && <span className="hm-dot" aria-hidden="true"></span>}
                            <span>{headlineOf(p)}{isNew && <span className="sr-only"> (new)</span>}</span>
                          </span>
                          <span className="hm-post-meta">
                            {isPinned(p) && <b className="hs-ann-pin"><i className="bi bi-pin-angle-fill" aria-hidden="true"></i> Pinned</b>}
                            {tag && <em>{tag}</em>}
                            <span>{shortDate(p.created_at)}</span>
                          </span>
                          {roomy && p.caption && <span className="hm-post-excerpt">{String(p.caption).slice(0, 140)}{String(p.caption).length > 140 ? '…' : ''}</span>}
                        </span>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
          <div className="hm-panel-foot">
            <Link to="/announcements">See all announcements <i className="bi bi-arrow-right" aria-hidden="true"></i></Link>
          </div>
        </aside>

        <button
          type="button"
          ref={expandRef}
          className="hm-panel-tab"
          onClick={() => { updatePanel({ ...panel, collapsed: false }); setTimeout(() => collapseRef.current?.focus(), 0); }}
          aria-label={`Open the announcements panel${unread ? `, ${unread} new` : ''}`}
        >
          <i className="bi bi-megaphone-fill" aria-hidden="true"></i> Announcements {unread > 0 && <span className="hm-badge">{unread}</span>}
        </button>
      </div>

      {openPost && <AnnouncementModal post={openPost} onClose={() => setOpenPost(null)} />}
    </div>
  );
};

export default HomeSnapshot;
