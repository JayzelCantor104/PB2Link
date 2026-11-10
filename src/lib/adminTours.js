// Product tours and tips for the staff pages (src/components/ProductTour.jsx,
// mounted with area="admin" in src/Admin/AdminLayout.jsx). Same format as
// src/lib/tours.js: steps (spotlight + coach mark) and hotspots (tip dots).
//
// target: CSS selectors tried in order; the first one on screen is used. A
// step or tip whose part isn't on the page (a tab this admin can't open, an
// empty list) is skipped. when: 'super' shows it to Super Admins only.
// reveal: a control the tour taps first when the part is on a closed tab.
//
// Edit the wording here. Keep it short, plain and in normal case.

const HELP_STEP = {
  target: ['.pt-fab'],
  title: 'Help is always here',
  body: 'Open this button on any page to take that page\'s tour again or to turn the tip dots on or off.',
};

const SIDEBAR = ['.nav-links-container', '.admin-menu-toggle'];

export const ADMIN_TOURS = [
  // ------------------------------------------------------------------ Dashboard
  {
    key: 'admin-dashboard',
    name: 'Dashboard',
    match: (p) => p === '/admin/dashboard',
    steps: [
      {
        target: SIDEBAR,
        title: 'Your tabs',
        body: 'Every part of the system is a tab here. You only see the tabs your access allows. A number on a tab means items are waiting there.',
      },
      {
        target: ['.db-panel'],
        title: 'Waiting on you',
        body: 'Everything that needs a staff action today: registrations, documents, payments, bookings, reports and more. Click an item to go straight to it.',
      },
      {
        target: ['.db-kpis'],
        title: 'Key numbers',
        body: 'Residents, requests, community issues and disaster readiness at a glance. Click a number to open its section below.',
      },
      {
        target: ['.db-tabs'],
        title: 'Sections',
        body: 'Switch between today\'s schedule, requests, residents, community and disaster details.',
      },
      {
        target: ['.db-refresh'],
        title: 'Always up to date',
        body: 'The dashboard refreshes by itself every 2 minutes. Click here to refresh now.',
      },
      {
        target: ['.header-profile-premium'],
        title: 'Your account',
        body: 'Your name and email. If a yellow banner asks you to confirm your email or mobile number, do it so password resets and alerts can reach you.',
      },
      HELP_STEP,
    ],
    hotspots: [
      {
        id: 'adm-db-todo',
        target: ['.db-todo'],
        title: 'Start your day here',
        body: 'Work down this list. When it says "You\'re all caught up", nothing is waiting.',
      },
    ],
  },

  // ------------------------------------------------------------------ Residents
  {
    key: 'admin-residents',
    name: 'Residents',
    match: (p) => p === '/admin/profiling',
    steps: [
      {
        target: ['.pf-views'],
        title: 'Accounts by status',
        body: '"Needs review" is the registration queue, oldest first. The other views list Active, Action Required and Archived residents.',
      },
      {
        target: ['.pf-search'],
        title: 'Find a resident',
        body: 'Search by name, control number, email or mobile number.',
      },
      {
        target: ['.pf-filters', '.pf-toolbar [aria-expanded]'],
        title: 'Narrow the list',
        body: 'Open Filters to filter by subdivision, street, sector, age group or sex. "Needs attention" finds IDs, selfies or proofs that didn\'t pass the automatic checks.',
      },
      {
        target: ['.pf-review-list', '.pf-table-card'],
        title: 'Open a record',
        body: 'Click a resident to see their profile, IDs and checks, requests and history. Approve, ask for action, archive or restore from there. Proof-backed details are changed by asking the resident, not by editing.',
      },
      {
        target: ['.pf-head-actions'],
        title: 'Refresh and export',
        body: 'Reload the list, or download it as a spreadsheet (Super Admins only; every export is logged).',
      },
      HELP_STEP,
    ],
    hotspots: [
      {
        id: 'adm-res-review',
        target: ['.pf-views'],
        title: 'Why is an account waiting?',
        body: 'Each card in "Needs review" lists the reasons the system couldn\'t approve it on its own, so you know what to check.',
      },
    ],
  },

  // ------------------------------------------------------------------ Profile approvals
  {
    key: 'admin-profiles',
    name: 'Profile Approvals',
    match: (p) => p === '/admin/profiles',
    steps: [
      {
        target: ['.adm-table', '.adm-card'],
        title: 'Changes waiting for you',
        body: 'Residents who changed their name, address, ID, sectors or move-in month with a proof. Click View to compare the old and new values and see the proof.',
      },
      {
        target: ['.adm-btn-view'],
        title: 'Accept or reject',
        body: 'Accept applies the change. Rejecting needs a reason, which the resident sees and is notified of.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },

  // ------------------------------------------------------------------ Documents
  {
    key: 'admin-documents',
    name: 'Documents',
    match: (p) => p === '/admin/documents',
    steps: [
      {
        target: ['.tabs-container'],
        title: 'One tab per document',
        body: 'Clearance, Residency, ID, Business, Indigency, Volunteer and Custom Services each have a tab.',
      },
      {
        target: ['.filters-row'],
        title: 'Find a request',
        body: 'Search by name or tracking code and filter by status or date.',
      },
      {
        target: ['.doc-table-card'],
        title: 'Check and process',
        body: 'The Verification column shows whether the ID came from registration or was uploaded. Click View to see the details, payment and residency proof, change the status, and print the certificate.',
      },
      {
        target: ['.btn-export'],
        title: 'Export',
        body: 'Download the requests on screen as a spreadsheet.',
      },
      HELP_STEP,
    ],
    hotspots: [
      {
        id: 'adm-doc-release',
        target: ['.doc-table-card'],
        title: 'Why can\'t I release it?',
        body: 'Ready for Pick Up and Claimed are blocked until the payment is Paid or Waived, and until a required residency proof is verified.',
      },
    ],
  },

  // ------------------------------------------------------------------ Services
  {
    key: 'admin-services',
    name: 'Services & Form Builder',
    match: (p) => p === '/admin/services',
    steps: [
      {
        target: ['.asv-intro-actions'],
        title: 'Add a service',
        body: 'Create a new request type for residents. New services start closed, so you can build the form before opening it.',
      },
      {
        target: ['.asv-list'],
        title: 'All services',
        body: 'The 8 built-in services and your own. Use the arrows to set their order on the residents\' Services page.',
      },
      {
        target: ['.asv-head-actions'],
        reveal: ['.asv-item'],
        title: 'Edit, preview, open or close',
        body: 'Pick a service on the left (we opened the first one). Change the name, description and questions, see the form as residents will, or close a service with a message.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },

  // ------------------------------------------------------------------ Incidents
  {
    key: 'admin-incidents',
    name: 'Incident Reports',
    match: (p) => p === '/admin/incidents',
    steps: [
      {
        target: ['.table-card'],
        title: 'Reports from residents',
        body: 'Every incident report with its tracking code and status: Pending, Processing, then Resolved or Closed.',
      },
      {
        target: ['.admin-btn.view-btn'],
        title: 'Open a report',
        body: 'Click View to read the details and photos, then change the status. The resident is notified of each change.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },

  // ------------------------------------------------------------------ Amenities
  {
    key: 'admin-amenities',
    name: 'Amenities',
    match: (p) => p === '/admin/amenities',
    steps: [
      {
        target: ['.amd-tabs'],
        title: 'Bookings and Manage Amenities',
        body: 'Bookings shows every reservation on a calendar. Manage Amenities is where you add venues, vehicles and equipment, set their hours and quantities, or disable one (amenities are never deleted, so old bookings keep their record).',
      },
      {
        target: ['.amd-stats'],
        title: 'Today at a glance',
        body: 'Bookings waiting for approval, today\'s bookings and what\'s coming up.',
      },
      {
        target: ['.amd-toolbar'],
        title: 'Filter bookings',
        body: 'Show one amenity, one status or one date.',
      },
      {
        target: ['.amd-list'],
        title: 'Approve or decline',
        body: 'Open a booking to approve, decline, complete or extend it. Approving declines the Pending bookings that overlap it.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },

  // ------------------------------------------------------------------ Announcements
  {
    key: 'admin-announcements',
    name: 'Announcements',
    match: (p) => p === '/admin/announcements',
    steps: [
      {
        target: ['.ann-tabs'],
        title: 'Posts and the About page',
        body: 'Write announcements here, or switch tabs to edit the About page and the council list used on printed certificates.',
      },
      {
        target: ['.ann-btn-primary'],
        title: 'Post an announcement',
        body: 'Add a headline, text and up to 6 photos, and choose who sees it: everyone, a sector, or specific residents.',
      },
      {
        target: ['.ann-feed'],
        title: 'Your posts',
        body: 'Edit, delete, or pin a post so it stays on top for residents (up to 3 pinned).',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },

  // ------------------------------------------------------------------ Waste
  {
    key: 'admin-waste',
    name: 'Waste Management',
    match: (p) => p === '/admin/waste-management',
    steps: [
      {
        target: ['.page-header-row .btn-primary-action'],
        title: 'Add a pickup schedule',
        body: 'Set the area, collection days, time window, waste type and the truck route.',
      },
      {
        target: ['.waste-tabs-nav'],
        title: 'Schedules and segregation guide',
        body: 'Switch between the collection schedules and the segregation guide residents see.',
      },
      {
        target: ['.filter-bar'],
        title: 'Find a schedule',
        body: 'Search by area, route, waste type or truck, and filter by day or status.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },

  // ------------------------------------------------------------------ Disaster Risk
  {
    key: 'admin-disaster',
    name: 'Disaster Risk',
    match: (p) => p === '/admin/disaster-risk',
    steps: [
      {
        target: ['.page-header-row .btn-danger-action'],
        title: 'Issue an advisory',
        body: 'Post a weather or disaster advisory. The form shows who will be notified by SMS and push before you save. Use Practice to run a drill that only staff see.',
      },
      {
        target: ['.page-header-row .btn-primary-action'],
        title: 'Add an evacuation center',
        body: 'Add a center with its capacity and place it on the map, so residents can find their nearest one.',
      },
      {
        target: ['.hz-detected'],
        title: 'Detected by the live feeds',
        body: 'When PAGASA, GDACS or PHIVOLCS shows something serious, it appears here. Review & publish opens the advisory form already filled in.',
      },
      {
        target: ['.lh-wrap'],
        title: 'Live hazard readings',
        body: 'Storm signals, recent earthquakes and the rain forecast, refreshed automatically.',
      },
      {
        target: ['.drrm-tabs-nav'],
        title: 'Everything for disasters',
        body: 'The map, evacuation centers, advisories with their checklists, preparedness guides and hotlines, advisory templates, and the vulnerable residents list (if you have access).',
      },
      HELP_STEP,
    ],
    hotspots: [
      {
        id: 'adm-dr-review',
        target: ['.drrm-tabs-nav'],
        title: 'Keep advisories current',
        body: 'An active advisory not confirmed for 24 hours is flagged. Open it and click "Still accurate", edit it, or deactivate it.',
      },
    ],
  },

  // ------------------------------------------------------------------ Issue Map
  {
    key: 'admin-issue-map',
    name: 'Issue Map',
    match: (p) => p === '/admin/issue-map',
    steps: [
      {
        target: ['.aim-check-bar'],
        title: 'Posts to check',
        body: 'New reports, reports waiting to be posted (they may name a person), and comments residents reported. Click to list them.',
      },
      {
        target: ['.aim-stats'],
        title: 'Open issues',
        body: 'How many problems are open, and how many are new, acknowledged or in progress.',
      },
      {
        target: ['.aim-filters'],
        title: 'Filter and switch views',
        body: 'Filter by status and category, show the map or a list, and turn on the heatmap to see where reports gather.',
      },
      {
        target: ['.aim-main'],
        title: 'Open an issue',
        body: 'Click a flag or a row to see who reported it, update the status with a public remark, merge duplicates, and post or remove reports.',
      },
      {
        target: ['.aim-main'],
        title: 'Report abuse',
        body: 'For an offensive or false post, use Report abuse: it removes the post, emails the resident the reason, and can pause their posting for 7 days, 30 days or until lifted.',
      },
      HELP_STEP,
    ],
    hotspots: [
      {
        id: 'adm-im-badge',
        target: ['.aim-check-bar'],
        title: 'The sidebar number',
        body: 'The number on the Issue Map tab counts issues with posts to check. Opening an issue marks its reports as seen.',
      },
    ],
  },

  // ------------------------------------------------------------------ Payments
  {
    key: 'admin-payments',
    name: 'Payments',
    match: (p) => p === '/admin/payments',
    steps: [
      {
        target: ['.pm-tabs'],
        title: 'Verify, report and set fees',
        body: 'To verify: payments residents sent online. Collections: the report to match with official receipts. Fees: the amount for each document and how residents can pay.',
      },
      {
        target: ['.pm-container .pm-card:not(.pm-muted)'],
        title: 'Check before confirming',
        body: 'Match the reference number with the barangay\'s e-wallet history, then record the treasurer\'s O.R. number. Nothing is confirmed automatically.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },

  // ------------------------------------------------------------------ Manage Admins
  {
    key: 'admin-manage',
    name: 'Manage Admins',
    match: (p) => p === '/admin/manage-admins',
    steps: [
      {
        when: 'super',
        target: ['.btn-primary-elegant'],
        title: 'Invite a staff member',
        body: 'Enter their name, email and mobile number. They get an email to confirm their email and mobile and set their own password.',
      },
      {
        target: ['.am-tabs'],
        title: 'Admins, tab access and settings',
        body: 'Manage accounts, decide which tabs each position or person can open, and set system options like automatic approval and Issue Map review.',
      },
      {
        target: ['.am-list'],
        title: 'Each account',
        body: 'Edit details, set access, send a password reset link, or deactivate. You never set another admin\'s password.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },
];
