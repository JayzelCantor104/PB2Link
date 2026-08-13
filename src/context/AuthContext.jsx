import { createContext, useContext, useState, useEffect } from 'react';

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

      if (storedUser) setUser(JSON.parse(storedUser));

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

  // Citizen Authentication
  const login = (userData) => {
    setUser(userData);
    localStorage.setItem('citizen_user', JSON.stringify(userData));
  };

  const logout = async () => {
    setUser(null);
    localStorage.removeItem('citizen_user');
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
      user, login, logout,
      adminUser, adminLogin, adminLogout,
      loading
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext;
