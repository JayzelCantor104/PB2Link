import axios from 'axios';

/**
 * Global HTTP setup for administrative API calls.
 * Ensures PHP session cookies are passed with cross-origin requests.
 */
axios.defaults.withCredentials = true;

/**
 * Clear session local storage keys and redirect to the unified login screen.
 * Exported so fetch-based administrative callers can reuse the same behavior.
 */
export function forceAdminReauth() {
  localStorage.removeItem('userData');
  localStorage.removeItem('user');
  localStorage.removeItem('admin_user');
  localStorage.removeItem('citizen_user');

  if (!window.location.pathname.startsWith('/login')) {
    // Full assignment guarantees no stale admin memory state remains
    window.location.assign('/login');
  }
}

/**
 * Treat a response as an auth failure if the server returns 401/403
 * or explicitly tags the payload with auth_error: true.
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