import { RESIDENT_REQUEST_STATES } from '../lib/changeRequests';
import '../styles/registration-fix.css';

// Top of Edit Profile: what barangay staff asked the resident to update
// (migration 028, get_profile.php change_requests). The change itself is made
// in the matching section below, with the proof, and staff review it.

const fmt = (v) => {
  const d = new Date(String(v || '').replace(' ', 'T'));
  return Number.isNaN(d.getTime()) ? '' : d.toLocaleDateString('en-PH', { month: 'short', day: 'numeric', year: 'numeric' });
};

const StaffChangeRequests = ({ requests }) => {
  if (!requests?.length) return null;
  const goTo = (section) => document.getElementById(section)?.scrollIntoView({ behavior: 'smooth', block: 'start' });
  return (
    <div className="rfx-panel scr-panel">
      <div className="rfx-head">
        <i className="bi bi-envelope-paper"></i>
        <div>
          <h3>Barangay staff asked you to update your profile</h3>
          <p>Only you can make these changes, with a proof. Staff check it before it applies to your record.</p>
        </div>
      </div>
      <ol className="rfx-items">
        {requests.map((q) => {
          const waiting = q.state === 'submitted';
          return (
            <li key={q.request_id} className={waiting ? 'is-done' : ''}>
              <i className={`bi ${waiting ? 'bi-hourglass-split' : q.state === 'rejected' ? 'bi-x-circle' : 'bi-circle'}`} aria-hidden="true"></i>
              <div className="rfx-item-body">
                <strong>{q.label}: {q.details} <span className={`scr-state is-${q.state}`}>{RESIDENT_REQUEST_STATES[q.state] || ''}</span></strong>
                {q.note && <span>Note from staff: {q.note}</span>}
                {q.rejection && <span className="scr-rejection">Not accepted: {q.rejection}</span>}
                <span>{q.help}</span>
                <small className="rfx-muted">Asked {fmt(q.created_at)}</small>
                {!waiting && q.section && (
                  <button type="button" className="rfx-link" onClick={() => goTo(q.section)}>
                    <i className="bi bi-arrow-down-circle"></i> Go to this part of your profile
                  </button>
                )}
              </div>
            </li>
          );
        })}
      </ol>
    </div>
  );
};

export default StaffChangeRequests;
