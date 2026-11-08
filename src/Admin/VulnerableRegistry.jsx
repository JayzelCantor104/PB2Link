import { useEffect, useMemo, useState } from 'react';
import axios from 'axios';
import { FLOOD_LEVELS } from '../lib/preparedness';
import '../styles/preparedness.css';

const API_BASE = '/api_backend';

// Vulnerable residents (vulnerable_residents.php, migration 033): Active
// residents aged 60+ or PWD, grouped by street, highest flood risk first.
// Needs the disaster.vulnerable permission. Opening and printing are
// audit-logged; there is deliberately no CSV export.
const VulnerableRegistry = ({ showToast }) => {
  const [rows, setRows] = useState(null);
  const [error, setError] = useState('');
  const [minFlood, setMinFlood] = useState('all');
  const [who, setWho] = useState('all');
  const [search, setSearch] = useState('');

  useEffect(() => {
    let cancelled = false;
    axios.get(`${API_BASE}/vulnerable_residents.php`, { params: { action: 'list' } })
      .then((res) => {
        if (cancelled) return;
        if (res.data?.success) setRows(res.data.residents || []);
        else { setRows([]); setError(res.data?.message || 'The list could not be loaded.'); }
      })
      .catch(() => { if (!cancelled) { setRows([]); setError('Network error while loading the list.'); } });
    return () => { cancelled = true; };
  }, []);

  const filtered = useMemo(() => {
    const q = search.trim().toUpperCase();
    return (rows || []).filter((r) => {
      if (who === 'senior' && !r.senior) return false;
      if (who === 'pwd' && !r.pwd) return false;
      if (minFlood !== 'all') {
        const need = Number(minFlood);
        if (need === -1 ? r.flood_level !== null : (r.flood_level ?? -1) < need) return false;
      }
      if (q && !`${r.name} ${r.street || ''} ${r.subdivision || ''} ${r.control_num || ''}`.toUpperCase().includes(q)) return false;
      return true;
    });
  }, [rows, who, minFlood, search]);

  // Streets, highest flood level first; unmapped streets last.
  const groups = useMemo(() => {
    const map = new Map();
    filtered.forEach((r) => {
      const key = `${r.street || 'NO STREET'}|${r.subdivision || ''}`;
      if (!map.has(key)) map.set(key, { street: r.street || 'No street on record', subdivision: r.subdivision, flood: r.flood_level, people: [] });
      map.get(key).people.push(r);
    });
    return [...map.values()].sort((a, b) => (b.flood ?? -1) - (a.flood ?? -1) || a.street.localeCompare(b.street));
  }, [filtered]);

  const filterLabel = [
    who === 'senior' ? 'seniors only' : who === 'pwd' ? 'PWDs only' : '',
    minFlood === 'all' ? '' : minFlood === '-1' ? 'streets not mapped' : `flood level ${FLOOD_LEVELS[minFlood]?.short || minFlood} and up`,
    search.trim() ? `search "${search.trim()}"` : '',
  ].filter(Boolean).join(', ');

  const print = async () => {
    try {
      await axios.post(`${API_BASE}/vulnerable_residents.php?action=log_print`, { count: filtered.length, filter: filterLabel });
    } catch {
      showToast('The print could not be recorded, so it was not started. Try again.', 'error');
      return;
    }
    const done = () => { document.body.classList.remove('vr-printing'); window.removeEventListener('afterprint', done); };
    window.addEventListener('afterprint', done);
    document.body.classList.add('vr-printing');
    window.print();
  };

  if (rows === null) return <div className="table-card" style={{ padding: '24px', color: '#64748b' }}>Loading…</div>;

  return (
    <div className="prep-admin vr-print">
      <div className="vr-note vr-no-print">
        <i className="bi bi-shield-lock-fill" aria-hidden="true"></i>
        <span>
          Personal information for evacuation planning only. Opening and printing this list are recorded in the audit log.
          Don’t share it outside the response team, and dispose of printed copies after use. Only Active residents with a recorded age of 60+ or PWD status are listed;
          young children, pregnant residents and people without an account are not in the system, so check with purok leaders too.
        </span>
      </div>
      {error && <div className="vr-note vr-no-print">{error}</div>}

      <div className="table-card" style={{ padding: '16px 20px' }}>
        <div className="vr-filters vr-no-print">
          <label>Who
            <select value={who} onChange={(e) => setWho(e.target.value)}>
              <option value="all">Seniors and PWDs</option>
              <option value="senior">Seniors (60+)</option>
              <option value="pwd">PWDs</option>
            </select>
          </label>
          <label>Street flood risk
            <select value={minFlood} onChange={(e) => setMinFlood(e.target.value)}>
              <option value="all">All streets</option>
              <option value="3">High only</option>
              <option value="2">Medium and high</option>
              <option value="1">Low, medium or high</option>
              <option value="-1">Street not mapped</option>
            </select>
          </label>
          <label>Search
            <input type="search" className="keep-case" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search name, street, control no." />
          </label>
          <button type="button" className="btn-secondary" onClick={print} disabled={filtered.length === 0}><i className="bi bi-printer-fill"></i> Print this list</button>
        </div>
        <h3 style={{ margin: '14px 0 4px', fontSize: '1.05rem', color: '#043927' }}>
          Vulnerable residents · {filtered.length} {filtered.length === 1 ? 'person' : 'people'} on {groups.length} street{groups.length === 1 ? '' : 's'}
        </h3>
        <small style={{ color: '#64748b' }}>{filterLabel ? `Showing: ${filterLabel}. ` : ''}As of {new Date().toLocaleString()} · Street flood level from Project NOAH’s 100-year map.</small>
      </div>

      {groups.length === 0 ? (
        <div className="table-card" style={{ padding: '24px', color: '#64748b' }}>No residents match.</div>
      ) : groups.map((g) => {
        const lvl = g.flood !== null && g.flood !== undefined ? FLOOD_LEVELS[g.flood] : null;
        return (
          <section key={`${g.street}|${g.subdivision}`} className="vr-street">
            <div className="vr-street-head">
              <strong>{g.street}{g.subdivision ? `, ${g.subdivision}` : ''}</strong>
              <span className="vr-flood" style={{ '--flood-color': lvl ? lvl.color : '#64748b' }}>
                <i className="bi bi-water" aria-hidden="true"></i> {lvl ? `Flood: ${lvl.short}` : 'Flood: not mapped'}
              </span>
              <small style={{ color: '#64748b' }}>{g.people.length} {g.people.length === 1 ? 'person' : 'people'}</small>
            </div>
            <div className="vr-table-wrap">
              <table className="vr-table">
                <thead>
                  <tr><th>Name</th><th>Age</th><th>Needs</th><th>Address</th><th>Mobile</th><th>Emergency contact</th></tr>
                </thead>
                <tbody>
                  {g.people.map((r) => (
                    <tr key={r.resident_id}>
                      <td><strong>{r.name}</strong><br /><small style={{ color: '#64748b' }}>{r.control_num}</small></td>
                      <td>{r.age ?? '—'}</td>
                      <td>{r.senior && <span className="vr-tag senior">Senior</span>}{r.pwd && <span className="vr-tag pwd">PWD</span>}</td>
                      <td>{r.address || '—'}{r.landmark ? <><br /><small style={{ color: '#64748b' }}>Near {r.landmark}</small></> : null}</td>
                      <td>{r.mobile ? <a href={`tel:${r.mobile}`}>{r.mobile}</a> : '—'}{r.mobile && !r.mobile_verified && <><br /><small style={{ color: '#b45309' }}>not verified</small></>}</td>
                      <td>{r.emergency_contact || '—'}{r.emergency_relationship ? ` (${r.emergency_relationship})` : ''}{r.emergency_number ? <><br /><a href={`tel:${r.emergency_number}`}>{r.emergency_number}</a></> : null}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </section>
        );
      })}
    </div>
  );
};

export default VulnerableRegistry;
