import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import Header from './Header';
import Footer from './Footer';
import Preloader from './Preloader';
import { BuiltinServiceContext, fetchBuiltinService } from '../lib/builtinServices';
import '../styles/service-questions.css';

/**
 * Wraps a built-in request page (App.jsx). Loads its settings from Services
 * Management; while staff have it closed, residents see a notice instead of
 * the form (the server refuses new requests too). If the settings can't be
 * loaded, the form opens as usual and the server still decides.
 */
const BuiltinServiceGate = ({ serviceKey, children }) => {
  const navigate = useNavigate();
  const [state, setState] = useState({ loading: true, data: null });

  useEffect(() => {
    let active = true;
    fetchBuiltinService(serviceKey).then((data) => { if (active) setState({ loading: false, data }); });
    return () => { active = false; };
  }, [serviceKey]);

  if (state.loading) return <Preloader />;
  const service = state.data?.service || null;

  if (service && Number(service.is_active) !== 1) {
    return (
      <>
        <Header />
        <main className="sq-closed-page">
          <div className="sq-closed-card" role="status">
            <i className="bi bi-pause-circle" aria-hidden="true"></i>
            <h2>{service.title}</h2>
            <p>This service is not accepting requests right now.</p>
            {service.closed_message && <p className="sq-closed-note">{service.closed_message}</p>}
            <button type="button" className="sq-closed-btn" onClick={() => navigate('/services')}>
              <i className="bi bi-arrow-left"></i> Back to Services
            </button>
          </div>
        </main>
        <Footer />
      </>
    );
  }

  return (
    <BuiltinServiceContext.Provider value={{ key: serviceKey, service, fields: state.data?.fields || [] }}>
      {children}
    </BuiltinServiceContext.Provider>
  );
};

export default BuiltinServiceGate;
