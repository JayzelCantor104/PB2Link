import axios from 'axios';

/**
 * Global HTTP setup for the admin area.
 *
 * axios is used ONLY by pages under src/Admin/ (citizen pages in src/pages/ use
 * fetch), so the interceptor below is admin-scoped by construction and will not
 * sign a citizen out.
 */

// Send the PHP session cookie. Through the Vite dev proxy these calls are
// same-origin so cookies would flow anyway, but this keeps them working if the
// frontend is ever served from a different origin than the API.
axios.defaults.withCredentials = true;

/**
 * Clear the admin session locally and bounce to the login screen.
 * Exported so fetch-based admin callers can reuse the same behaviour.
 */
export function forceAdminReauth() {
  localStorage.removeItem('admin_user');
  if (!window.location.pathname.startsWith('/admin/login')) {
    // Full assignment rather than react-router navigate(): this runs outside
    // component scope, and a hard reload guarantees no stale admin state.
    window.location.assign('/admin/login');
  }
}

/**
 * Treat a response as an auth failure if the server said 401/403. The backend
 * also sets `auth_error: true` on those bodies.
 */
export function isAuthFailure(status, body) {
  return status === 401 || status === 403 || body?.auth_error === true;
}

axios.interceptors.response.use(
  (response) => response,
  (error) => {
    const status = error?.response?.status;
    if (isAuthFailure(status, error?.response?.data)) {
      forceAdminReauth();
    }
    return Promise.reject(error);
  }
);

export default axios;
