import { OFFICE_HOURS, PROCESSING_TIMES } from '../lib/processingTimes';
import '../styles/processing-note.css';

// "When will I hear back?" note for request forms and success screens.
// kind: documents | facilities | incident | profile | issue (src/lib/processingTimes.js)
const ProcessingNote = ({ kind, compact = false }) => {
  const p = PROCESSING_TIMES[kind];
  if (!p) return null;
  return (
    <div className={`pn-note${compact ? ' is-compact' : ''}`} role="note">
      <i className="bi bi-clock-history" aria-hidden="true"></i>
      <div>
        <strong>When to expect an update: {p.time}.</strong>
        {!compact && <span> {p.detail}</span>}
        {p.officeDays && (
          <small>Office hours are {OFFICE_HOURS}. Requests sent outside these hours are handled on the next office day.</small>
        )}
      </div>
    </div>
  );
};

export default ProcessingNote;
