import { useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { prefersReducedMotion } from '../lib/a11yPrefs';
import { getWeatherInfo } from '../lib/weatherCodes';
import { FLOOD_LEVELS } from '../lib/preparedness';
import { advisoryText, getAdvisoryLang } from '../lib/advisoryLanguage';
import { OPEN_STATUSES } from './issueMapConfig';
import HomeSearch from './HomeSearch';
import HeroLiveMap from './HeroLiveMap';
import '../styles/home-hero.css';

const DAY_NAMES = ['SUNDAY', 'MONDAY', 'TUESDAY', 'WEDNESDAY', 'THURSDAY', 'FRIDAY', 'SATURDAY'];
const wasteLabel = (type) => {
  const t = String(type || '').toLowerCase();
  if (t.includes('hazard') || t.includes('special')) return 'Hazardous';
  if (t.includes('recycl')) return 'Recyclables';
  if (t.includes('non') || t.includes('residual')) return 'Residual';
  if (t.includes('bio') || t.includes('nabubulok')) return 'Biodegradable';
  return type || 'Mixed';
};

/**
 * Home welcome bar. Left: the portal's headline and the "What do you need
 * today?" search. Right: the live barangay map and four status chips
 * (advisory, weather, garbage today, the resident's street or open issues).
 * Data comes from useHomeData() in Home.jsx, shared with the dashboard.
 */
const Hero = ({ home, resident }) => {
  const canvasRef = useRef(null);

  // The particle network behind the headline, sized to this section.
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;
    const ctx = canvas.getContext('2d');
    const section = canvas.parentElement;
    const still = prefersReducedMotion(); // the device setting or the Accessibility menu
    let frame = 0;
    let particles = [];
    let onScreen = true;
    const mouse = { x: null, y: null };

    const resize = () => {
      canvas.width = section.clientWidth;
      canvas.height = section.clientHeight;
    };
    const onMouse = (e) => {
      const r = canvas.getBoundingClientRect();
      mouse.x = e.clientX - r.left;
      mouse.y = e.clientY - r.top;
    };
    const init = () => {
      const count = Math.round(Math.min(70, (canvas.width * canvas.height) / 14000));
      particles = Array.from({ length: count }, () => ({
        x: Math.random() * canvas.width, y: Math.random() * canvas.height,
        size: Math.random() * 2.5, vx: Math.random() * 1.5 - 0.75, vy: Math.random() * 1.5 - 0.75,
      }));
    };
    const draw = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      for (let i = 0; i < particles.length; i++) {
        const p = particles[i];
        if (!still) {
          p.x += p.vx; p.y += p.vy;
          if (p.x > canvas.width || p.x < 0) p.vx *= -1;
          if (p.y > canvas.height || p.y < 0) p.vy *= -1;
          const dx = mouse.x - p.x; const dy = mouse.y - p.y;
          if (mouse.x !== null && Math.hypot(dx, dy) < 120) { p.x -= dx / 20; p.y -= dy / 20; }
        }
        ctx.fillStyle = 'rgba(255,255,255,0.7)';
        ctx.beginPath(); ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2); ctx.fill();
        for (let j = i; j < particles.length; j++) {
          const q = particles[j];
          const dist = Math.hypot(p.x - q.x, p.y - q.y);
          if (dist < 120) {
            ctx.beginPath();
            ctx.strokeStyle = `rgba(255, 255, 255, ${0.8 - dist / 120})`;
            ctx.lineWidth = 0.8;
            ctx.moveTo(p.x, p.y); ctx.lineTo(q.x, q.y); ctx.stroke();
          }
        }
      }
      if (!still && onScreen && !document.hidden) frame = requestAnimationFrame(draw);
    };
    const resume = () => { cancelAnimationFrame(frame); if (!still && onScreen && !document.hidden) frame = requestAnimationFrame(draw); };

    resize(); init(); draw();
    const ro = new ResizeObserver(() => { resize(); init(); if (still) draw(); });
    ro.observe(section);
    // Pause while scrolled away or in a background tab.
    const io = new IntersectionObserver(([e]) => { onScreen = e.isIntersecting; resume(); });
    io.observe(section);
    document.addEventListener('visibilitychange', resume);
    if (!still) section.addEventListener('mousemove', onMouse);
    return () => {
      cancelAnimationFrame(frame);
      ro.disconnect(); io.disconnect();
      document.removeEventListener('visibilitychange', resume);
      section.removeEventListener('mousemove', onMouse);
    };
  }, []);

  // ---- status chips ----
  const { alert, weather, waste, street, issues } = home;
  const lang = getAdvisoryLang();
  const w = weather?.weather;
  const todayKey = w?.current?.time?.slice(0, 10);
  const dIdx = w?.daily?.time ? w.daily.time.indexOf(todayKey) : -1;
  const now = w?.current ? getWeatherInfo(w.current.weather_code) : null;
  const todayName = DAY_NAMES[new Date().getDay()];
  const todayRuns = (waste || []).filter((s) => String(s.collection_day || '').toUpperCase().includes(todayName));
  const openIssues = (issues?.list || []).filter((i) => OPEN_STATUSES.includes(i.status)).length;
  const flood = street && street.flood_level !== null && street.flood_level !== undefined ? FLOOD_LEVELS[street.flood_level] : null;

  const chips = [
    alert === undefined
      ? { to: '/disaster-risk', icon: 'bi-shield', k: 'Advisory', v: 'Loading…' }
      : alert
        ? { to: '/disaster-risk', icon: 'bi-exclamation-triangle-fill', k: `Advisory · ${alert.alert_level}`, v: advisoryText(alert, lang).title, alert: true }
        : { to: '/disaster-risk', icon: 'bi-shield-check', k: 'Advisory', v: 'No active advisory' },
    {
      to: '/disaster-risk', icon: now ? now.icon : 'bi-cloud-sun', k: 'Weather',
      v: w ? `${Math.round(w.current.temperature_2m)}°C${dIdx >= 0 ? ` · ${w.daily.precipitation_probability_max?.[dIdx] ?? '–'}% rain` : ''}` : 'Loading…',
    },
    {
      to: '/waste-management', icon: 'bi-trash3-fill', k: 'Garbage today',
      v: !waste ? 'Loading…' : todayRuns.length === 0 ? 'No pickup today'
        : `${wasteLabel(todayRuns[0].waste_type)}${todayRuns[0].collection_time ? `, ${String(todayRuns[0].collection_time).split(/\s*[-–]\s*/)[0]}` : ''}`,
    },
    resident
      ? { to: '/preparedness', icon: 'bi-water', k: 'My street', v: flood ? flood.label : street ? 'Not mapped yet' : 'Loading…' }
      : { to: '/issue-map', icon: 'bi-flag-fill', k: 'Open issues', v: issues ? `${openIssues} reported` : 'Loading…' },
  ];

  return (
    <section className="hero-section hm-hero" aria-label="Welcome">
      <canvas ref={canvasRef} id="heroCanvas" aria-hidden="true" />

      <div className="hm-hero-grid">
        <div className="hero-content hm-hero-text">
          <div className="hero-label">
            <i className="bi bi-patch-check-fill" aria-hidden="true"></i> Official Government Portal
          </div>
          <h1>Governance at <br className="responsive-br" />Your Fingertips.</h1>
          <p>Experience a new standard of public service. Fast, transparent, and completely digital.</p>
          <HomeSearch />
          {!resident && (
            <p className="hm-hero-account">
              New here? <Link to="/register">Create an account</Link> · Already registered? <Link to="/login">Log in</Link>
            </p>
          )}
        </div>

        <div className="hm-hero-side">
          <HeroLiveMap centers={home.centers} issues={issues?.list} advisory={!!alert} />
          <ul className="hm-chips" aria-label="Your barangay today">
            {chips.map((c) => (
              <li key={c.k}>
                <Link to={c.to} className={`hm-chip${c.alert ? ' is-alert' : ''}`}>
                  <i className={`bi ${c.icon}`} aria-hidden="true"></i>
                  <span><small>{c.k}</small><strong>{c.v}</strong></span>
                </Link>
              </li>
            ))}
          </ul>
        </div>
      </div>
    </section>
  );
};

export default Hero;
