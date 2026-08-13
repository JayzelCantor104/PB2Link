import React, { useState } from 'react';
import { useSearchParams, Link, useNavigate } from 'react-router-dom';
import '../styles/auth1.css'; 

const API_BASE = '/api_backend';

const AdminResetPassword = () => {
  const [searchParams] = useSearchParams();
  const token = searchParams.get('token');
  const navigate = useNavigate();
  
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [message, setMessage] = useState('');
  const [error, setError] = useState('');
  const [isLoading, setIsLoading] = useState(false);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');
    
    if (!token) {
        return setError("Invalid link. No reset token found.");
    }
    if (password !== confirmPassword) {
        return setError("Passwords do not match.");
    }
    if (password.length < 8) {
        return setError("Password must be at least 8 characters.");
    }

    setIsLoading(true);

    try {
      const response = await fetch(`${API_BASE}/admin_reset_password.php`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, password }),
      });
      const data = await response.json();

      if (data.success) {
        setMessage("Password successfully reset! Redirecting to login...");
        setTimeout(() => navigate('/admin'), 3000);
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
        <div className="auth-icon">🔑</div>
        <h2>Create New Password</h2>
        <p>Secure your administrator account</p>

        {error && <div className="error-banner">{error}</div>}
        {message && <div style={{ padding: '12px', background: '#ecfdf5', color: '#059669', borderRadius: '4px', marginBottom: '20px', fontWeight: 'bold' }}>{message}</div>}

        <form onSubmit={handleSubmit}>
          <div className="input-group">
            <input type="password" required placeholder=" " value={password} onChange={(e) => setPassword(e.target.value)} />
            <label>New Password</label>
          </div>
          <div className="input-group">
            <input type="password" required placeholder=" " value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
            <label>Confirm Password</label>
          </div>
          <button type="submit" className="btn-login" disabled={isLoading || message}>
            {isLoading ? 'Updating...' : 'Save New Password'}
          </button>
        </form>

        <div className="auth-footer">
          <p><Link to="/admin">Back to Admin Login</Link></p>
        </div>
      </div>
    </main>
  );
};

export default AdminResetPassword;