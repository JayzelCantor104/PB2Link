import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { useLocation } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import { prefersReducedMotion } from '../lib/a11yPrefs';
import { TOURS, readTourState, tourForPath, writeTourState } from '../lib/tours';
import { ADMIN_TOURS } from '../lib/adminTours';
import '../styles/tour.css';

/*
 * Product tours for the resident pages (tour text in src/lib/tours.js).
 *
 *  - Help button (bottom right): take this page's tour, turn tips on or off.
 *  - First visit to a page with a tour: a small "Take a quick tour?" card.
 *  - Tour: the screen dims and one part is lit (spotlight) with a coach mark
 *    (Back / Next, step count). Arrow keys move, Escape ends it. Treated as a
 *    dialog: focus stays in the coach mark and returns afterwards.
 *  - Tips: pulsing dots (hotspots) on single features; a tap shows the tip,
 *    "Got it" removes that dot.
 * What this device has seen is kept in localStorage['pb2_tours'] (residents)
 * and 'pb2_tours_admin_<admin id>' (staff, one per admin: the hall's computers are shared).
 *
 * <ProductTour /> in App.jsx serves the resident pages; <ProductTour area="admin" />
 * in AdminLayout.jsx serves the staff pages (tour text in src/lib/adminTours.js).
 */

const AREAS = {
  resident: {
    tours: TOURS,
    shows: (p) => !p.startsWith('/admin') && p !== '/setup-password',
    noTour: 'This page has no tour yet. Tours are on the Home page, Services, request forms, My Requests, the Issue Map, Disaster Risk, Preparedness and Waste Management.',
  },
  admin: {
    tours: ADMIN_TOURS,
    shows: (p) => p.startsWith('/admin/'),
    noTour: 'This page has no tour yet. Tours are on the Dashboard and the main tabs: Residents, Documents, Services, Incidents, Amenities, Profile Approvals, Announcements, Waste, Disaster Risk, Issue Map, Payments and Manage Admins.',
  },
};

const PAD = 8;       // space around the lit element
const GAP = 14;      // space between it and the coach mark
const EDGE = 12;     // closest the coach mark gets to the screen edge

const isShown = (el) => {
  const r = el.getBoundingClientRect();
  if (r.width === 0 && r.height === 0) return false;
  const s = getComputedStyle(el);
  return s.visibility !== 'hidden' && s.display !== 'none';
};

// The first selector that matches something on screen.
const findTarget = (target) => {
  for (const sel of Array.isArray(target) ? target : [target]) {
    let list = [];
    try { list = document.querySelectorAll(sel); } catch { continue; }
    for (const el of list) if (isShown(el)) return el;
  }
  return null;
};

// when: 'resident' / 'guest' (resident pages), 'super' (Super Admins only).
const allowedFor = (signedIn, isSuper) => (item) => {
  if (!item.when) return true;
  if (item.when === 'super') return isSuper;
  return item.when === 'resident' ? signedIn : !signedIn;
};

const sameRect = (a, b) => a && b && Math.abs(a.top - b.top) < 0.5 && Math.abs(a.left - b.left) < 0.5
  && Math.abs(a.width - b.width) < 0.5 && Math.abs(a.height - b.height) < 0.5;

// Where the coach mark goes: below, above, right or left of the lit part,
// docked to the bottom or top on phones, centred when there is no target.
const placeCard = (rect, cardH) => {
  const vw = window.innerWidth;
  const vh = window.innerHeight;
  const w = Math.min(360, vw - EDGE * 2);
  const h = cardH || 200;
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(v, hi));
  if (!rect) return { style: { left: (vw - w) / 2, top: Math.max(EDGE, (vh - h) / 2), width: w }, side: 'none' };
  if (vw < 640) {
    const lowerHalf = rect.top + rect.height / 2 > vh / 2;
    return { style: lowerHalf ? { left: EDGE, right: EDGE, top: EDGE } : { left: EDGE, right: EDGE, bottom: EDGE }, side: 'dock' };
  }
  const centerX = rect.left + rect.width / 2;
  const left = clamp(centerX - w / 2, EDGE, vw - w - EDGE);
  const arrow = clamp(centerX - left, 22, w - 22);
  if (vh - rect.bottom >= h + GAP + PAD + EDGE) return { style: { left, top: rect.bottom + PAD + GAP, width: w }, side: 'bottom', arrow };
  if (rect.top >= h + GAP + PAD + EDGE) return { style: { left, top: rect.top - PAD - GAP - h, width: w }, side: 'top', arrow };
  const top = clamp(rect.top + rect.height / 2 - h / 2, EDGE, vh - h - EDGE);
  if (vw - rect.right >= w + GAP + PAD + EDGE) return { style: { left: rect.right + PAD + GAP, top, width: w }, side: 'right' };
  if (rect.left >= w + GAP + PAD + EDGE) return { style: { left: rect.left - PAD - GAP - w, top, width: w }, side: 'left' };
  return { style: { left: (vw - w) / 2, bottom: EDGE, width: w }, side: 'dock' };
};

// ------------------------------------------------------------------ the tour
const TourRunner = ({ tour, steps, onEnd }) => {
  const [idx, setIdx] = useState(0);
  const [rect, setRect] = useState(null);
  const [cardH, setCardH] = useState(0);
  const elRef = useRef(null);
  const cardRef = useRef(null);
  const titleRef = useRef(null);
  const step = steps[idx];
  const last = idx === steps.length - 1;

  // Bring the step's element into view, then follow it while the page moves.
  useEffect(() => {
    let settle;
    let revealWait;
    const bringIntoView = (el) => {
      el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: prefersReducedMotion() || document.hidden ? 'instant' : 'smooth' });
      // If smooth scrolling didn't get there (the site sets scroll-behavior: smooth,
      // which some browsers pause in the background), jump. 'instant' overrides that CSS.
      settle = setTimeout(() => {
        const r = el.getBoundingClientRect();
        if (r.bottom < 0 || r.top > window.innerHeight) el.scrollIntoView({ block: 'center', inline: 'nearest', behavior: 'instant' });
      }, 900);
    };
    const el = findTarget(step.target);
    elRef.current = el;
    if (el) {
      bringIntoView(el);
    } else if (step.reveal) {
      // The part is on a tab that isn't open: open it (e.g. the Disaster Map tab), then look again.
      findTarget(step.reveal)?.click();
      revealWait = setTimeout(() => {
        elRef.current = findTarget(step.target);
        if (elRef.current) bringIntoView(elRef.current);
      }, 350);
    }
    titleRef.current?.focus();
    let frame;
    let n = 0;
    const measure = () => {
      // Re-find now and then: the page may re-render the element.
      if (++n % 15 === 0 && !(elRef.current && elRef.current.isConnected && isShown(elRef.current))) {
        elRef.current = findTarget(step.target);
      }
      const e = elRef.current;
      if (e) {
        const r = e.getBoundingClientRect();
        const next = { top: r.top, left: r.left, width: r.width, height: r.height, bottom: r.bottom, right: r.right };
        setRect((prev) => (sameRect(prev, next) ? prev : next));
      } else {
        setRect((prev) => (prev === null ? prev : null));
      }
    };
    // Every frame while the page moves, plus scroll / resize events and a
    // first measure right away (frames are slowed down in background tabs).
    const tick = () => { measure(); frame = requestAnimationFrame(tick); };
    frame = requestAnimationFrame(tick);
    const first = setTimeout(measure, 0);
    const timer = setInterval(measure, 200); // background tabs also hold back frames and scroll events
    window.addEventListener('scroll', measure, true);
    window.addEventListener('resize', measure);
    return () => {
      cancelAnimationFrame(frame);
      clearTimeout(first);
      clearTimeout(settle);
      clearTimeout(revealWait);
      clearInterval(timer);
      window.removeEventListener('scroll', measure, true);
      window.removeEventListener('resize', measure);
    };
  }, [step]);

  useLayoutEffect(() => {
    if (cardRef.current) setCardH(cardRef.current.offsetHeight);
  }, [idx, rect?.width]);

  const next = useCallback(() => (last ? onEnd(true) : setIdx((i) => i + 1)), [last, onEnd]);
  const back = useCallback(() => setIdx((i) => Math.max(0, i - 1)), []);

  useEffect(() => {
    const onKey = (e) => {
      if (e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); onEnd(false); }
      else if (e.key === 'ArrowRight') { e.preventDefault(); next(); }
      else if (e.key === 'ArrowLeft') { e.preventDefault(); back(); }
    };
    document.addEventListener('keydown', onKey, true);
    return () => document.removeEventListener('keydown', onKey, true);
  }, [next, back, onEnd]);

  const vw = window.innerWidth;
  const vh = window.innerHeight;
  // The lit area, kept inside the screen when the element is taller than it.
  const spot = rect && {
    top: Math.max(4, rect.top - PAD),
    left: Math.max(4, rect.left - PAD),
    width: Math.min(vw - 8, rect.right + PAD) - Math.max(4, rect.left - PAD),
    height: Math.min(vh - 8, rect.bottom + PAD) - Math.max(4, rect.top - PAD),
  };
  const visibleSpot = spot && spot.width > 0 && spot.height > 0 ? spot : null;
  const place = placeCard(visibleSpot ? { ...rect } : null, cardH);

  return createPortal(
    <div className={`pt-layer${visibleSpot ? '' : ' is-dim'}`}>
      {visibleSpot && <div className="pt-spot" style={visibleSpot} aria-hidden="true" />}
      <div
        ref={cardRef}
        className={`pt-card is-${place.side}`}
        style={place.style}
        role="dialog"
        aria-modal="true"
        aria-labelledby="pt-card-title"
        aria-describedby="pt-card-body"
      >
        {place.arrow && (place.side === 'bottom' || place.side === 'top') && (
          <span className="pt-arrow" style={{ left: place.arrow }} aria-hidden="true" />
        )}
        <div className="pt-card-top">
          <span className="pt-count">{tour.name} · {idx + 1} of {steps.length}</span>
          <button type="button" className="pt-x" onClick={() => onEnd(false)} aria-label="Close tour">
            <i className="bi bi-x-lg" aria-hidden="true"></i>
          </button>
        </div>
        <h2 id="pt-card-title" ref={titleRef} tabIndex={-1}>{step.title}</h2>
        <p id="pt-card-body">{step.body}</p>
        <div className="pt-dots" aria-hidden="true">
          {steps.map((s, i) => <span key={i} className={i === idx ? 'is-on' : ''} />)}
        </div>
        <div className="pt-actions">
          {!last && <button type="button" className="pt-skip" onClick={() => onEnd(false)}>Skip tour</button>}
          <span className="pt-spacer" />
          {idx > 0 && <button type="button" className="pt-btn is-ghost" onClick={back}>Back</button>}
          <button type="button" className="pt-btn" onClick={next}>{last ? 'Done' : 'Next'}</button>
        </div>
      </div>
    </div>,
    document.body,
  );
};

// ------------------------------------------------------------------ tip dots
const Hotspots = ({ items, seen, onSeen, paused }) => {
  const [spots, setSpots] = useState([]);   // [{ id, top, left }]
  const [openId, setOpenId] = useState(null);
  const beaconRefs = useRef({});
  const popRef = useRef(null);

  useEffect(() => {
    if (paused) return undefined; // hidden while a tour runs (see the render below)
    // Follow the targets: a light timer (pages load data and move things
    // around) plus scroll and resize. Positions are in page coordinates.
    const update = () => {
      const next = [];
      items.forEach((h) => {
        if (seen[h.id]) return;
        const el = findTarget(h.target);
        if (!el) return;
        const r = el.getBoundingClientRect();
        next.push({ id: h.id, top: Math.round(r.top + window.scrollY - 7), left: Math.round(r.right + window.scrollX - 11) });
      });
      setSpots((prev) => (JSON.stringify(prev) === JSON.stringify(next) ? prev : next));
    };
    const timer = setInterval(update, 250);
    const first = setTimeout(update, 0);
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      clearInterval(timer);
      clearTimeout(first);
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [items, seen, paused]);

  useEffect(() => {
    if (!openId) return undefined;
    popRef.current?.querySelector('button')?.focus();
    const onKey = (e) => {
      if (e.key === 'Escape') { e.stopPropagation(); setOpenId(null); beaconRefs.current[openId]?.focus(); }
    };
    const onAway = (e) => {
      if (popRef.current?.contains(e.target) || beaconRefs.current[openId]?.contains(e.target)) return;
      setOpenId(null);
    };
    document.addEventListener('keydown', onKey, true);
    document.addEventListener('mousedown', onAway);
    return () => { document.removeEventListener('keydown', onKey, true); document.removeEventListener('mousedown', onAway); };
  }, [openId]);

  // Only dots for this page's tips: right after moving to another page, the
  // positions measured on the previous page may still be in state.
  const shown = spots.filter((s) => items.some((i) => i.id === s.id));
  if (paused || !shown.length) return null;
  const open = openId && items.find((h) => h.id === openId);
  const openSpot = open && shown.find((s) => s.id === openId);
  const popW = Math.min(280, window.innerWidth - EDGE * 2);
  const popLeft = openSpot ? Math.max(window.scrollX + EDGE, Math.min(openSpot.left - popW / 2, window.scrollX + window.innerWidth - popW - EDGE)) : 0;

  return createPortal(
    <>
      {shown.map((s) => {
        const h = items.find((i) => i.id === s.id);
        return (
          <button
            key={s.id}
            ref={(el) => { beaconRefs.current[s.id] = el; }}
            type="button"
            className={`pt-beacon${openId === s.id ? ' is-open' : ''}`}
            style={{ top: s.top, left: s.left }}
            aria-label={`Tip: ${h.title}`}
            aria-expanded={openId === s.id}
            aria-controls={openId === s.id ? 'pt-pop' : undefined}
            onClick={() => setOpenId((cur) => (cur === s.id ? null : s.id))}
          >
            <span aria-hidden="true" />
          </button>
        );
      })}
      {open && openSpot && (
        <div id="pt-pop" ref={popRef} className="pt-pop" style={{ top: openSpot.top + 30, left: popLeft, width: popW }} aria-labelledby="pt-pop-title">
          <strong id="pt-pop-title"><i className="bi bi-lightbulb" aria-hidden="true"></i> {open.title}</strong>
          <p>{open.body}</p>
          <button type="button" className="pt-btn is-small" onClick={() => { onSeen(open.id); setOpenId(null); }}>Got it</button>
        </div>
      )}
    </>,
    document.body,
  );
};

// ------------------------------------------------------------------ help button + invitation
const ProductTour = ({ area = 'resident' }) => {
  const conf = AREAS[area] || AREAS.resident;
  const { pathname } = useLocation();
  const { user, adminUser } = useAuth();
  const signedIn = area === 'admin' ? !!adminUser : !!user;
  const isSuper = adminUser?.role === 'Super';
  const storageKey = area === 'admin' ? `pb2_tours_admin_${adminUser?.admin_id || 'x'}` : 'pb2_tours';
  const [state, setState] = useState(() => readTourState(storageKey));
  const [running, setRunning] = useState(null);   // { tour, steps }
  const [menuOpen, setMenuOpen] = useState(false);
  const [invite, setInvite] = useState(false);
  const fabRef = useRef(null);
  const menuRef = useRef(null);

  const hidden = !conf.shows(pathname);
  const tour = hidden ? null : tourForPath(pathname, conf.tours);
  const allowed = useMemo(() => allowedFor(signedIn, isSuper), [signedIn, isSuper]);
  // Kept stable between renders so the tip dots don't restart their tracking.
  const hotspots = useMemo(() => (tour ? tour.hotspots.filter(allowed) : []), [tour, allowed]);

  const save = useCallback((fn) => setState((s) => { const next = fn(s); writeTourState(next, storageKey); return next; }), [storageKey]);

  const start = useCallback(() => {
    if (!tour) return;
    setMenuOpen(false);
    setInvite(false);
    // Steps whose part is on the page, or behind a tab the tour can open.
    const steps = tour.steps.filter(allowed).filter((s) => findTarget(s.target) || (s.reveal && findTarget(s.reveal)));
    if (steps.length) setRunning({ tour, steps });
  }, [tour, allowed]);

  const end = useCallback((finished) => {
    const key = running?.tour.key;
    setRunning(null);
    if (key) save((s) => ({ ...s, done: { ...s.done, [key]: finished ? 'done' : 'skipped' } }));
    // Back to the Help button (the menu item that started the tour is gone).
    setTimeout(() => fabRef.current?.focus(), 60);
  }, [running, save]);

  // A new page: close menus; offer the tour once if this device hasn't seen it.
  useEffect(() => {
    setMenuOpen(false);
    setRunning(null);
    setInvite(false);
    if (!tour || state.done[tour.key] || state.dismissed[tour.key]) return undefined;
    const t = setTimeout(() => setInvite(true), 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [pathname]);

  useEffect(() => {
    if (!menuOpen) return undefined;
    const onKey = (e) => { if (e.key === 'Escape') { setMenuOpen(false); fabRef.current?.focus(); } };
    const onAway = (e) => {
      if (menuRef.current?.contains(e.target) || fabRef.current?.contains(e.target)) return;
      setMenuOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('mousedown', onAway);
    return () => { document.removeEventListener('keydown', onKey); document.removeEventListener('mousedown', onAway); };
  }, [menuOpen]);

  if (hidden) return null;

  const notNow = () => {
    setInvite(false);
    save((s) => ({ ...s, dismissed: { ...s.dismissed, [tour.key]: true } }));
  };
  const toggleTips = () => save((s) => ({ ...s, tipsOff: !s.tipsOff }));
  const resetAll = () => {
    save(() => ({ done: {}, dismissed: {}, tipsSeen: {}, tipsOff: false }));
    setMenuOpen(false);
  };
  const tipsLeft = hotspots.filter((h) => !state.tipsSeen[h.id]).length;

  return (
    <>
      <button
        ref={fabRef}
        type="button"
        className="pt-fab"
        aria-label="Help and page tour"
        aria-expanded={menuOpen}
        aria-controls="pt-menu"
        title="Help and page tour"
        onClick={() => { setInvite(false); setMenuOpen((v) => !v); }}
      >
        <i className="bi bi-question-lg" aria-hidden="true"></i>
      </button>

      {menuOpen && (
        <div id="pt-menu" ref={menuRef} className="pt-menu" aria-labelledby="pt-menu-title">
          <strong id="pt-menu-title">Help</strong>
          {tour ? (
            <button type="button" className="pt-menu-item" onClick={start}>
              <i className="bi bi-signpost-split" aria-hidden="true"></i>
              <span>Take a tour of this page<small>{tour.name}, about a minute</small></span>
            </button>
          ) : (
            <p className="pt-menu-note">{conf.noTour}</p>
          )}
          {hotspots.length > 0 && (
            <button type="button" className="pt-menu-item" onClick={toggleTips} aria-pressed={!state.tipsOff}>
              <i className={`bi ${state.tipsOff ? 'bi-lightbulb' : 'bi-lightbulb-fill'}`} aria-hidden="true"></i>
              <span>{state.tipsOff ? 'Show tip dots' : 'Hide tip dots'}<small>{state.tipsOff ? 'Pulsing dots point out handy features' : `${tipsLeft} tip${tipsLeft === 1 ? '' : 's'} on this page`}</small></span>
            </button>
          )}
          <button type="button" className="pt-menu-item" onClick={resetAll}>
            <i className="bi bi-arrow-counterclockwise" aria-hidden="true"></i>
            <span>Start tours and tips over<small>Offer every tour again and bring back all tips</small></span>
          </button>
        </div>
      )}

      {invite && tour && !running && (
        <div className="pt-invite" role="region" aria-label="Page tour">
          <i className="bi bi-signpost-split pt-invite-icon" aria-hidden="true"></i>
          <div>
            <strong>New to the {tour.name}?</strong>
            <p>Take a quick tour to see how it works.</p>
            <div className="pt-invite-actions">
              <button type="button" className="pt-btn is-small" onClick={start}>Start tour</button>
              <button type="button" className="pt-btn is-small is-ghost" onClick={notNow}>Not now</button>
            </div>
          </div>
        </div>
      )}

      {tour && !state.tipsOff && hotspots.length > 0 && (
        <Hotspots
          items={hotspots}
          seen={state.tipsSeen}
          paused={!!running}
          onSeen={(id) => save((s) => ({ ...s, tipsSeen: { ...s.tipsSeen, [id]: true } }))}
        />
      )}

      {running && <TourRunner key={running.tour.key} tour={running.tour} steps={running.steps} onEnd={end} />}
    </>
  );
};

export default ProductTour;
