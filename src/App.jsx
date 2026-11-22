import { BrowserRouter as Router, Routes, Route, Navigate, useLocation } from "react-router-dom";
import { useState, useEffect } from "react"; 

// --- CITIZEN IMPORTS ---
import Home from "./pages/Home";
import Login from "./pages/Login";
import Register from "./pages/Register";
import ForgotPassword from "./pages/ForgotPassword";
import ResetPassword from "./pages/ResetPassword";
import Services from "./pages/Services";
import About from "./pages/AboutUs";
import TrackRequest from "./pages/TrackRequest";
import Profile from "./pages/Edit_profile";
import BarangayClearance from "./pages/BarangayClearance";
import BarangayResidency from "./pages/BarangayResidency";
import BusinessClearance from "./pages/BusinessClearance";
import CertificateIndigency from "./pages/CertificateIndigency";
import VolunteerRegistration from "./pages/VolunteerRegistration";
import BarangayId from "./pages/BarangayID";
import DynamicRequestForm from './pages/DynamicRequestForm';
import IncidentReport from "./pages/IncidentReport";
import BookingPage from './pages/Booking';
import BuiltinServiceGate from './components/BuiltinServiceGate';
import PastAnnouncements from './pages/PastAnnouncements';
import WasteManagementUser from './pages/WasteManagement';
import DisasterRiskUser from './pages/DisasterRisk';
import Preparedness from './pages/Preparedness';
import OfflineBanner from './components/OfflineBanner';
import A11yRoute from './components/A11yRoute';
import A11yMenu from './components/A11yMenu';
import ProductTour from './components/ProductTour';
import Accessibility from './pages/Accessibility';
import Terms from './pages/Terms';
import Privacy from './pages/Privacy';

// /emergency is the light static page (public/emergency.html). The service
// worker answers it directly once installed; before that, this hands over.
const EmergencyRedirect = () => {
  useEffect(() => { window.location.replace('/emergency.html'); }, []);
  return null;
};
import IssueMapPage from './pages/IssueMap';
import AdminIssueMap from './Admin/IssueMap';
import AdminPayments from './Admin/Payments';
import { AuthProvider, useAuth } from "./context/AuthContext";

// --- ADMIN IMPORTS ---
import AdminLayout from './Admin/AdminLayout'; 
import AdminDashboard from './Admin/Dashboard'; 
import Profiling from './Admin/Profiling';
import AddressList from './Admin/AddressList';
import HallRegistration from './Admin/HallRegistration';
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
import Announcements from './Admin/Announcements';
import WasteManagement from './Admin/WasteManagement';
import DisasterRisk from './Admin/DisasterRisk';
import './Admin/admin_style.css';
import AdminServices from './Admin/AdminServices'; // <-- IMPORT SERVICES MANAGEMENT PAGE

// =========================================================
// ROUTE GUARD COMPONENT WRAPPERS
// =========================================================

// 1. CITIZEN PROTECTED: Must be logged in as citizen
function ProtectedRoute({ children }) {
  const { user } = useAuth();
  const location = useLocation();
  if (!user) return <Navigate to="/login" replace />;
  // Fixing a registration (restricted mode, migration 027): only Edit Profile
  // opens until staff approve. The server enforces this too.
  if (user.restricted && location.pathname !== '/profile') return <Navigate to="/profile" replace />;
  return children;
}

// Re-reads the resident's session from the server on every page change, so
// an account approved, sent back or archived by staff shows right away (the
// guards above and the request pages then follow the fresh status).
function SessionSync() {
  const { user, refreshSession } = useAuth();
  const { pathname } = useLocation();
  const signedIn = !!user;
  useEffect(() => {
    if (signedIn && !pathname.startsWith('/admin')) refreshSession();
  }, [pathname, signedIn, refreshSession]);
  return null;
}

// 2. CITIZEN PUBLIC: If logged in as citizen, send to citizen dashboard
function PublicRoute({ children }) {
  const { user } = useAuth();
  if (user) return <Navigate to={user.restricted ? '/profile' : '/dashboard'} replace />;
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
  // Hover text uses the browser's own tooltip (title). A site-wide replacement
  // that followed the cursor used to live here; it could stay on screen after
  // the mouse left, so it was removed.

  return (
    <AuthProvider>
      <Router>
        {/* Skip link, page titles, main region (WCAG 2.4.1, 2.4.2, 1.3.1) */}
        <A11yRoute />
        <SessionSync />
        <OfflineBanner />
        {/* Text size, contrast, motion, spacing, links (resident pages) */}
        <A11yMenu />
        <ProductTour />
        <Routes>
          <Route path="/" element={<Home />} />
          <Route path="/services" element={<Services />} />
          <Route path="/announcements" element={<PastAnnouncements />} />
          <Route path="/about" element={<About />} />
          <Route path="/incident-report" element={<BuiltinServiceGate serviceKey="incident"><IncidentReport /></BuiltinServiceGate>} />
          <Route path="/waste-management" element={<WasteManagementUser />} />
          <Route path="/disaster-risk" element={<DisasterRiskUser />} />
          <Route path="/preparedness" element={<Preparedness />} />
          <Route path="/accessibility" element={<Accessibility />} />
          <Route path="/terms" element={<Terms />} />
          <Route path="/privacy" element={<Privacy />} />
          <Route path="/emergency" element={<EmergencyRedirect />} />
          <Route path="/issue-map" element={<IssueMapPage />} />
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
          <Route path="/amenity-reservation" element={<ProtectedRoute><BuiltinServiceGate serviceKey="amenity"><BookingPage /></BuiltinServiceGate></ProtectedRoute>} />

          <Route path="/request/clearance" element={<ProtectedRoute><BuiltinServiceGate serviceKey="clearance"><BarangayClearance /></BuiltinServiceGate></ProtectedRoute>} />
          <Route path="/request/residency" element={<ProtectedRoute><BuiltinServiceGate serviceKey="residency"><BarangayResidency /></BuiltinServiceGate></ProtectedRoute>} />
          <Route path="/request/id" element={<ProtectedRoute><BuiltinServiceGate serviceKey="barangay_id"><BarangayId /></BuiltinServiceGate></ProtectedRoute>} />
          <Route path="/request/business" element={<ProtectedRoute><BuiltinServiceGate serviceKey="business"><BusinessClearance /></BuiltinServiceGate></ProtectedRoute>} />
          <Route path="/request/indigency" element={<ProtectedRoute><BuiltinServiceGate serviceKey="indigency"><CertificateIndigency /></BuiltinServiceGate></ProtectedRoute>} />
          <Route path="/request/volunteer" element={<ProtectedRoute><BuiltinServiceGate serviceKey="volunteer"><VolunteerRegistration /></BuiltinServiceGate></ProtectedRoute>} />
          <Route path="/request/:serviceId" element={<ProtectedRoute><DynamicRequestForm /></ProtectedRoute>} />

          {/* --- PROTECTED ADMIN ROUTES --- */}
          <Route path="/admin" element={
            <AdminProtectedRoute>
              <AdminLayout />
            </AdminProtectedRoute>
          }>
            {/* Admin Layout Sub-paths */}
            <Route index element={<AdminDashboard />} />
            <Route path="dashboard" element={<AdminDashboard />} />
            {/* Pending Users is now the "Needs review" view of Residents. */}
            <Route path="pending-users" element={<Navigate to="/admin/profiling?view=Pending" replace />} />
            <Route path="profiling" element={<Profiling />} />
            <Route path="address-list" element={<AddressList />} />
            <Route path="register-resident" element={<HallRegistration />} />
            <Route path="documents" element={<Documents />} />
            <Route path="incidents" element={<Incidents />} />
            <Route path="amenities" element={<AmenityDashboard />} />
            <Route path="amenities/view/:id" element={<AmenityDetail />} /> 
            <Route path="profiles" element={<AdminProfileChanges />} />
            <Route path="announcements" element={<Announcements />} />
            <Route path="waste-management" element={<WasteManagement />} />
            <Route path="disaster-risk" element={<DisasterRisk />} />
            <Route path="issue-map" element={<AdminIssueMap />} />
            <Route path="payments" element={<AdminPayments />} />

            {/* NEW SERVICES ROUTE */}
            <Route path="services" element={<AdminServices />} /> 
            
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