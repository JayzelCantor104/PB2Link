import { useState } from 'react';
import { Link } from 'react-router-dom';
import Header from '../components/Header';
import Footer from '../components/Footer';
import EmergencyHotlines from '../components/EmergencyHotlines';
import StreetFloodRisk from '../components/StreetFloodRisk';
import AddressCombobox from '../components/AddressCombobox';
import { useAuth } from '../context/AuthContext';
import { getAdvisoryLang, setAdvisoryLang } from '../lib/advisoryLanguage';
import { CHECKLISTS, GUIDE_HAZARDS, GUIDE_PHASES, guideSteps, loadTicks, saveTicks, usePreparedness } from '../lib/preparedness';
import '../styles/advisory-tools.css';
import '../styles/preparedness.css';

// /preparedness: hotlines, the resident's street flood risk, before / during /
// after guides (staff-editable, preparedness.php) and household checklists
// whose ticks stay on this device. Public, no sign-in needed.
const Preparedness = () => {
  const { user } = useAuth();
  const { guides, loaded } = usePreparedness();
  const [hazard, setHazard] = useState('typhoon');
  const [lang, setLang] = useState(getAdvisoryLang);
  const [ticks, setTicks] = useState(loadTicks);
  const [lookup, setLookup] = useState({ subdivision: '', street: '' });

  const chooseLang = (l) => { setLang(l); setAdvisoryLang(l); };
  const toggle = (list, i) => {
    const next = { ...ticks, [list]: { ...(ticks[list] || {}), [i]: !ticks[list]?.[i] } };
    setTicks(next);
    saveTicks(next);
  };
  const clearList = (list) => {
    const next = { ...ticks, [list]: {} };
    setTicks(next);
    saveTicks(next);
  };

  const guideFor = (h, p) => guides.find((g) => g.hazard === h && g.phase === p);
  const hasFilipino = guides.some((g) => (g.body_fil || '').trim() !== '');
  const current = GUIDE_HAZARDS.find((h) => h.key === hazard);

  return (
    <>
      <Header />
      <main className="prep-page">
        <div className="prep-container">
          <section className="prep-hero">
            <span className="prep-eyebrow"><i className="bi bi-shield-check" aria-hidden="true"></i> Be ready</span>
            <h1>Disaster Preparedness</h1>
            <p>What to do before, during and after a typhoon, flood, earthquake or fire in Pasong Buaya II, who to call, and how much your street can flood.</p>
            <div className="prep-hero-links">
              <Link to="/disaster-risk" className="prep-btn"><i className="bi bi-megaphone-fill" aria-hidden="true"></i> Advisories & evacuation centers</Link>
              <a href="#prep-hotlines" className="prep-btn is-ghost"><i className="bi bi-telephone-fill" aria-hidden="true"></i> Hotlines</a>
            </div>
          </section>

          <div className="prep-grid-top">
            <section className="prep-card" aria-labelledby="prep-street-h">
              <h2 id="prep-street-h"><i className="bi bi-water" aria-hidden="true"></i> Your street’s flood risk</h2>
              {user && <StreetFloodRisk mine showLink={false} />}
              <p className="prep-muted">{user ? 'Check another street:' : 'Pick your street to see how deep a very heavy flood can get there.'}</p>
              <div className="prep-lookup">
                <label>
                  <span>Subdivision</span>
                  <AddressCombobox kind="subdivision" name="subdivision" value={lookup.subdivision}
                    onChange={(e) => setLookup((l) => ({ ...l, subdivision: e.target.value }))} placeholder="Choose or type" />
                </label>
                <label>
                  <span>Street</span>
                  <AddressCombobox kind="street" name="street" value={lookup.street} subdivision={lookup.subdivision}
                    onChange={(e) => setLookup((l) => ({ ...l, street: e.target.value }))} placeholder="Choose or type" />
                </label>
              </div>
              <StreetFloodRisk street={lookup.street} subdivision={lookup.subdivision} showLink={false} />
              <p className="prep-source">Flood levels: Project NOAH 100-year flood hazard map (ODbL), checked along each street’s OpenStreetMap shape.</p>
            </section>

            <section className="prep-card" id="prep-hotlines" aria-labelledby="prep-hot-h">
              <h2 id="prep-hot-h"><i className="bi bi-telephone-fill" aria-hidden="true"></i> Emergency hotlines</h2>
              <p className="prep-muted">Tap a number to call. Save them on your phone now.</p>
              <EmergencyHotlines />
            </section>
          </div>

          <section className="prep-card" aria-labelledby="prep-guide-h">
            <div className="prep-card-head">
              <h2 id="prep-guide-h"><i className="bi bi-journal-check" aria-hidden="true"></i> What to do</h2>
              {hasFilipino && (
                <div className="adv-lang" role="group" aria-label="Language">
                  <button type="button" className={lang === 'en' ? 'is-active' : ''} aria-pressed={lang === 'en'} onClick={() => chooseLang('en')}>English</button>
                  <button type="button" className={lang === 'fil' ? 'is-active' : ''} aria-pressed={lang === 'fil'} onClick={() => chooseLang('fil')}>Filipino</button>
                </div>
              )}
            </div>
            <div className="prep-hazard-tabs" role="tablist" aria-label="Hazard">
              {GUIDE_HAZARDS.map((h) => (
                <button key={h.key} type="button" role="tab" aria-selected={hazard === h.key}
                  className={hazard === h.key ? 'is-active' : ''} onClick={() => setHazard(h.key)}>
                  <i className={`bi ${h.icon}`} aria-hidden="true"></i> {h.label}
                </button>
              ))}
            </div>
            {!loaded ? (
              <p className="prep-muted">Loading…</p>
            ) : (
              <div className="prep-phases" role="tabpanel" aria-label={current?.label}>
                {GUIDE_PHASES.map((p) => {
                  const steps = guideSteps(guideFor(hazard, p.key), lang);
                  return (
                    <div key={p.key} className={`prep-phase phase-${p.key}`}>
                      <h3>{p.label}</h3>
                      {steps.length === 0 ? <p className="prep-muted">No steps yet.</p> : (
                        <ol lang={lang === 'fil' && guideFor(hazard, p.key)?.body_fil ? 'fil' : 'en'}>
                          {steps.map((s, i) => <li key={i}>{s}</li>)}
                        </ol>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </section>

          <div className="prep-grid-lists">
            {CHECKLISTS.map((list) => {
              const done = list.items.filter((_, i) => ticks[list.key]?.[i]).length;
              return (
                <section key={list.key} className="prep-card" aria-labelledby={`prep-${list.key}-h`}>
                  <div className="prep-card-head">
                    <h2 id={`prep-${list.key}-h`}><i className={`bi ${list.icon}`} aria-hidden="true"></i> {list.title}</h2>
                    <span className="prep-progress">{done} / {list.items.length}</span>
                  </div>
                  <div className="prep-bar" aria-hidden="true"><span style={{ width: `${(done / list.items.length) * 100}%` }}></span></div>
                  <ul className="prep-checklist">
                    {list.items.map((item, i) => (
                      <li key={i}>
                        <label>
                          <input type="checkbox" checked={!!ticks[list.key]?.[i]} onChange={() => toggle(list.key, i)} />
                          <span>{item}</span>
                        </label>
                      </li>
                    ))}
                  </ul>
                  <div className="prep-list-foot">
                    <small className="prep-muted">Ticks are saved on this device only.</small>
                    {done > 0 && <button type="button" className="prep-link-btn" onClick={() => clearList(list.key)}>Clear ticks</button>}
                  </div>
                </section>
              );
            })}
          </div>
        </div>
      </main>
      <Footer />
    </>
  );
};

export default Preparedness;
