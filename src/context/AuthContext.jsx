import { createContext, useContext, useState, useEffect } from 'react';

const API_BASE = '/api_backend';
const AuthContext = createContext();

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth must be used within AuthProvider');
  return context;
};

export const AuthProvider = ({ children }) => {
  const [user, setUser] = useState(null);           // Resident State
  const [adminUser, setAdminUser] = useState(null); // Super / Admin / Staff State
  const [loading, setLoading] = useState(true);     // Synchronous Loading Guard

  useEffect(() => {
    let cancelled = false;

    const bootstrap = async () => {
      try {
        // Read unified user session from localStorage
        const storedUser = localStorage.getItem('userData');

        if (storedUser) {
          const parsed = JSON.parse(storedUser);
          // Safely resolve role property across schema versions
          const role = parsed.role || parsed.actor_role || 'Resident';

          if (['Super', 'Admin', 'Staff'].includes(role)) {
            setAdminUser(parsed);
            setUser(null);
          } else {
            setUser(parsed);
            setAdminUser(null);
          }
        }
      } catch (e) {
        console.error("Failed parsing stored session:", e);
      } finally {
        if (!cancelled) {
          setLoading(false); // Only set loading false AFTER session state is set
        }
      }
    };

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, []);

  // Universal login handler called upon successful authentication
  const loginSuccess = (userData) => {
    const role = userData.role || userData.actor_role || 'Resident';
    
    // Store unified object in localStorage
    localStorage.setItem('userData', JSON.stringify(userData));

    if (['Super', 'Admin', 'Staff'].includes(role)) {
      setAdminUser(userData);
      setUser(null);
    } else {
      setUser(userData);
      setAdminUser(null);
    }
  };

  const login = (userData) => loginSuccess(userData);

  const updateUser = (changes) => {
    const targetSetter = adminUser ? setAdminUser : setUser;
    targetSetter(prev => {
      if (!prev) return prev;
      const next = { ...prev, ...changes };
      localStorage.setItem('userData', JSON.stringify(next));
      return next;
    });
  };

  const logout = async () => {
    const isAdmin = !!adminUser;
    
    setUser(null);
    setAdminUser(null);
    localStorage.removeItem('userData');
    localStorage.removeItem('admin_user');
    localStorage.removeItem('citizen_user');

    try {
      const endpoint = isAdmin ? `${API_BASE}/admin_logout.php` : `${API_BASE}/logout.php`;
      await fetch(endpoint, { method: 'POST', credentials: 'include' });
    } catch {
      // Local session cleared regardless of network response
    }
  };

  return (
    <AuthContext.Provider value={{
      user,
      adminUser,
      loginSuccess,
      login,
      logout,
      updateUser,
      loading
    }}>
      {!loading && children}
    </AuthContext.Provider>
  );
};

export default AuthContext;