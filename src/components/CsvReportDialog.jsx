import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { downloadCsv } from '../lib/downloadCsv';
import '../styles/csv-report.css';

const today = () => new Date().toISOString().slice(0, 10);
const monthStart = () => `${today().slice(0, 8)}01`;

/**
 * "CSV report" pop-up for an admin page: a date range plus the page's own
 * choices, then a download through downloadCsv() (a refusal is shown as a
 * message). The endpoint checks access, writes the audit log and builds the
 * file with csv_export.php.
 *
 * props: title, description, url (endpoint with ?action=...), fileName,
 *        dateLabel (what the dates filter), choices: [{ name, label, options:
 *        [[value, label]...], value? }], initialFrom?, onClose, notify(title, msg, type)
 */
const CsvReportDialog = ({ title, description, url, fileName = 'report.csv', dateLabel = 'Date', choices = [],
  initialFrom, onClose, notify }) => {
  const [from, setFrom] = useState(initialFrom || monthStart());
  const [to, setTo] = useState(today());
  const [values, setValues] = useState(() => Object.fromEntries(choices.map((c) => [c.name, c.value ?? c.options[0][0]])));
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const download = async (e) => {
    e.preventDefault();
    if (from && to && from > to) { setError('The start date is after the end date.'); return; }
    setBusy(true);
    setError('');
    const q = new URLSearchParams({ from, to, ...values });
    const r = await downloadCsv(`${url}${url.includes('?') ? '&' : '?'}${q.toString()}`, fileName);
    setBusy(false);
    if (!r.ok) { setError(r.message); return; }
    if (notify) notify('Report downloaded', `${r.count ?? 'All'} row(s) in ${r.name || fileName}. The download is recorded in the audit log.`, 'success');
    onClose();
  };

  return createPortal(
    <div className="csvr-backdrop" onMouseDown={onClose}>
      <form className="csvr-dialog" onMouseDown={(e) => e.stopPropagation()} onSubmit={download} role="dialog" aria-modal="true" aria-labelledby="csvr-title">
        <h3 id="csvr-title"><i className="bi bi-file-earmark-spreadsheet" aria-hidden="true"></i> {title}</h3>
        {description && <p className="csvr-desc">{description}</p>}
        <div className="csvr-grid">
          <label>
            <span>{dateLabel} from</span>
            <input type="date" value={from} max={to || today()} onChange={(e) => setFrom(e.target.value)} required />
          </label>
          <label>
            <span>to</span>
            <input type="date" value={to} max={today()} onChange={(e) => setTo(e.target.value)} required />
          </label>
          {choices.map((c) => (
            <label key={c.name} className="csvr-wide">
              <span>{c.label}</span>
              <select value={values[c.name]} onChange={(e) => setValues((v) => ({ ...v, [c.name]: e.target.value }))}>
                {c.options.map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </label>
          ))}
        </div>
        <p className="csvr-note"><i className="bi bi-shield-lock" aria-hidden="true"></i> Opens in Excel or Google Sheets. Keep the file private: it holds residents' information.</p>
        {error && <div className="csvr-error" role="alert"><i className="bi bi-x-octagon" aria-hidden="true"></i> {error}</div>}
        <div className="csvr-actions">
          <button type="button" className="csvr-btn is-ghost" onClick={onClose} disabled={busy}>Cancel</button>
          <button type="submit" className="csvr-btn" disabled={busy}>
            <i className="bi bi-download" aria-hidden="true"></i> {busy ? 'Preparing…' : 'Download CSV'}
          </button>
        </div>
      </form>
    </div>,
    document.body,
  );
};

export default CsvReportDialog;
