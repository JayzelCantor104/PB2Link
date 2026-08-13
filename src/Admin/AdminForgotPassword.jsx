import React, { useState } from 'react';
import { Link } from 'react-router-dom';
import '../styles/auth1.css'; 

const API_BASE = '/api_backend';

const AdminForgotPassword = () => {
  const [email, setEmail] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    setMessage('');
    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/admin_forgot_password.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email }),
      });
      const data = await response.json();

      if (data.success) {
        setMessage(data.message);
      } else {
        setError(data.message);
      }
    } catch (err) {
      setError('Network error. Please try again.');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <main>
      <div className="auth-card">
        <div className="auth-icon">🔒</div>
        <h2>Admin Recovery</h2>
        <p>Enter your administrator email to reset your password</p>

        {error && <div className="error-banner">{error}</div>}
        {message && <div style={{ padding: '12px', background: '#ecfdf5', color: '#059669', borderRadius: '4px', marginBottom: '20px', fontWeight: 'bold' }}>{message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input type="email" required placeholder=" " value={email} onChange={(e) => setEmail(e.target.value)} />
            <label>Admin Email Address</label>
          </div>
          <button type="submit" className="btn-login" disabled={isLoading}>
            {isLoading ? 'Sending Link...' : 'Send Reset Link'}
          </button>
        </form>

        <div className="auth-footer">
          <p><Link to="/admin">Back to Admin Login</Link></p>
        </div>
      </div>
    </main>
  );
};

export default AdminForgotPassword;