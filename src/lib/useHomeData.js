// Live data for the Home page, loaded once and shared by the hero (status
// chips, barangay map) and the "My Barangay" dashboard / announcements panel.
// Public endpoints only, plus the signed-in resident's own street and
// requests. Refreshes every 10 minutes; each source fails on its own.
import { useEffect, useState } from 'react';

const API_BASE = '/api_backend';
const REFRESH_MS = 10 * 60 * 1000;

const getJson = (url) => fetch(url, { credentials: 'include' }).then((r) => r.json());

export default function useHomeData(resident) {
  const [data, setData] = useState({
    alert: undefined,   // the active (non-practice) advisory, null when none
    centers: null,      // evacuation centers (map pins)
    posts: null,        // announcements, pinned first
    weather: null,
    hazards: null,
    waste: null,
    issues: null,       // { list, tiers }
    street: null,       // the resident's street flood level (preparedness my_street)
    requests: null,     // the resident's document requests
  });
  const [failed, setFailed] = useState({});

  useEffect(() => {
    const put = (key) => (value) => setData((d) => ({ ...d, [key]: value }));
    const fail = (key) => () => setFailed((f) => ({ ...f, [key]: true }));
    const load = () => {
      getJson(`${API_BASE}/disaster_risk.php?action=get_all`)
        .then((d) => {
          put('alert')((d.alerts || []).find((a) => Number(a.is_active) === 1 && Number(a.is_practice || 0) === 0) || null);
          put('centers')(d.centers || d.evacuation_centers || []);
        })
        .catch(() => { put('alert')(null); put('centers')([]); });
      getJson(`${API_BASE}/get_public_announcements.php`)
        .then((d) => put('posts')(d.success ? d.data || [] : []))
        .catch(fail('posts'));
      getJson(`${API_BASE}/hazard_feeds.php?action=weather`)
        .then((d) => (d.success ? put('weather')(d) : fail('weather')()))
        .catch(fail('weather'));
      getJson(`${API_BASE}/hazard_feeds.php?action=live`)
        .then((d) => d.success && put('hazards')(d))
        .catch(() => {});
      getJson(`${API_BASE}/waste_management.php?action=get_all`)
        .then((d) => put('waste')(d.schedules || []))
        .catch(fail('waste'));
      getJson(`${API_BASE}/issue_map.php?action=list`)
        .then((d) => put('issues')(d.success ? { list: d.issues || [], tiers: d.tiers } : { list: [], tiers: undefined }))
        .catch(fail('issues'));
      if (resident) {
        getJson(`${API_BASE}/preparedness.php?action=my_street`)
          .then((d) => put('street')(d.success ? d : null))
          .catch(() => put('street')(null));
        getJson(`${API_BASE}/get_user_document_requests.php`)
          .then((d) => put('requests')(d.success ? d.data || [] : []))
          .catch(fail('requests'));
      }
    };
    load();
    const t = setInterval(load, REFRESH_MS);
    return () => clearInterval(t);
  }, [resident]);

  return { ...data, failed };
}
