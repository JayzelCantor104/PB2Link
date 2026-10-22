import { EMERGENCY_URL, useOnline } from '../lib/offline';
import '../styles/offline.css';

// Shown on every page while the phone has no connection: the full site needs
// signal, but the emergency page is kept on the phone (public/sw.js).
const OfflineBanner = () => {
  const online = useOnline();
  if (online) return null;
  return (
    <div className="pb2-offline" role="status">
      <i className="bi bi-wifi-off" aria-hidden="true"></i>
      <span>You’re offline. Advisories, hotlines and evacuation centers saved on this phone are still available.</span>
      {/* A full page load, so the service worker can answer without the network. */}
      <a href={EMERGENCY_URL}>Open emergency info</a>
    </div>
  );
};

export default OfflineBanner;
