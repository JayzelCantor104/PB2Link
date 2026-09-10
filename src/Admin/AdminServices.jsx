import React, { useState, useEffect } from 'react';
import axios from 'axios';

const API_BASE = '/api_backend';

const AdminServices = () => {
  const [services, setServices] = useState([]);
  const [loading, setLoading] = useState(true);
  const [selectedService, setSelectedService] = useState(null);

  // Modal states
  const [showServiceModal, setShowServiceModal] = useState(false);
  const [showFieldModal, setShowFieldModal] = useState(false);

  // Service form state
  const [serviceForm, setServiceForm] = useState({
    service_id: null,
    title: '',
    category: 'Clearance & Certification',
    description: '',
    allow_third_party: 1,
    is_active: 1
  });

  // Dynamic field form state
  const [fieldForm, setFieldForm] = useState({
    field_id: null,
    service_id: null,
    step_section: 'Identity',
    field_label: '',
    field_name: '',
    field_type: 'text',
    field_options: '',
    is_required: 1,
    show_for_target: 'all',
    sort_order: 0
  });

  const [serviceFields, setServiceFields] = useState([]);

  useEffect(() => {
    fetchServices();
  }, []);

  // Fetch all services
  const fetchServices = async () => {
    setLoading(true);
    try {
      const res = await axios.get(`${API_BASE}/services.php?action=get_all`);
      if (res.data && res.data.success) {
        setServices(res.data.services || []);
      }
    } catch (err) {
      console.error('Error fetching services:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch fields for selected service
  const fetchServiceFields = async (serviceId) => {
    try {
      const res = await axios.get(`${API_BASE}/services.php?action=get_fields&service_id=${serviceId}`);
      if (res.data && res.data.success) {
        setServiceFields(res.data.fields || []);
      }
    } catch (err) {
      console.error('Error fetching fields:', err);
    }
  };

  const handleSelectService = (service) => {
    const serviceId = service.service_id || service.id;
    setSelectedService(service);
    fetchServiceFields(serviceId);
  };

  // Toggle active/inactive status
  const handleToggleActive = async (service) => {
    const serviceId = service.service_id || service.id;
    const updatedStatus = service.is_active == 1 ? 0 : 1;
    try {
      const res = await axios.post(`${API_BASE}/services.php?action=toggle_status`, {
        service_id: serviceId,
        is_active: updatedStatus
      });
      if (res.data && res.data.success) {
        fetchServices();
        const activeId = selectedService?.service_id || selectedService?.id;
        if (activeId === serviceId) {
          setSelectedService({ ...selectedService, is_active: updatedStatus });
        }
      }
    } catch (err) {
      console.error('Error toggling status:', err);
    }
  };

  // Save or update service
  const handleSaveService = async (e) => {
    e.preventDefault();
    try {
      const res = await axios.post(`${API_BASE}/services.php?action=save_service`, serviceForm);
      if (res.data && res.data.success) {
        setShowServiceModal(false);
        fetchServices();
      } else {
        alert(res.data?.message || 'Failed to save service.');
      }
    } catch (err) {
      console.error('Error saving service:', err);
      alert('An error occurred while communicating with the server.');
    }
  };

  // Save or update field
  const handleSaveField = async (e) => {
    e.preventDefault();
    const activeServiceId = selectedService?.service_id || selectedService?.id;
    try {
      const res = await axios.post(`${API_BASE}/services.php?action=save_field`, {
        ...fieldForm,
        service_id: activeServiceId
      });
      if (res.data && res.data.success) {
        setShowFieldModal(false);
        fetchServiceFields(activeServiceId);
      } else {
        alert(res.data?.message || 'Failed to save field.');
      }
    } catch (err) {
      console.error('Error saving field:', err);
      alert('An error occurred while communicating with the server.');
    }
  };

  const openServiceModal = (service = null) => {
    if (service) {
      setServiceForm({
        ...service,
        service_id: service.service_id || service.id
      });
    } else {
      setServiceForm({
        service_id: null,
        title: '',
        category: 'Clearance & Certification',
        description: '',
        allow_third_party: 1,
        is_active: 1
      });
    }
    setShowServiceModal(true);
  };

  const openFieldModal = (field = null) => {
    const activeServiceId = selectedService?.service_id || selectedService?.id;
    if (field) {
      setFieldForm({ ...field });
    } else {
      setFieldForm({
        field_id: null,
        service_id: activeServiceId,
        step_section: 'Identity',
        field_label: '',
        field_name: '',
        field_type: 'text',
        field_options: '',
        is_required: 1,
        show_for_target: 'all',
        sort_order: serviceFields.length + 1
      });
    }
    setShowFieldModal(true);
  };

  return (
    <div className="admin-services-container" style={{ padding: '24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '24px' }}>
        <div>
          <h2 style={{ margin: 0, fontWeight: 700 }}>Services & Form Builder</h2>
          <p style={{ color: '#666', margin: '4px 0 0 0' }}>Manage online barangay services, form fields, and operational availability.</p>
        </div>
        <button className="btn-primary" onClick={() => openServiceModal()} style={{ padding: '10px 18px', borderRadius: '8px', cursor: 'pointer', background: '#00a86b', color: '#fff', border: 'none', fontWeight: 600 }}>
          <i className="fas fa-plus" style={{ marginRight: '8px' }}></i> Add New Service
        </button>
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr', gap: '24px' }}>
        {/* LEFT COLUMN: SERVICE LIST */}
        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          <h3 style={{ marginTop: 0, fontSize: '18px', borderBottom: '1px solid #f0f0f0', paddingBottom: '12px' }}>
            Configured Services
          </h3>

          {loading ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '20px' }}>Loading services...</p>
          ) : services.length === 0 ? (
            <p style={{ textAlign: 'center', color: '#888', padding: '20px' }}>No services created yet.</p>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
              {services.map((s) => {
                const serviceId = s.service_id || s.id;
                const activeId = selectedService?.service_id || selectedService?.id;
                const isSelected = activeId === serviceId;

                return (
                  <div
                    key={serviceId}
                    onClick={() => handleSelectService(s)}
                    style={{
                      padding: '14px',
                      borderRadius: '8px',
                      border: isSelected ? '2px solid #00a86b' : '1px solid #e2e8f0',
                      background: isSelected ? '#f0fff4' : '#fff',
                      cursor: 'pointer',
                      transition: 'all 0.2s ease'
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start' }}>
                      <h4 style={{ margin: 0, fontSize: '16px', color: '#2d3748' }}>{s.title}</h4>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggleActive(s);
                        }}
                        style={{
                          border: 'none',
                          padding: '4px 10px',
                          borderRadius: '12px',
                          fontSize: '12px',
                          fontWeight: 600,
                          cursor: 'pointer',
                          background: s.is_active == 1 ? '#d1fae5' : '#fee2e2',
                          color: s.is_active == 1 ? '#065f46' : '#991b1b'
                        }}
                      >
                        {s.is_active == 1 ? '● Open' : '○ Closed'}
                      </button>
                    </div>
                    <p style={{ fontSize: '12px', color: '#718096', margin: '6px 0 0 0' }}>{s.category}</p>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* RIGHT COLUMN: FIELD BUILDER */}
        <div style={{ background: '#fff', padding: '20px', borderRadius: '12px', border: '1px solid #e2e8f0' }}>
          {selectedService ? (
            <div>
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1px solid #f0f0f0', paddingBottom: '12px', marginBottom: '20px' }}>
                <div>
                  <h3 style={{ margin: 0, fontSize: '20px' }}>{selectedService.title}</h3>
                  <span style={{ fontSize: '13px', color: '#666' }}>
                    Third-Party Requests Allowed: <strong>{selectedService.allow_third_party == 1 ? 'Yes (Myself / Someone Else)' : 'No (Myself Only)'}</strong>
                  </span>
                </div>
                <div style={{ display: 'flex', gap: '8px' }}>
                  <button onClick={() => openServiceModal(selectedService)} style={{ padding: '8px 14px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#f8fafc', cursor: 'pointer' }}>
                    <i className="fas fa-edit"></i> Edit Service Details
                  </button>
                  <button onClick={() => openFieldModal()} style={{ padding: '8px 14px', borderRadius: '6px', border: 'none', background: '#00a86b', color: '#fff', cursor: 'pointer' }}>
                    <i className="fas fa-plus"></i> Add Form Field
                  </button>
                </div>
              </div>

              {['Identity', 'Residency', 'Uploads', 'Review'].map((step) => {
                const stepFields = serviceFields.filter((f) => f.step_section === step);
                return (
                  <div key={step} style={{ marginBottom: '24px', background: '#f8fafc', padding: '16px', borderRadius: '8px', border: '1px solid #edf2f7' }}>
                    <h4 style={{ marginTop: 0, color: '#2b6cb0', fontSize: '15px', textTransform: 'uppercase', letterSpacing: '0.5px' }}>
                      Step Section: {step}
                    </h4>

                    {stepFields.length === 0 ? (
                      <p style={{ fontSize: '13px', color: '#a0aec0', fontStyle: 'italic', margin: 0 }}>No dynamic fields added to this step.</p>
                    ) : (
                      <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '14px' }}>
                        <thead>
                          <tr style={{ textAlign: 'left', borderBottom: '1px solid #e2e8f0', color: '#718096' }}>
                            <th style={{ padding: '8px' }}>Label</th>
                            <th style={{ padding: '8px' }}>Type</th>
                            <th style={{ padding: '8px' }}>Visibility</th>
                            <th style={{ padding: '8px' }}>Required</th>
                            <th style={{ padding: '8px', textAlign: 'right' }}>Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {stepFields.map((field) => (
                            <tr key={field.field_id} style={{ borderBottom: '1px solid #edf2f7' }}>
                              <td style={{ padding: '10px 8px', fontWeight: 600 }}>{field.field_label}</td>
                              <td style={{ padding: '10px 8px' }}><code style={{ background: '#e2e8f0', padding: '2px 6px', borderRadius: '4px' }}>{field.field_type}</code></td>
                              <td style={{ padding: '10px 8px' }}>
                                <span style={{
                                  padding: '2px 8px', borderRadius: '10px', fontSize: '11px', fontWeight: 600,
                                  background: field.show_for_target === 'someone_else_only' ? '#feefc3' : field.show_for_target === 'myself_only' ? '#e8f0fe' : '#e6f4ea',
                                  color: field.show_for_target === 'someone_else_only' ? '#b06000' : field.show_for_target === 'myself_only' ? '#1a73e8' : '#137333'
                                }}>
                                  {field.show_for_target === 'someone_else_only' ? 'Someone Else Only' : field.show_for_target === 'myself_only' ? 'Myself Only' : 'All Requests'}
                                </span>
                              </td>
                              <td style={{ padding: '10px 8px' }}>{field.is_required == 1 ? 'Yes' : 'No'}</td>
                              <td style={{ padding: '10px 8px', textAlign: 'right' }}>
                                <button onClick={() => openFieldModal(field)} style={{ border: 'none', background: 'none', color: '#3182ce', cursor: 'pointer', marginRight: '8px' }}>Edit</button>
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    )}
                  </div>
                );
              })}
            </div>
          ) : (
            <div style={{ textAlign: 'center', padding: '60px 20px', color: '#a0aec0' }}>
              <i className="fas fa-hand-pointer" style={{ fontSize: '36px', marginBottom: '12px' }}></i>
              <p>Select a service from the left list to configure its form fields and steps.</p>
            </div>
          )}
        </div>
      </div>

      {/* SERVICE MODAL */}
      {showServiceModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '480px', maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0 }}>{serviceForm.service_id ? 'Edit Service' : 'Add New Service'}</h3>
            <form onSubmit={handleSaveService}>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>Service Title *</label>
                <input type="text" required value={serviceForm.title} onChange={(e) => setServiceForm({ ...serviceForm, title: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }} placeholder="e.g. Barangay Clearance" />
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>Category</label>
                <select value={serviceForm.category} onChange={(e) => setServiceForm({ ...serviceForm, category: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option>Clearance & Certification</option>
                  <option>Facility Reservation</option>
                  <option>Permit</option>
                  <option>Registration</option>
                  <option>Other</option>
                </select>
              </div>
              <div style={{ marginBottom: '14px' }}>
                <label style={{ display: 'block', marginBottom: '6px', fontSize: '14px', fontWeight: 600 }}>Description</label>
                <textarea rows="3" value={serviceForm.description} onChange={(e) => setServiceForm({ ...serviceForm, description: e.target.value })} style={{ width: '100%', padding: '10px', borderRadius: '6px', border: '1px solid #cbd5e1' }}></textarea>
              </div>
              <div style={{ marginBottom: '14px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="third_party" checked={serviceForm.allow_third_party == 1} onChange={(e) => setServiceForm({ ...serviceForm, allow_third_party: e.target.checked ? 1 : 0 })} />
                <label htmlFor="third_party" style={{ fontSize: '14px' }}>Allow requests for family/third-party ("Someone Else")</label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px', marginTop: '20px' }}>
                <button type="button" onClick={() => setShowServiceModal(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#00a86b', color: '#fff', cursor: 'pointer' }}>Save Service</button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* FIELD MODAL */}
      {showFieldModal && (
        <div style={{ position: 'fixed', top: 0, left: 0, width: '100%', height: '100%', background: 'rgba(0,0,0,0.5)', display: 'flex', alignItems: 'center', justifyContent: 'center', zIndex: 1000 }}>
          <div style={{ background: '#fff', padding: '24px', borderRadius: '12px', width: '520px', maxWidth: '90%' }}>
            <h3 style={{ marginTop: 0 }}>{fieldForm.field_id ? 'Edit Field' : 'Add Dynamic Field'}</h3>
            <form onSubmit={handleSaveField}>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600 }}>Form Wizard Step Section</label>
                <select value={fieldForm.step_section} onChange={(e) => setFieldForm({ ...fieldForm, step_section: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value="Identity">IDENTITY</option>
                  <option value="Residency">RESIDENCY</option>
                  <option value="Uploads">UPLOADS</option>
                  <option value="Review">REVIEW</option>
                </select>
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600 }}>Field Label *</label>
                <input type="text" required value={fieldForm.field_label} onChange={(e) => setFieldForm({ ...fieldForm, field_label: e.target.value, field_name: e.target.value.toLowerCase().replace(/[^a-z0-9]/g, '_') })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} placeholder="e.g. Purpose of Request" />
              </div>
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600 }}>Field Input Type</label>
                <select value={fieldForm.field_type} onChange={(e) => setFieldForm({ ...fieldForm, field_type: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value="text">Text Box</option>
                  <option value="textarea">Textarea (Multiline)</option>
                  <option value="select">Dropdown Menu (Select)</option>
                  <option value="date">Date Picker</option>
                  <option value="time">Time Picker</option>
                  <option value="file">File / ID Upload</option>
                  <option value="checkbox">Checkbox</option>
                  <option value="radio">Radio Buttons</option>
                </select>
              </div>
              {['select', 'radio', 'checkbox'].includes(fieldForm.field_type) && (
                <div style={{ marginBottom: '12px' }}>
                  <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600 }}>Dropdown Options (Comma separated)</label>
                  <input type="text" value={fieldForm.field_options} onChange={(e) => setFieldForm({ ...fieldForm, field_options: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }} placeholder="Employment, Scholarship, Legal, Medical" />
                </div>
              )}
              <div style={{ marginBottom: '12px' }}>
                <label style={{ display: 'block', marginBottom: '4px', fontSize: '13px', fontWeight: 600 }}>Target Visibility</label>
                <select value={fieldForm.show_for_target} onChange={(e) => setFieldForm({ ...fieldForm, show_for_target: e.target.value })} style={{ width: '100%', padding: '8px', borderRadius: '6px', border: '1px solid #cbd5e1' }}>
                  <option value="all">Show for All Requests</option>
                  <option value="myself_only">Show ONLY for "Myself"</option>
                  <option value="someone_else_only">Show ONLY for "Someone Else" (Beneficiary Details)</option>
                </select>
              </div>
              <div style={{ marginBottom: '16px', display: 'flex', alignItems: 'center', gap: '8px' }}>
                <input type="checkbox" id="is_req" checked={fieldForm.is_required == 1} onChange={(e) => setFieldForm({ ...fieldForm, is_required: e.target.checked ? 1 : 0 })} />
                <label htmlFor="is_req" style={{ fontSize: '13px' }}>Mark field as Required (*)</label>
              </div>
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
                <button type="button" onClick={() => setShowFieldModal(false)} style={{ padding: '8px 16px', borderRadius: '6px', border: '1px solid #cbd5e1', background: '#fff', cursor: 'pointer' }}>Cancel</button>
                <button type="submit" style={{ padding: '8px 16px', borderRadius: '6px', border: 'none', background: '#00a86b', color: '#fff', cursor: 'pointer' }}>Save Field</button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminServices;