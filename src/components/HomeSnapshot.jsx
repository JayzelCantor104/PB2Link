import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import AnnouncementModal from './AnnouncementModal';
import { audienceTag, headlineOf, isPinned, UPLOADS_BASE } from './announcementUtils';
import { CATEGORY_LOOKUP, DEFAULT_TIERS, OPEN_STATUSES, TIER_COLORS, tierOf } from './issueMapConfig';
import { getWeatherInfo } from '../lib/weatherCodes';
import '../styles/home-snapshot.css';

const API_BASE = '/api_backend';
const REFRESH_MS = 10 * 60 * 1000;

const getJson = (url) => fetch(url, { credentials: 'include' }).then((r) => r.json());

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

const Card = ({ icon, title, to, linkLabel, className = '', children }) => (
  <article className={`hs-card ${className}`}>
    <div className="hs-card-head">
      <h3><i className={`bi ${icon}`} aria-hidden="true"></i> {title}</h3>
      {to && <Link to={to} className="hs-more">{linkLabel} <i className="bi bi-arrow-right" aria-hidden="true"></i></Link>}
    </div>
    {children}
  </article>
);

const Skeleton = ({ lines = 3 }) => (
  <div className="hs-skeleton" aria-hidden="true">
    {Array.from({ length: lines }, (_, i) => <span key={i} style={{ width: `${90 - i * 15}%` }}></span>)}
  </div>
);

/**
 * Home page "today" snapshot: active advisory, latest announcements, weather,
 * this week's garbage collection, community issues and quick services.
 * Each card is a summary; its link goes to the page where the service lives.
 */
const HomeSnapshot = () => {
  const { user } = useAuth();
  const [alert, setAlert] = useState(undefined);
  const [posts, setPosts] = useState(null);
  const [weather, setWeather] = useState(null);
  const [hazards, setHazards] = useState(null);
  const [waste, setWaste] = useState(null);
  const [issues, setIssues] = useState(null);
  const [failed, setFailed] = useState({});
  const [openPost, setOpenPost] = useState(null);

  useEffect(() => {
    const fail = (key) => () => setFailed((f) => ({ ...f, [key]: true }));
    const load = () => {
      getJson(`${API_BASE}/disaster_risk.php?action=get_all`)
        .then((d) => setAlert((d.alerts || []).find((a) => Number(a.is_active) === 1) || null))
        .catch(() => setAlert(null));
      getJson(`${API_BASE}/get_public_announcements.php`)
        .then((d) => setPosts(d.success ? d.data || [] : []))
        .catch(fail('posts'));
      getJson(`${API_BASE}/hazard_feeds.php?action=weather`)
        .then((d) => (d.success ? setWeather(d) : fail('weather')()))
        .catch(fail('weather'));
      getJson(`${API_BASE}/hazard_feeds.php?action=live`)
        .then((d) => d.success && setHazards(d))
        .catch(() => {});
      getJson(`${API_BASE}/waste_management.php?action=get_all`)
        .then((d) => setWaste(d.schedules || []))
        .catch(fail('waste'));
      getJson(`${API_BASE}/issue_map.php?action=list`)
        .then((d) => setIssues(d.success ? { list: d.issues || [], tiers: d.tiers || DEFAULT_TIERS } : { list: [], tiers: DEFAULT_TIERS }))
        .catch(fail('issues'));
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, []);

  const today = new Date();
  const todayLabel = today.toLocaleDateString('en-PH', { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' });

  // ---------- weather ----------
  const w = weather?.weather;
  const todayKey = w?.current?.time?.slice(0, 10);
  const dIdx = w?.daily?.time ? w.daily.time.indexOf(todayKey) : -1;
  const now = w?.current ? getWeatherInfo(w.current.weather_code) : null;
  const nextDays = w?.daily?.time ? w.daily.time.map((d, i) => ({ d, i })).filter(({ i }) => i > dIdx).slice(0, 3) : [];
  const pagasa = hazards?.typhoon?.pagasa;
  const storm = pagasa?.storms?.[0];

  // ---------- waste: the next 7 days ----------
  const week = Array.from({ length: 7 }, (_, k) => {
    const d = new Date(today);
    d.setDate(today.getDate() + k);
    const name = DAY_NAMES[d.getDay()];
    const runs = (waste || []).filter((s) => String(s.collection_day || '').toUpperCase().includes(name));
    return { date: d, name, runs, isToday: k === 0 };
  });
  const todayRuns = week[0].runs;
  const notices = (waste || []).filter((s) => s.status && s.status !== 'Active');

  // ---------- issues ----------
  const openIssues = (issues?.list || []).filter((i) => OPEN_STATUSES.includes(i.status));
  const topIssues = [...openIssues].sort((a, b) => b.report_count - a.report_count).slice(0, 3);
  const inProgress = openIssues.filter((i) => i.status === 'In Progress').length;

  const levelCls = alert ? `is-${String(alert.alert_level || 'advisory').toLowerCase()}` : '';

  return (
    <div className="hs-wrap" id="today" role="region" aria-labelledby="hs-title">
      <div className="hs-container">
        <div className="hs-title-row">
          <div>
            <span className="hs-kicker">Your barangay today</span>
            <h2 id="hs-title">{todayLabel}</h2>
          </div>
          <p>A quick look at what matters in Pasong Buaya II. Tap any card to see more.</p>
        </div>

        {/* Active advisory: always first when there is one */}
        {alert && (
          <Link to="/disaster-risk" className={`hs-alert ${levelCls}`}>
            <i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i>
            <span className="hs-alert-main">
              <span className="hs-alert-level">{alert.alert_level} alert · {alert.calamity_type}</span>
              <strong>{alert.title}</strong>
              <small>{alert.instructions}</small>
            </span>
            <span className="hs-alert-cta">Evacuation centers & hotlines <i className="bi bi-arrow-right"></i></span>
          </Link>
        )}

        <div className="hs-grid">
          {/* ---- Announcements ---- */}
          <Card icon="bi-megaphone-fill" title="Latest announcements" to="/announcements" linkLabel="All announcements" className="hs-ann">
            {!posts && !failed.posts && <Skeleton lines={4} />}
            {failed.posts && <p className="hs-empty">Announcements could not be loaded right now.</p>}
            {posts && posts.length === 0 && <p className="hs-empty">No announcements at the moment.</p>}
            {posts && posts.length > 0 && (
              <ul className="hs-ann-list">
                {posts.slice(0, 4).map((p) => {
                  const img = p.images?.[0];
                  const tag = audienceTag(p);
                  return (
                    <li key={p.announcement_id}>
                      <button type="button" className={`hs-ann-item${isPinned(p) ? ' is-pinned' : ''}`} onClick={() => setOpenPost(p)}>
                        {img ? (
                          <img src={`${UPLOADS_BASE}/${img.image_path}`} alt="" loading="lazy" />
                        ) : (
                          <span className="hs-ann-icon" aria-hidden="true"><i className="bi bi-megaphone"></i></span>
                        )}
                        <span className="hs-ann-text">
                          <span className="hs-ann-headline">{headlineOf(p)}</span>
                          <span className="hs-ann-meta">
                            {isPinned(p) && <b className="hs-ann-pin"><i className="bi bi-pin-angle-fill" aria-hidden="true"></i> Pinned</b>}
                            {shortDate(p.created_at)}
                            {tag && <em>{tag}</em>}
                          </span>
                        </span>
                        <i className="bi bi-chevron-right hs-ann-go" aria-hidden="true"></i>
                      </button>
                    </li>
                  );
                })}
              </ul>
            )}
          </Card>

          {/* ---- Weather ---- */}
          <Card icon="bi-cloud-sun-fill" title="Weather today" to="/disaster-risk" linkLabel="Forecast & alerts" className="hs-weather">
            {!w && !failed.weather && <Skeleton lines={3} />}
            {failed.weather && !w && <p className="hs-empty">The forecast could not be loaded right now.</p>}
            {w && now && (
              <>
                <div className="hs-wx-body">
                <div className="hs-wx-col">
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
                </div>
                <div className="hs-wx-col">
                <span className="hs-wx-sublabel">Next days</span>
                <ul className="hs-wx-days">
                  {nextDays.map(({ d, i }) => {
                    const info = getWeatherInfo(w.daily.weather_code[i]);
                    return (
                      <li key={d}>
                        <span>{i === dIdx + 1 ? 'Tomorrow' : new Date(d).toLocaleDateString('en-PH', { weekday: 'short' })}</span>
                        <i className={`bi ${info.icon} is-${info.tone}`} title={info.label} aria-label={info.label}></i>
                        <strong>{Math.round(w.daily.temperature_2m_max[i])}° / {Math.round(w.daily.temperature_2m_min[i])}°</strong>
                        <small>{w.daily.precipitation_probability_max?.[i] ?? '–'}% rain</small>
                      </li>
                    );
                  })}
                </ul>
                </div>
                </div>
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
          </Card>

          {/* ---- Garbage collection this week ---- */}
          <Card icon="bi-trash3-fill" title="Garbage collection this week" to="/waste-management" linkLabel="Schedules & routes" className="hs-waste">
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
                <ol className="hs-week">
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
          </Card>

          {/* ---- Community issues ---- */}
          <Card icon="bi-flag-fill" title="Community issues" to="/issue-map" linkLabel="Open the map" className="hs-issues">
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
          </Card>

          {/* ---- Quick services ---- */}
          <Card icon="bi-grid-fill" title="Quick services" className="hs-quick">
            <ul className="hs-quick-grid">
              {[
                ['/services', 'bi-file-earmark-text', 'Request a document', 'Clearance, residency, ID…'],
                ['/track-request', 'bi-search', 'Track my requests', 'Status and payments'],
                ['/amenity-reservation', 'bi-calendar-check', 'Book a facility', 'Court, hall, vehicles'],
                ['/incident-report', 'bi-shield-exclamation', 'Report an incident', 'Sent to barangay staff'],
                ['/disaster-risk', 'bi-telephone-fill', 'Emergency hotlines', 'Evacuation centers too'],
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
            {!user && (
              <p className="hs-signin">
                <i className="bi bi-person-circle" aria-hidden="true"></i> <Link to="/login">Sign in</Link> or <Link to="/register">create an account</Link> to request documents and track them.
              </p>
            )}
          </Card>
        </div>
      </div>

      {openPost && <AnnouncementModal post={openPost} onClose={() => setOpenPost(null)} />}
    </div>
  );
};

export default HomeSnapshot;
