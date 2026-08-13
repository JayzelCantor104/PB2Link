import { BrowserRouter as Router, Routes, Route, Navigate } from "react-router-dom";
import { useState, useEffect } from "react"; 

// --- CITIZEN IMPORTS ---
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Services from "./pages/Services";
import About from "./pages/AboutUs";
import Dashboard from "./pages/Dashboard";
import TrackRequest from "./pages/TrackRequest";
import Profile from "./pages/Edit_profile";
import BarangayClearance from "./pages/BarangayClearance";
import BarangayResidency from "./pages/BarangayResidency";
import BusinessClearance from "./pages/BusinessClearance";
import CertificateIndigency from "./pages/CertificateIndigency";
import VolunteerRegistration from "./pages/VolunteerRegistration";
import BarangayId from "./pages/BarangayID";
import IncidentReport from "./pages/IncidentReport";
import BookingPage from './pages/Booking';
import { AuthProvider, useAuth } from "./context/AuthContext";

// --- ADMIN IMPORTS ---
import AdminLayout from './Admin/AdminLayout'; 
import AdminDashboard from './Admin/Dashboard'; 
import PendingUsers from './Admin/PendingUsers';
import Profiling from './Admin/Profiling';
import Documents from './Admin/Documents';
import Incidents from './Admin/Incidents';
import AmenityDashboard from './Admin/AmenityDashboard'; 
import AmenityDetail from './Admin/AmenityDetail'; 
import AdminLogin from './Admin/AdminLogin';
import AdminForgotPassword from './Admin/AdminForgotPassword';
import AdminResetPassword from './Admin/AdminResetPassword';
import SetupPassword from "./Admin/SetupPassword"; // <-- Setup Password Import
import AdminProfileChanges from './Admin/AdminProfileApprovals';
import AdminManage from './Admin/AdminManage';
import AuditLog from './Admin/AuditLog';
import './Admin/admin_style.css';

// =========================================================
// ROUTE GUARD COMPONENT WRAPPERS
// =========================================================

// 1. CITIZEN PROTECTED: Must be logged in as citizen
function ProtectedRoute({ children }) {
  const { user } = useAuth();
  if (!user) return <Navigate to="/login" replace />;
  return children;
}

// 2. CITIZEN PUBLIC: If logged in as citizen, send to citizen dashboard
function PublicRoute({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to="/dashboard" replace />;
  return children;
}

// 3. ADMIN PROTECTED: Must be logged in as admin
function AdminProtectedRoute({ children }) {
  const { adminUser } = useAuth();
  if (!adminUser) return <Navigate to="/admin/login" replace />;
  return children;
}

// 4. ADMIN PUBLIC: Prevent logged-in admins from accessing admin login
function AdminPublicRoute({ children }) {
  const { adminUser } = useAuth();
  if (adminUser) return <Navigate to="/admin/dashboard" replace />;
  return children;
}

// 5. SUPER ADMIN PROTECTED: Strictly requires the 'Super' role
function SuperAdminProtectedRoute({ children }) {
  const { adminUser } = useAuth();
  if (!adminUser) return <Navigate to="/admin/login" replace />;
  
  // If they are an admin, but NOT a Super admin, kick them back to dashboard
  if (adminUser.role !== 'Super') return <Navigate to="/admin/dashboard" replace />;
  
  return children;
}

// =========================================================
// MAIN APPLICATION COMPONENT
// =========================================================
function App() {
  useEffect(() => {
    let tooltipBox = document.getElementById('global-custom-tooltip');
    if (!tooltipBox) {
      tooltipBox = document.createElement('div');
      tooltipBox.id = 'global-custom-tooltip';
      Object.assign(tooltipBox.style, {
        display: 'none',
        position: 'fixed',
        background: '#064e3b',
        color: 'white',
        padding: '5px 10px',
        borderRadius: '5px',
        fontSize: '0.75rem',
        zIndex: '10000',
        pointerEvents: 'none',
        whiteSpace: 'nowrap'
      });
      document.body.appendChild(tooltipBox);
    }

    let timer;

    const handleMouseOver = (e) => {
      const target = e.target.closest('[title]');
      if (!target) return;

      const originalTitle = target.getAttribute('title');
      if (originalTitle) {
        target.setAttribute('data-custom-title', originalTitle);
        target.removeAttribute('title');
      }

      const text = target.getAttribute('data-custom-title');

      timer = setTimeout(() => {
        tooltipBox.textContent = text;
        tooltipBox.style.display = 'block';
        tooltipBox.style.left = (e.clientX + 15) + 'px';
        tooltipBox.style.top = (e.clientY + 15) + 'px';
      }, 500); 
    };

    const handleMouseOut = (e) => {
      const target = e.target.closest('[data-custom-title]');
      if (!target) return;

      clearTimeout(timer);
      tooltipBox.style.display = 'none';

      const savedTitle = target.getAttribute('data-custom-title');
      if (savedTitle) {
        target.setAttribute('title', savedTitle);
      }
    };

    const handleMouseMove = (e) => {
      if (tooltipBox.style.display === 'block') {
        tooltipBox.style.left = (e.clientX + 15) + 'px';
        tooltipBox.style.top = (e.clientY + 15) + 'px';
      }
    };

    window.addEventListener('mouseover', handleMouseOver);
    window.addEventListener('mouseout', handleMouseOut);
    window.addEventListener('mousemove', handleMouseMove);

    return () => {
      window.removeEventListener('mouseover', handleMouseOver);
      window.removeEventListener('mouseout', handleMouseOut);
      window.removeEventListener('mousemove', handleMouseMove);
    };
  }, []);

  return (
    <AuthProvider>
      <Router>
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/about" element={<About />} />
          <Route path="/incident-report" element={<IncidentReport />} />
          <Route path="/incident-report-dashboard" element={
            <div style={{ padding: '100px', textAlign: 'center' }}>
              <h2>Incident Report Dashboard</h2>
              <p>This page is currently under construction by the team.</p>
              <a href="/login">Please Login to File a Report</a>
            </div>
          } />

          {/* --- PUBLIC ROUTES --- */}
          <Route path="/login" element={<PublicRoute><Login /></PublicRoute>} />
          <Route path="/register" element={<PublicRoute><Register /></PublicRoute>} />
          <Route path="/forgot-password" element={<PublicRoute><ForgotPassword /></PublicRoute>} />
          <Route path="/reset-password" element={<PublicRoute><ResetPassword /></PublicRoute>} />
          
          {/* --- ADMIN PUBLIC ROUTES --- */}
          <Route path="/admin/login" element={<AdminPublicRoute><AdminLogin /></AdminPublicRoute>} />
          
          {/* Admin Password Recovery (Must be public!) */}
          <Route path="/admin/forgot-password" element={<AdminPublicRoute><AdminForgotPassword /></AdminPublicRoute>} />
          <Route path="/admin/reset-password" element={<AdminPublicRoute><AdminResetPassword /></AdminPublicRoute>} />

          {/* MOVED SETUP-PASSWORD HERE: Root level, accessible to people not logged in */}
         <Route path="/setup-password" element={<SetupPassword />} />

          {/* --- PROTECTED CITIZEN ROUTES --- */}
          <Route path="/dashboard" element={<ProtectedRoute><TrackRequest /></ProtectedRoute>} />
          <Route path="/track-request" element={<ProtectedRoute><TrackRequest /></ProtectedRoute>} />
          <Route path="/profile" element={<ProtectedRoute><Profile /></ProtectedRoute>} />
          <Route path="/amenity-reservation" element={<ProtectedRoute><BookingPage /></ProtectedRoute>} />

          <Route path="/request/clearance" element={<ProtectedRoute><BarangayClearance /></ProtectedRoute>} />
          <Route path="/request/residency" element={<ProtectedRoute><BarangayResidency /></ProtectedRoute>} />
          <Route path="/request/id" element={<ProtectedRoute><BarangayId /></ProtectedRoute>} />
          <Route path="/request/business" element={<ProtectedRoute><BusinessClearance /></ProtectedRoute>} />
          <Route path="/request/indigency" element={<ProtectedRoute><CertificateIndigency /></ProtectedRoute>} />
          <Route path="/request/volunteer" element={<ProtectedRoute><VolunteerRegistration /></ProtectedRoute>} />

          {/* --- PROTECTED ADMIN ROUTES --- */}
          <Route path="/admin" element={
            <AdminProtectedRoute>
              <AdminLayout />
            </AdminProtectedRoute>
          }>
            {/* Admin Layout Sub-paths */}
            <Route index element={<AdminDashboard />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            <Route path="pending-users" element={<PendingUsers />} />
            <Route path="profiling" element={<Profiling />} />
            <Route path="documents" element={<Documents />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="amenities" element={<AmenityDashboard />} />
            <Route path="amenities/view/:id" element={<AmenityDetail />} /> 
            <Route path="profiles" element={<AdminProfileChanges />} />
           
            
            {/* SECURED SUPER ADMIN ROUTE */}
            <Route path="manage-admins" element={
              <SuperAdminProtectedRoute>
                <AdminManage />
              </SuperAdminProtectedRoute>
            } />
            <Route path="audit-log" element={
              <SuperAdminProtectedRoute>
                <AuditLog />
              </SuperAdminProtectedRoute>
            } />
          </Route>
        </Routes>
      </Router>
    </AuthProvider>
  );
}

export default App;