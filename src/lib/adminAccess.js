import { createContext, useContext } from 'react';

// Admin tab access (backend/api/admin_permissions.php). The server is the
// judge: every admin endpoint checks again. This only decides what the admin
// screens show, so a hidden tab is a convenience, never the protection.

export const PERMISSIONS = [
  { key: 'module.residents', short: 'Residents', label: 'Residents and profile approvals', group: 'Tabs', icon: 'bi-people-fill' },
  { key: 'module.address', short: 'Address list', label: 'Address list', group: 'Tabs', icon: 'bi-signpost-split' },
  { key: 'module.documents', short: 'Documents', label: 'Document requests', group: 'Tabs', icon: 'bi-file-earmark-text' },
  { key: 'module.services', short: 'Services', label: 'Services and form builder', group: 'Tabs', icon: 'bi-gear-fill' },
  { key: 'module.incidents', short: 'Incidents', label: 'Incident reports', group: 'Tabs', icon: 'bi-exclamation-triangle-fill' },
  { key: 'module.amenities', short: 'Amenities', label: 'Amenities and bookings', group: 'Tabs', icon: 'bi-building' },
  { key: 'module.announcements', short: 'Announcements', label: 'Announcements and About page', group: 'Tabs', icon: 'bi-megaphone-fill' },
  { key: 'module.waste', short: 'Waste', label: 'Waste management', group: 'Tabs', icon: 'bi-recycle' },
  { key: 'module.disaster', short: 'Disaster risk', label: 'Disaster risk', group: 'Tabs', icon: 'bi-shield-shaded' },
  { key: 'disaster.sms', short: 'SMS broadcast', label: 'Send SMS broadcasts to residents', group: 'Tabs', icon: 'bi-broadcast', note: 'Costs money per text; needs Disaster risk to be useful.' },
  { key: 'disaster.vulnerable', short: 'Vulnerable list', label: 'See the vulnerable residents list (seniors and persons with disability)', group: 'Tabs', icon: 'bi-heart-pulse', note: 'Names, ages, addresses and numbers of seniors and PWDs. Give only to the people who run evacuations; every view and print is logged.' },
  { key: 'module.issues', short: 'Issue map', label: 'Community issue map', group: 'Tabs', icon: 'bi-flag-fill' },
  { key: 'payments.settings', short: 'Fees & QR', label: 'Manage fees and the payment QR / account', group: 'Payments', icon: 'bi-qr-code' },
  { key: 'payments.verify', short: 'Verify payments', label: 'Verify payments and record O.R. numbers', group: 'Payments', icon: 'bi-wallet2' },
];

export const PERMISSION_LOOKUP = Object.fromEntries(PERMISSIONS.map((p) => [p.key, p]));

/** Short name of a permission, for chips. */
export const shortPermission = (perm) => PERMISSION_LOOKUP[perm]?.short || perm;

/** Admin pages and the permissions that open them (any one is enough). */
export const ROUTE_PERMISSIONS = [
  { path: '/admin/profiling', any: ['module.residents'] },
  { path: '/admin/profiles', any: ['module.residents'] },
  { path: '/admin/address-list', any: ['module.address'] },
  { path: '/admin/documents', any: ['module.documents'] },
  { path: '/admin/services', any: ['module.services'] },
  { path: '/admin/incidents', any: ['module.incidents'] },
  { path: '/admin/amenities', any: ['module.amenities'] },
  { path: '/admin/announcements', any: ['module.announcements'] },
  { path: '/admin/waste-management', any: ['module.waste'] },
  { path: '/admin/disaster-risk', any: ['module.disaster'] },
  { path: '/admin/issue-map', any: ['module.issues'] },
  { path: '/admin/payments', any: ['payments.verify', 'payments.settings'] },
];

/** The permissions a page needs, or null when any admin may open it. */
export const permissionsForPath = (pathname) => {
  const hit = ROUTE_PERMISSIONS.find((r) => pathname === r.path || pathname.startsWith(`${r.path}/`));
  return hit ? hit.any : null;
};

export const AdminAccessContext = createContext({ loaded: false, role: null, permissions: [] });

/** { loaded, isSuper, permissions, can(perm), canAny([perms]) } for the signed-in admin. */
export const useAdminAccess = () => {
  const ctx = useContext(AdminAccessContext);
  const isSuper = ctx.role === 'Super';
  const can = (perm) => isSuper || ctx.permissions.includes(perm);
  return { ...ctx, isSuper, can, canAny: (list) => list.some(can) };
};
