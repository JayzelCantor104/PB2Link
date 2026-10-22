import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { FLOOD_LEVELS } from '../lib/preparedness';
import '../styles/preparedness.css';

const API_BASE = '/api_backend';

// A street's Project NOAH 100-year flood level (preparedness.php, migration 033).
//   mine          the signed-in resident's own street (action=my_street)
//   street / subdivision   any street (action=street_risk), e.g. Edit Profile
//   compact       one line for the Home page
const StreetFloodRisk = ({ mine = false, street = '', subdivision = '', compact = false, showLink = true }) => {
  const [info, setInfo] = useState(null);

  useEffect(() => {
    if (!mine && !String(street).trim()) return undefined;
    let cancelled = false;
    // Wait a moment while someone is still typing a street name.
    const timer = setTimeout(() => {
      const url = mine
        ? `${API_BASE}/preparedness.php?action=my_street`
        : `${API_BASE}/preparedness.php?action=street_risk&street=${encodeURIComponent(street)}&subdivision=${encodeURIComponent(subdivision || '')}`;
      fetch(url, { credentials: 'include' })
        .then((res) => res.json())
        .then((json) => { if (!cancelled) setInfo(json.success ? json : null); })
        .catch(() => { if (!cancelled) setInfo(null); });
    }, mine ? 0 : 400);
    return () => { cancelled = true; clearTimeout(timer); };
  }, [mine, street, subdivision]);

  if (!info || !info.street || (!mine && !String(street).trim())) return null;

  const level = info.mapped ? FLOOD_LEVELS[info.flood_level] : null;
  const where = info.street;

  if (!level) {
    return (
      <div className={`prep-flood is-unmapped ${compact ? 'is-compact' : ''}`}>
        <i className="bi bi-question-circle" aria-hidden="true"></i>
        <div>
          <strong>{where}: flood risk not mapped yet</strong>
          {!compact && <p>We don’t have this street’s shape to check against the flood map. Follow advisories and ask the barangay about flooding on your street.</p>}
        </div>
      </div>
    );
  }

  return (
    <div className={`prep-flood lvl-${info.flood_level} ${compact ? 'is-compact' : ''}`} style={{ '--flood-color': level.color }}>
      <i className={`bi ${info.flood_level > 0 ? 'bi-water' : 'bi-check-circle-fill'}`} aria-hidden="true"></i>
      <div>
        <strong>{where}: {level.label}{level.depth ? ` (${level.depth})` : ''}</strong>
        {!compact && <p>{level.advice}</p>}
        {!compact && info.flood_level > 0 && info.flood_share !== null && (
          <small>{info.flood_share >= 0.99 ? 'The whole street is' : `About ${Math.max(1, Math.round(info.flood_share * 100))}% of the street is`} in a flood area on Project NOAH’s 100-year flood map. It is a model of a very heavy flood, not a record of past floods.</small>
        )}
        {showLink && <Link to="/preparedness" className="prep-flood-link">How to prepare <i className="bi bi-arrow-right" aria-hidden="true"></i></Link>}
      </div>
    </div>
  );
};

export default StreetFloodRisk;
