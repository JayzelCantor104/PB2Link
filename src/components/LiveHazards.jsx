import React, { useCallback, useEffect, useState } from 'react';
import './LiveHazards.css';

const API_BASE = '/api_backend';
const REFRESH_MS = 5 * 60 * 1000;

const SOURCE_NAMES = {
  pagasa: 'PAGASA',
  gdacs: 'GDACS (UN / EU)',
  phivolcs: 'PHIVOLCS',
  usgs: 'USGS',
  weather: 'Open-Meteo',
};

const timeLabel = (v) => {
  if (!v) return 'not yet';
  const d = new Date(String(v).replace(' ', 'T'));
  if (Number.isNaN(d.getTime())) return v;
  return d.toLocaleString('en-PH', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' });
};

const ago = (iso) => {
  const mins = Math.round((Date.now() - new Date(iso).getTime()) / 60000);
  if (mins < 60) return `${Math.max(1, mins)} min ago`;
  const hrs = Math.round(mins / 60);
  if (hrs < 24) return `${hrs} hr ago`;
  return `${Math.round(hrs / 24)} day${hrs >= 36 ? 's' : ''} ago`;
};

// Magnitude bands follow PHIVOLCS wording; colour is always paired with text.
const quakeBand = (m) => (m >= 6 ? ['is-critical', 'Strong'] : m >= 5 ? ['is-serious', 'Moderate'] : m >= 4 ? ['is-warning', 'Light'] : ['is-minor', 'Minor']);

const SourceLine = ({ source, status, extra, linkLabel = 'Open official page' }) => (
  <p className={`lh-source${status?.stale ? ' is-stale' : ''}`}>
    <i className={`bi ${status?.stale ? 'bi-exclamation-circle' : 'bi-broadcast'}`} aria-hidden="true"></i>
    {SOURCE_NAMES[source]}{extra ? ` ${extra}` : ''} · updated {timeLabel(status?.updated_at)}
    {status?.stale && ' · could not be reached recently, showing the last reading'}
    {status?.url && (
      <> · <a href={status.url} target="_blank" rel="noopener noreferrer">{linkLabel}</a></>
    )}
  </p>
);

/**
 * Live hazard monitor: typhoons (PAGASA bulletin + GDACS), earthquakes near
 * Imus (PHIVOLCS, USGS backup) and model rainfall. The server fetches and
 * caches the feeds (hazard_feeds.php); this only reads that copy.
 * canRefresh shows a "Check now" button (staff).
 */
const LiveHazards = ({ canRefresh = false, compact = false }) => {
  const [data, setData] = useState(null);
  const [error, setError] = useState('');
  const [busy, setBusy] = useState(false);
  const [showSignals, setShowSignals] = useState(false);

  const load = useCallback(async (force = false) => {
    setBusy(true);
    try {
      const res = force
        ? await fetch(`${API_BASE}/hazard_feeds.php?action=refresh`, { method: 'POST', credentials: 'include' })
        : await fetch(`${API_BASE}/hazard_feeds.php?action=live`);
      const json = await res.json();
      if (json.success) { setData(json); setError(''); } else setError(json.message || 'Live feeds are unavailable.');
    } catch {
      setError('Live feeds could not be reached.');
    } finally {
      setBusy(false);
    }
  }, []);

  useEffect(() => {
    load();
    const t = setInterval(() => load(), REFRESH_MS);
    return () => clearInterval(t);
  }, [load]);

  if (!data) {
    return (
      <div className="lh-wrap">
        <p className="lh-loading">{error || 'Checking PAGASA, PHIVOLCS and GDACS…'}</p>
      </div>
    );
  }

  const { sources, typhoon, earthquakes, rainfall } = data;
  const pagasa = typhoon.pagasa;
  const storms = pagasa?.storms || [];
  const quakeSource = earthquakes.source || 'phivolcs';
  const rainDays = (rainfall || []).slice(0, 3);
  const rainMax = Math.max(30, ...rainDays.map((d) => d.mm || 0));

  return (
    <div className={`lh-wrap${compact ? ' is-compact' : ''}`}>
      <div className="lh-head">
        <div>
          <h3><i className="bi bi-broadcast-pin" aria-hidden="true"></i> Live hazard monitor</h3>
          <p>Read automatically from PAGASA, PHIVOLCS and GDACS. Barangay advisories above are issued by staff.</p>
        </div>
        {canRefresh && (
          <button type="button" className="lh-refresh" onClick={() => load(true)} disabled={busy}>
            <i className={`bi bi-arrow-clockwise${busy ? ' lh-spin' : ''}`} aria-hidden="true"></i> {busy ? 'Checking…' : 'Check now'}
          </button>
        )}
      </div>

      <div className="lh-grid">
        {/* ---- Tropical cyclones ---- */}
        <div className="lh-card">
          <h4><i className="bi bi-hurricane" aria-hidden="true"></i> Tropical cyclone</h4>
          {!pagasa ? (
            <p className="lh-empty">PAGASA has not been read yet.</p>
          ) : !pagasa.active ? (
            <p className="lh-status is-good"><i className="bi bi-check-circle-fill" aria-hidden="true"></i> No tropical cyclone inside the Philippine Area of Responsibility.</p>
          ) : storms.length === 0 ? (
            <p className="lh-status is-warning"><i className="bi bi-exclamation-triangle-fill" aria-hidden="true"></i> PAGASA has an active bulletin, but it could not be read here. Open the official bulletin.</p>
          ) : storms.map((s) => (
            <div key={s.name || s.location} className="lh-storm">
              <div className="lh-storm-top">
                <strong>{s.category} {s.name}</strong>
                {s.distance_km != null && <span>{s.distance_km.toLocaleString()} km from Imus</span>}
              </div>
              <p className={`lh-status ${s.cavite_signal >= 3 ? 'is-critical' : s.cavite_signal === 2 ? 'is-serious' : s.cavite_signal === 1 ? 'is-warning' : 'is-good'}`}>
                <i className={`bi ${s.cavite_signal ? 'bi-flag-fill' : 'bi-check-circle-fill'}`} aria-hidden="true"></i>
                {s.cavite_signal
                  ? `Wind Signal No. ${s.cavite_signal} over ${s.cavite_partial ? 'part of ' : ''}Cavite`
                  : 'No wind signal over Cavite'}
              </p>
              <ul className="lh-facts">
                {s.max_wind_kmh && <li>Winds {s.max_wind_kmh} km/h, gusts up to {s.gust_kmh} km/h</li>}
                {s.movement && <li>{s.movement}</li>}
              </ul>
              {s.signals?.length > 0 && (
                <>
                  <button type="button" className="lh-toggle" onClick={() => setShowSignals((v) => !v)} aria-expanded={showSignals}>
                    {showSignals ? 'Hide' : 'Show'} all wind signal areas ({s.signals.length})
                  </button>
                  {showSignals && (
                    <ul className="lh-signals">
                      {s.signals.map((sig) => (
                        <li key={sig.signal}><span className={`lh-sig lh-sig-${Math.min(sig.signal, 5)}`}>Signal {sig.signal}</span> {sig.areas}</li>
                      ))}
                    </ul>
                  )}
                </>
              )}
            </div>
          ))}
          {pagasa?.bulletin_pdf && <a className="lh-doc" href={pagasa.bulletin_pdf} target="_blank" rel="noopener noreferrer"><i className="bi bi-file-earmark-pdf" aria-hidden="true"></i> Latest PAGASA bulletin (PDF)</a>}
          <SourceLine source="pagasa" status={sources.pagasa} />
          {typhoon.gdacs.length > 0 && (
            <div className="lh-sub">
              <span className="lh-sub-label">Also tracked by GDACS</span>
              <ul className="lh-list">
                {typhoon.gdacs.slice(0, 3).map((g) => (
                  <li key={g.id}>
                    <span className={`lh-pill is-${g.alert.toLowerCase()}`}>{g.alert}</span>
                    <span className="lh-list-main">
                      <a href={g.url} target="_blank" rel="noopener noreferrer">{g.name}</a>
                      <small>{g.distance_km.toLocaleString()} km away{g.wind_kmh ? ` · ${g.wind_kmh} km/h` : ''}{g.ph_affected ? ' · Philippines affected' : ''}</small>
                    </span>
                  </li>
                ))}
              </ul>
              <SourceLine source="gdacs" status={sources.gdacs} />
            </div>
          )}
        </div>

        {/* ---- Earthquakes ---- */}
        <div className="lh-card">
          <h4><i className="bi bi-activity" aria-hidden="true"></i> Earthquakes near Imus</h4>
          {earthquakes.list.length === 0 ? (
            <p className="lh-status is-good"><i className="bi bi-check-circle-fill" aria-hidden="true"></i> No earthquakes within {earthquakes.radius_km} km in the last 7 days.</p>
          ) : (
            <>
              <p className="lh-summary">
                <strong>{earthquakes.count_7d}</strong> within {earthquakes.radius_km} km in 7 days
                {earthquakes.strongest_7d && <> · strongest <strong>M{Number(earthquakes.strongest_7d.mag).toFixed(1)}</strong>, {earthquakes.strongest_7d.distance_km} km away</>}
              </p>
              <ul className="lh-list">
                {earthquakes.list.slice(0, compact ? 3 : 5).map((q) => {
                  const [tone, word] = quakeBand(q.mag);
                  return (
                    <li key={q.time + q.place}>
                      <span className={`lh-mag ${tone}`} title={`${word} earthquake`}>M{q.mag.toFixed(1)}</span>
                      <span className="lh-list-main">
                        {q.url ? <a href={q.url} target="_blank" rel="noopener noreferrer">{q.place}</a> : <span>{q.place}</span>}
                        <small>{word} · {q.distance_km} km from Imus · depth {q.depth_km} km · {ago(q.time)}</small>
                      </span>
                    </li>
                  );
                })}
              </ul>
            </>
          )}
          <SourceLine source={quakeSource} status={sources[quakeSource]} extra={quakeSource === 'usgs' ? '(PHIVOLCS could not be read)' : ''} />
        </div>

        {/* ---- Rainfall ---- */}
        <div className="lh-card">
          <h4><i className="bi bi-cloud-rain-heavy" aria-hidden="true"></i> Rainfall outlook</h4>
          {rainDays.length === 0 ? <p className="lh-empty">The forecast is not available yet.</p> : (
            <ul className="lh-rain">
              {rainDays.map((d, i) => {
                const mm = d.mm ?? 0;
                const tone = mm >= 100 ? 'is-critical' : mm >= 50 ? 'is-serious' : mm >= 15 ? 'is-warning' : '';
                return (
                  <li key={d.date}>
                    <span className="lh-rain-day">{i === 0 ? 'Today' : i === 1 ? 'Tomorrow' : new Date(d.date).toLocaleDateString('en-PH', { weekday: 'short' })}</span>
                    <span className="lh-rain-track"><span className={`lh-rain-fill ${tone}`} style={{ width: `${Math.min(100, (mm / rainMax) * 100)}%` }}></span></span>
                    <span className="lh-rain-val">{mm} mm{d.chance != null ? ` · ${d.chance}%` : ''}</span>
                  </li>
                );
              })}
            </ul>
          )}
          <p className="lh-note">Model forecast, not an official PAGASA warning. 50 mm or more in a day can flood low-lying streets.</p>
          <SourceLine source="weather" status={{ ...sources.weather, url: 'https://www.pagasa.dost.gov.ph/regional-forecast/ncrprsd' }} linkLabel="PAGASA rainfall advisories" />
        </div>
      </div>
    </div>
  );
};

export default LiveHazards;
