import { useState } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import '../styles/auth1.css'; // Inherits your existing crisp canvas/login form theme

const SetupPassword = () => {
    const [searchParams] = useSearchParams();
    const token = searchParams.get('token');
    const navigate = useNavigate();

    const [passwords, setPasswords] = useState({ password: '', confirmPassword: '' });
    const [message, setMessage] = useState({ type: '', text: '' });
    const [isSubmitting, setIsSubmitting] = useState(false);

    const handleSubmit = async (e) => {
        e.preventDefault();
        setMessage({ type: '', text: '' });

        if (passwords.password.length < 8) {
            setMessage({ type: 'error', text: 'Password must be at least 8 characters long.' });
            return;
        }

        if (passwords.password !== passwords.confirmPassword) {
            setMessage({ type: 'error', text: 'Passwords do not match.' });
            return;
        }

        setIsSubmitting(true);
        try {
            const response = await fetch('http://localhost/PB2Link/backend/api/admin_setup_password.php', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ token, password: passwords.password })
            });
            const data = await response.json();

            if (data.success) {
                setMessage({ type: 'success', text: 'Password configured successfully! Redirecting...' });
                setTimeout(() => navigate('/admin/login'), 3000);
            } else {
                setMessage({ type: 'error', text: data.message || 'Verification link expired or invalid.' });
            }
        } catch (err) {
            setMessage({ type: 'error', text: 'Network connection error.' });
        } finally {
            setIsSubmitting(false);
        }
    };

    return (
        <main style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100vh' }}>
            <div className="auth-card text-start">
                <div className="auth-icon">🔑</div>
                <h2>Account Activation</h2>
                <p>Configure a strong password to securely complete your administrator profile access setup.</p>

                {message.text && (
                    <div className={message.type === 'success' ? 'success-banner' : 'error-banner'} style={{ padding: '12px', borderRadius: '8px', marginBottom: '16px', fontSize: '0.9rem', background: message.type === 'success' ? '#ecfdf5' : '#fef2f2', color: message.type === 'success' ? '#047857' : '#b91c1c' }}>
                        {message.text}
                    </div>
                )}

                <form onSubmit={handleSubmit}>
                    <div className="input-group mb-3">
                        <input 
                            type="password" 
                            required 
                            placeholder=" "
                            value={passwords.password}
                            onChange={e => setPasswords({ ...passwords, password: e.target.value })}
                        />
                        <label>New Password</label>
                    </div>

                    <div className="input-group mb-4">
                        <input 
                            type="password" 
                            required 
                            placeholder=" "
                            value={passwords.confirmPassword}
                            onChange={e => setPasswords({ ...passwords, confirmPassword: e.target.value })}
                        />
                        <label>Confirm Password</label>
                    </div>

                    <button type="submit" className="btn-login" disabled={isSubmitting || !token}>
                        {isSubmitting ? 'Configuring Access...' : 'Activate Admin Account'}
                    </button>
                </form>
            </div>
        </main>
    );
};

export default SetupPassword;