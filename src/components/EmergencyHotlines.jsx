import { HOTLINE_CATEGORIES, telHref, usePreparedness } from '../lib/preparedness';
import '../styles/preparedness.css';

// Emergency hotlines with tap-to-call (preparedness.php, migration 033).
// compact: a short list for the Home page; otherwise the full directory.
const EmergencyHotlines = ({ compact = false, limit = 0 }) => {
  const { hotlines, loaded, failed } = usePreparedness();
  const list = limit > 0 ? hotlines.slice(0, limit) : hotlines;

  if (!loaded) return <p className="prep-muted">Loading hotlines…</p>;
  if (failed && hotlines.length === 0) {
    return <p className="prep-muted"><i className="bi bi-wifi-off" aria-hidden="true"></i> Hotlines could not be loaded. In an emergency, call <a href="tel:911">911</a>.</p>;
  }
  if (hotlines.length === 0) {
    return <p className="prep-muted">No hotlines listed yet. In an emergency, call <a href="tel:911">911</a>.</p>;
  }

  return (
    <ul className={`prep-hotlines ${compact ? 'is-compact' : ''}`}>
      {list.map((h) => {
        const cat = HOTLINE_CATEGORIES[h.category] || HOTLINE_CATEGORIES.other;
        return (
          <li key={h.id} className={`prep-hotline cat-${h.category}`}>
            <span className="prep-hotline-icon" aria-hidden="true"><i className={`bi ${cat.icon}`}></i></span>
            <span className="prep-hotline-main">
              <strong>{h.name}</strong>
              {!compact && h.note && <small>{h.note}</small>}
            </span>
            <a href={telHref(h.number)} className="prep-call" aria-label={`Call ${h.name}, ${h.number}`}>
              <i className="bi bi-telephone-outbound-fill" aria-hidden="true"></i> {h.number}
            </a>
          </li>
        );
      })}
    </ul>
  );
};

export default EmergencyHotlines;
