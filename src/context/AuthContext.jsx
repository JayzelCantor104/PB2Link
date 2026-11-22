import { createContext, useContext, useState, useEffect, useCallback, useRef } from 'react';
import { clearAdminFormDrafts, clearAllFormDrafts } from '../lib/formDraftStore';

const API_BASE = '/api_backend';

const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null); // Citizen state
  const [adminUser, setAdminUser] = useState(null); // Admin state
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      // Check for both independently on app load
      const storedUser = localStorage.getItem('citizen_user');
      const storedAdmin = localStorage.getItem('admin_user');

      let parsed = storedUser ? JSON.parse(storedUser) : null;
      if (parsed) {
        setUser(parsed);

        // The server is the judge of the citizen session: it ends when an
        // account is archived or sent back for review, and is restricted while
        // a registration is being fixed (migration 027). A server that can't
        // be reached keeps the stored copy.
        try {
          const res = await fetch(`${API_BASE}/check_session.php`, { credentials: 'include' });
          const session = await res.json();
          if (cancelled) return;
          if (!session.user_id && !session.unavailable) {
            setUser(null);
            localStorage.removeItem('citizen_user');
            clearAllFormDrafts(); // signed out elsewhere: drop saved form answers
            parsed = null;
          } else if (session.user_id && (!!session.restricted !== !!parsed.restricted
            || (session.status && session.status !== parsed.status))) {
            // Restricted mode and the account status both follow the server
            // (an account approved after signing in to fix it is Active now).
            parsed = { ...parsed, restricted: !!session.restricted, ...(session.status ? { status: session.status } : {}) };
            setUser(parsed);
            localStorage.setItem('citizen_user', JSON.stringify(parsed));
          }
        } catch {
          // Offline: keep the stored session; API calls will say if it ended.
        }
      }

      if (parsed) {
        // Sessions saved before login.php returned the photo/name (or after
        // the photo changed) would otherwise show a stale header avatar until
        // the next sign-in. Best-effort only: a failure keeps the stored copy.
        fetch(`${API_BASE}/get_profile.php`, { credentials: 'include' })
          .then(res => res.json())
          .then(data => {
            if (cancelled || !data.success || !data.user) return;
            const refreshed = {
              ...parsed,
              fName: data.user.fName,
              lName: data.user.lName,
              profile_picture: data.user.profile_picture || null
            };
            setUser(refreshed);
            localStorage.setItem('citizen_user', JSON.stringify(refreshed));
          })
          .catch(() => {});
      }

      // localStorage alone is not proof of an admin session — the server holds
      // the real one. Verify before trusting it, otherwise a stale entry leaves
      // the UI looking signed in while every API call returns 401.
      if (storedAdmin) {
        try {
          const res = await fetch(`${API_BASE}/check_admin_session.php`, {
            credentials: 'include',
          });
          const data = await res.json();

          if (cancelled) return;

          if (data.authenticated) {
            // Trust the server's copy of role/identity over localStorage.
            const verified = { ...JSON.parse(storedAdmin), ...data.adminData };
            setAdminUser(verified);
            localStorage.setItem('admin_user', JSON.stringify(verified));
          } else {
            setAdminUser(null);
            localStorage.removeItem('admin_user');
          }
        } catch {
          // Network/server unreachable: fail closed rather than granting an
          // admin shell we could not verify.
          if (cancelled) return;
          setAdminUser(null);
          localStorage.removeItem('admin_user');
        }
      }

      if (!cancelled) setLoading(false);
    };

    bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  /**
   * Re-reads the citizen session from the server (check_session.php) and
   * updates the signed-in resident: status and restricted mode follow the
   * server, and a session that ended signs the browser out. The server is the
   * judge for every service that needs signing in, so an account approved,
   * sent back or archived shows right away instead of at the next sign-in.
   * Resolves to the current user (or null); an unreachable server keeps the
   * stored copy. Calls within 5 seconds share one request.
   */
  const lastCheck = useRef({ at: 0, promise: null });
  const refreshSession = useCallback(async ({ force = false } = {}) => {
    const stored = localStorage.getItem('citizen_user');
    if (!stored) return null;
    const now = Date.now();
    if (!force && lastCheck.current.promise && now - lastCheck.current.at < 5000) return lastCheck.current.promise;
    const run = (async () => {
      try {
        const res = await fetch(`${API_BASE}/check_session.php`, { credentials: 'include' });
        const session = await res.json();
        const current = JSON.parse(localStorage.getItem('citizen_user') || 'null');
        if (!current) return null;
        if (!session.user_id && !session.unavailable) {
          setUser(null);
          localStorage.removeItem('citizen_user');
          clearAllFormDrafts();
          return null;
        }
        if (session.user_id && (!!session.restricted !== !!current.restricted
          || (session.status && session.status !== current.status))) {
          const next = { ...current, restricted: !!session.restricted, ...(session.status ? { status: session.status } : {}) };
          setUser(next);
          localStorage.setItem('citizen_user', JSON.stringify(next));
          return next;
        }
        return current;
      } catch {
        return JSON.parse(localStorage.getItem('citizen_user') || 'null');
      }
    })();
    lastCheck.current = { at: now, promise: run };
    return run;
  }, []);

  // While a resident is signed in: re-check when the tab comes back into view
  // and every minute, so a decision made by staff shows without a reload.
  const signedIn = !!user;
  useEffect(() => {
    if (!signedIn) return undefined;
    const onVisible = () => { if (document.visibilityState === 'visible') refreshSession(); };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    const timer = setInterval(onVisible, 60000);
    return () => {
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      clearInterval(timer);
    };
  }, [signedIn, refreshSession]);

  // Citizen Authentication
  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('citizen_user', JSON.stringify(userData));
  };

  // Merge fresh profile fields (e.g. a new profile photo) into the signed-in
  // citizen so the header updates without a re-login.
  const updateUser = (changes) => {
    setUser(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...changes };
      localStorage.setItem('citizen_user', JSON.stringify(next));
      return next;
    });
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('citizen_user');
    clearAllFormDrafts(); // the next person on this computer must not see them
    try {
      await fetch(`${API_BASE}/logout.php`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // Local state is already cleared; a failed server call must not block
      // the user from signing out.
    }
  };

  // Admin Authentication
  const adminLogin = (adminData) => {
    // adminData must include { role: 'Super' } or { role: 'Admin' } from PHP.
    // The server session is established by admin_login.php; this only mirrors
    // it into React state for rendering.
    setAdminUser(adminData);
    localStorage.setItem('admin_user', JSON.stringify(adminData));
  };

  const adminLogout = async () => {
    setAdminUser(null);
    localStorage.removeItem('admin_user');
    clearAdminFormDrafts(); // staff drafts must not outlive the sign-out on a shared computer
    try {
      await fetch(`${API_BASE}/admin_logout.php`, {
        method: 'POST',
        credentials: 'include',
      });
    } catch {
      // As above: never trap the user in a signed-in UI.
    }
  };

  return (
    <AuthContext.Provider value={{
      user, login, logout, updateUser, refreshSession,
      adminUser, adminLogin, adminLogout,
      loading
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
