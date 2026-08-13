import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';

const API_BASE = '/api_backend';

const RegisterResident = () => {
    // ALL LOGIC PRESERVED: Original state mapping for all database fields
    const [formData, setFormData] = useState({
        email: '', password: '', confirmPassword: '', 
        fName: '', mName: '', lName: '', suffix: '', 
        birth_date: '', gender: 'Male', height: '', contact_num: '', 
        civil_status: 'Single', spouse_name_text: '', blood_type: '', 
        birth_city: '', birth_province: '', birth_country: 'Philippines', religion: '', 
        house_no: '', street: '', zone: '', subdivision: '', area: '', block_lot: '', landmark: '', 
        years_in_PB2: '1', residency_status: 'Homeowner', 
        contact_person: '', contactp_num: '', contactp_relationship: '', 
        philsys_nat_id: '', valid_id: 'National ID (PhilID/ePhilID)', 
        is_senior: false, is_pwd: false, is_4ps: false, is_solo_parent: false, is_indigent: false, 
        privacy_agreed: true
    });

    // ALL LOGIC PRESERVED: File attachments state
    const [files, setFiles] = useState({
        valid_id_img_front: null,
        valid_id_img_back: null,
        valid_id_img_holding: null,
        proof_pwd: null,
        proof_4ps: null,
        proof_solo_parent: null,
        proof_indigent: null
    });

    const [message, setMessage] = useState('');
    const [error, setError] = useState('');
    const [loading, setLoading] = useState(false);
    const navigate = useNavigate();

    // ALL LOGIC PRESERVED: Event handlers
    const handleChange = (e) => {
        const { name, value, type, checked } = e.target;
        setFormData(prev => ({
            ...prev,
            [name]: type === 'checkbox' ? checked : value
        }));
    };

    const handleFileChange = (e) => {
        setFiles(prev => ({
            ...prev,
            [e.target.name]: e.target.files[0]
        }));
    };

    // ALL LOGIC PRESERVED: Form validation & multi-part API submissions
    const handleSubmit = async (e) => {
        e.preventDefault();
        setError('');
        setMessage('');

        if (formData.password !== formData.confirmPassword) {
            setError('Passwords do not match.');
            return;
        }

        if (!formData.email || !formData.fName || !formData.lName) {
            setError('Please fill in required fields.');
            return;
        }

        const data = new FormData();
        Object.entries(formData).forEach(([key, value]) => data.append(key, value));
        Object.entries(files).forEach(([key, file]) => {
            if (file) data.append(key, file);
        });

        setLoading(true);
        try {
            const res = await fetch(`${API_BASE}/register.php`, {
                method: 'POST',
                body: data
            });
            const result = await res.json();
            if (result.success) {
                setMessage('Resident registered successfully. The account is pending approval.');
                setTimeout(() => navigate('/admin/pending-users'), 1500);
            } else {
                setError(result.message || 'Unable to register resident');
            }
        } catch (err) {
            setError('Server error while registering resident.');
        } finally {
            setLoading(false);
        }
    };

    return (
        <div className="admin-page-container">
            <style>{`
                .admin-page-container {
                    max-width: 900px;
                    margin: 2rem auto;
                    padding: 0 1.5rem;
                    font-family: system-ui, -apple-system, sans-serif;
                }
                .admin-page-title {
                    font-size: 1.75rem;
                    color: #0f172a;
                    font-weight: 700;
                    margin-bottom: 0.25rem;
                }
                .admin-page-subtitle {
                    color: #64748b;
                    font-size: 0.95rem;
                    margin-bottom: 2rem;
                }
                .admin-form-card {
                    background: #ffffff;
                    border: 1px solid #e2e8f0;
                    border-radius: 0.75rem;
                    padding: 2.5rem;
                    box-shadow: 0 4px 12px rgba(0, 0, 0, 0.02);
                }
                .admin-success-box {
                    background-color: #f0fdf4;
                    border: 1px solid #bbf7d0;
                    color: #166534;
                    padding: 1rem;
                    border-radius: 0.375rem;
                    margin-bottom: 1.5rem;
                    font-size: 0.95rem;
                }
                .admin-error-box {
                    background-color: #fef2f2;
                    border: 1px solid #fca5a5;
                    color: #991b1b;
                    padding: 1rem;
                    border-radius: 0.375rem;
                    margin-bottom: 1.5rem;
                    font-size: 0.95rem;
                }
                .form-section-divider {
                    font-size: 1rem;
                    color: #2563eb;
                    font-weight: 600;
                    margin-top: 2rem;
                    margin-bottom: 1.25rem;
                    text-transform: uppercase;
                    letter-spacing: 0.5px;
                    border-bottom: 1px solid #e2e8f0;
                    padding-bottom: 0.5rem;
                }
                .form-grid-layout {
                    display: grid;
                    grid-template-columns: repeat(12, 1fr);
                    gap: 1.25rem;
                    margin-bottom: 1.5rem;
                }
                .col-3 { grid-column: span 3; }
                .col-4 { grid-column: span 4; }
                .col-5 { grid-column: span 5; }
                .col-6 { grid-column: span 6; }
                .col-7 { grid-column: span 7; }
                .col-8 { grid-column: span 8; }
                .col-9 { grid-column: span 9; }
                .col-12 { grid-column: span 12; }
                
                @media (max-width: 768px) {
                    .col-3, .col-4, .col-5, .col-6, .col-7, .col-8, .col-9, .col-12 {
                        grid-column: span 12;
                    }
                }
                .input-field-group {
                    display: flex;
                    flex-direction: column;
                    gap: 0.4rem;
                }
                .input-field-label {
                    font-size: 0.85rem;
                    font-weight: 500;
                    color: #475569;
                }
                .custom-admin-input {
                    background: #f8fafc;
                    border: 1px solid #cbd5e1;
                    border-radius: 0.375rem;
                    padding: 0.65rem 0.85rem;
                    color: #1e293b;
                    font-size: 0.95rem;
                    transition: all 0.15s ease;
                    width: 100%;
                    box-sizing: border-box;
                }
                .custom-admin-input:focus {
                    border-color: #2563eb;
                    box-shadow: 0 0 0 3px rgba(37, 99, 235, 0.12);
                    background: #ffffff;
                    outline: none;
                }
                .checkbox-flex-container {
                    display: grid;
                    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
                    gap: 1rem;
                    margin-top: 0.5rem;
                }
                .checkbox-item-wrapper {
                    display: flex;
                    align-items: center;
                    gap: 0.5rem;
                    cursor: pointer;
                    font-size: 0.9rem;
                    color: #334155;
                }
                .checkbox-item-wrapper input {
                    width: 1.1rem;
                    height: 1.1rem;
                    cursor: pointer;
                }
                .admin-action-btn {
                    background: #2563eb;
                    color: #ffffff;
                    border: none;
                    border-radius: 0.375rem;
                    padding: 0.85rem 2rem;
                    font-weight: 600;
                    font-size: 0.95rem;
                    cursor: pointer;
                    transition: background 0.15s ease;
                }
                .admin-action-btn:hover:not(:disabled) {
                    background: #1d4ed8;
                }
                .admin-action-btn:disabled {
                    background: #94a3b8;
                    cursor: not-allowed;
                }
            `}</style>

            <h2 className="admin-page-title">Register New Resident</h2>
            <p className="admin-page-subtitle">Add a resident to the system with a full profile and account credentials.</p>

            <div className="admin-form-card">
                {message && <div className="admin-success-box">{message}</div>}
                {error && <div className="admin-error-box">{error}</div>}

                <form onSubmit={handleSubmit}>
                    
                    {/* SECTION 1: SYSTEM CREDENTIALS */}
                    <div className="form-section-divider">Account Credentials</div>
                    <div className="form-grid-layout">
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Email Address</label>
                            <input type="email" name="email" className="custom-admin-input" value={formData.email} onChange={handleChange} required />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Password</label>
                            <input type="password" name="password" className="custom-admin-input" value={formData.password} onChange={handleChange} required />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Confirm Password</label>
                            <input type="password" name="confirmPassword" className="custom-admin-input" value={formData.confirmPassword} onChange={handleChange} required />
                        </div>
                    </div>

                    {/* SECTION 2: IDENTITY DETAILS */}
                    <div className="form-section-divider">Resident Profile</div>
                    <div className="form-grid-layout">
                        <div className="input-field-group col-4">
                            <label className="input-field-label">First Name</label>
                            <input type="text" name="fName" className="custom-admin-input" value={formData.fName} onChange={handleChange} required />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Middle Name</label>
                            <input type="text" name="mName" className="custom-admin-input" value={formData.mName} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Last Name</label>
                            <input type="text" name="lName" className="custom-admin-input" value={formData.lName} onChange={handleChange} required />
                        </div>
                        <div className="input-field-group col-3">
                            <label className="input-field-label">Suffix</label>
                            <input type="text" name="suffix" className="custom-admin-input" placeholder="e.g. Jr., III" value={formData.suffix} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-5">
                            <label className="input-field-label">Birth Date</label>
                            <input type="date" name="birth_date" className="custom-admin-input" value={formData.birth_date} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Gender</label>
                            <select name="gender" className="custom-admin-input" value={formData.gender} onChange={handleChange}>
                                <option value="Male">Male</option>
                                <option value="Female">Female</option>
                            </select>
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Civil Status</label>
                            <select name="civil_status" className="custom-admin-input" value={formData.civil_status} onChange={handleChange}>
                                <option value="Single">Single</option>
                                <option value="Married">Married</option>
                                <option value="Widowed">Widowed</option>
                                <option value="Separated">Separated</option>
                            </select>
                        </div>
                        <div className="input-field-group col-8">
                            <label className="input-field-label">Spouse Name (If Applicable)</label>
                            <input type="text" name="spouse_name_text" className="custom-admin-input" value={formData.spouse_name_text} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Contact Number</label>
                            <input type="text" name="contact_num" className="custom-admin-input" value={formData.contact_num} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Blood Type</label>
                            <input type="text" name="blood_type" className="custom-admin-input" placeholder="e.g. O+, A-" value={formData.blood_type} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Height (cm)</label>
                            <input type="text" name="height" className="custom-admin-input" value={formData.height} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Birth City</label>
                            <input type="text" name="birth_city" className="custom-admin-input" value={formData.birth_city} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Birth Province</label>
                            <input type="text" name="birth_province" className="custom-admin-input" value={formData.birth_province} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Birth Country</label>
                            <input type="text" name="birth_country" className="custom-admin-input" value={formData.birth_country} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-12">
                            <label className="input-field-label">Religion</label>
                            <input type="text" name="religion" className="custom-admin-input" value={formData.religion} onChange={handleChange} />
                        </div>
                    </div>

                    {/* SECTION 3: ADDRESS ENTRIES */}
                    <div className="form-section-divider">Address Information</div>
                    <div className="form-grid-layout">
                        <div className="input-field-group col-3">
                            <label className="input-field-label">House No.</label>
                            <input type="text" name="house_no" className="custom-admin-input" value={formData.house_no} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-6">
                            <label className="input-field-label">Street</label>
                            <input type="text" name="street" className="custom-admin-input" value={formData.street} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-3">
                            <label className="input-field-label">Zone / Purok</label>
                            <input type="text" name="zone" className="custom-admin-input" value={formData.zone} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-6">
                            <label className="input-field-label">Subdivision</label>
                            <input type="text" name="subdivision" className="custom-admin-input" value={formData.subdivision} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-6">
                            <label className="input-field-label">Area / Village</label>
                            <input type="text" name="area" className="custom-admin-input" value={formData.area} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Block / Lot No.</label>
                            <input type="text" name="block_lot" className="custom-admin-input" value={formData.block_lot} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-8">
                            <label className="input-field-label">Landmark</label>
                            <input type="text" name="landmark" className="custom-admin-input" value={formData.landmark} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Residency Status</label>
                            <select name="residency_status" className="custom-admin-input" value={formData.residency_status} onChange={handleChange}>
                                <option value="Homeowner">Homeowner</option>
                                <option value="Tenant">Tenant</option>
                                <option value="Sharer">Sharer</option>
                            </select>
                        </div>
                        <div className="input-field-group col-8">
                            <label className="input-field-label">Years in PB2</label>
                            <input type="number" name="years_in_PB2" className="custom-admin-input" value={formData.years_in_PB2} onChange={handleChange} />
                        </div>
                    </div>

                    {/* SECTION 4: EMERGENCY CONTACTS */}
                    <div className="form-section-divider">Emergency Contacts</div>
                    <div className="form-grid-layout">
                        <div className="input-field-group col-12">
                            <label className="input-field-label">Contact Person Name</label>
                            <input type="text" name="contact_person" className="custom-admin-input" value={formData.contact_person} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-6">
                            <label className="input-field-label">Relationship Designation</label>
                            <input type="text" name="contactp_relationship" className="custom-admin-input" value={formData.contactp_relationship} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-6">
                            <label className="input-field-label">Emergency Mobile No.</label>
                            <input type="text" name="contactp_num" className="custom-admin-input" value={formData.contactp_num} onChange={handleChange} />
                        </div>
                    </div>

                    {/* SECTION 5: NATIONAL ID / SELECTIONS */}
                    <div className="form-section-divider">Government Identifiers & Sector Status</div>
                    <div className="form-grid-layout">
                        <div className="input-field-group col-6">
                            <label className="input-field-label">PhilSys National ID No.</label>
                            <input type="text" name="philsys_nat_id" className="custom-admin-input" placeholder="0000-0000000-0" value={formData.philsys_nat_id} onChange={handleChange} />
                        </div>
                        <div className="input-field-group col-6">
                            <label className="input-field-label">Presented ID Type</label>
                            <select name="valid_id" className="custom-admin-input" value={formData.valid_id} onChange={handleChange}>
                                <option value="National ID (PhilID/ePhilID)">National ID (PhilID/ePhilID)</option>
                                <option value="Passport">Passport</option>
                                <option value="Driver's License">Driver's License</option>
                                <option value="UMID">UMID</option>
                                <option value="SSS / GSIS ID">SSS / GSIS ID</option>
                                <option value="Other Valid ID">Other Valid ID</option>
                            </select>
                        </div>
                        <div className="col-12">
                            <label className="input-field-label">Sector Categorizations</label>
                            <div className="checkbox-flex-container">
                                <label className="checkbox-item-wrapper">
                                    <input type="checkbox" name="is_senior" checked={formData.is_senior} onChange={handleChange} />
                                    Senior Citizen
                                </label>
                                <label className="checkbox-item-wrapper">
                                    <input type="checkbox" name="is_pwd" checked={formData.is_pwd} onChange={handleChange} />
                                    PWD (Person with Disability)
                                </label>
                                <label className="checkbox-item-wrapper">
                                    <input type="checkbox" name="is_4ps" checked={formData.is_4ps} onChange={handleChange} />
                                    4Ps Beneficiary
                                </label>
                                <label className="checkbox-item-wrapper">
                                    <input type="checkbox" name="is_solo_parent" checked={formData.is_solo_parent} onChange={handleChange} />
                                    Solo Parent
                                </label>
                                <label className="checkbox-item-wrapper">
                                    <input type="checkbox" name="is_indigent" checked={formData.is_indigent} onChange={handleChange} />
                                    Indigent Status
                                </label>
                            </div>
                        </div>
                    </div>

                    {/* SECTION 6: SUPPORTING DOCUMENT ATTACHMENTS */}
                    <div className="form-section-divider">Supporting Documents File Upload</div>
                    <div className="form-grid-layout">
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Valid ID Front Image</label>
                            <input type="file" name="valid_id_img_front" className="custom-admin-input" accept="image/*" onChange={handleFileChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Valid ID Back Image</label>
                            <input type="file" name="valid_id_img_back" className="custom-admin-input" accept="image/*" onChange={handleFileChange} />
                        </div>
                        <div className="input-field-group col-4">
                            <label className="input-field-label">Holding ID Selfie Verification</label>
                            <input type="file" name="valid_id_img_holding" className="custom-admin-input" accept="image/*" onChange={handleFileChange} />
                        </div>
                        
                        {/* Dynamic/Conditional proofs based on original logic states */}
                        {formData.is_pwd && (
                            <div className="input-field-group col-6">
                                <label className="input-field-label">Proof of PWD Card Document</label>
                                <input type="file" name="proof_pwd" className="custom-admin-input" accept="image/*,application/pdf" onChange={handleFileChange} />
                            </div>
                        )}
                        {formData.is_4ps && (
                            <div className="input-field-group col-6">
                                <label className="input-field-label">Proof of 4Ps Documentation</label>
                                <input type="file" name="proof_4ps" className="custom-admin-input" accept="image/*,application/pdf" onChange={handleFileChange} />
                            </div>
                        )}
                        {formData.is_solo_parent && (
                            <div className="input-field-group col-6">
                                <label className="input-field-label">Proof of Solo Parent ID</label>
                                <input type="file" name="proof_solo_parent" className="custom-admin-input" accept="image/*,application/pdf" onChange={handleFileChange} />
                            </div>
                        )}
                        {formData.is_indigent && (
                            <div className="input-field-group col-6">
                                <label className="input-field-label">Certificate of Indigency File</label>
                                <input type="file" name="proof_indigent" className="custom-admin-input" accept="image/*,application/pdf" onChange={handleFileChange} />
                            </div>
                        )}
                    </div>

                    <div style={{ marginTop: '2.5rem', display: 'flex', justifyContent: 'flex-end' }}>
                        <button type="submit" className="admin-action-btn" disabled={loading}>
                            {loading ? 'Saving Resident Profile...' : 'Save Resident Profile'}
                        </button>
                    </div>
                </form>
            </div>
        </div>
    );
};

export default RegisterResident;