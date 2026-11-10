// Product tours and tips for the resident pages (src/components/ProductTour.jsx).
//
// Each page can have:
//   steps     a guided tour: the screen dims and one part at a time is lit up
//             (spotlight) with a coach mark explaining it;
//   hotspots  pulsing dots on single features; tapping one shows a short tip.
//
// target: CSS selectors tried in order; the first one that is on screen is used
// (so one step can point at the desktop menu or the phone menu). Steps and tips
// whose target isn't on the page are skipped.
// when: 'resident' (signed in) or 'guest' (signed out); leave out for everyone.
// reveal: a control the tour taps first when the part is on a closed tab
// (e.g. the Disaster Map tab); the coach mark should say it opens it.
//
// Edit the wording here. Keep it short, in plain words, and in normal case.

const HELP_STEP = {
  target: ['.pt-fab'],
  title: 'Help is always here',
  body: 'Tap this button any time to take this tour again or to turn the tip dots on or off.',
};

export const TOURS = [
  // ------------------------------------------------------------------ Home
  {
    key: 'home',
    name: 'Home page',
    match: (p) => p === '/',
    steps: [
      {
        target: ['.pb2-nav', '.pb2-burger'],
        title: 'Find every service here',
        body: 'The menu groups the website: Services for documents and bookings, Community for the Issue Map and garbage schedule, and Disaster & Safety for advisories and evacuation centers.',
      },
      {
        target: ['.hm-search'],
        title: 'Not sure where to go? Search',
        body: 'Type what you need, like "clearance", "garbage" or "flood", and pick from the list. You can also paste a tracking code to check a request.',
      },
      {
        target: ['.hm-chips'],
        title: 'Your barangay today',
        body: 'A quick look at any advisory, the weather, today\'s garbage pickup and open community issues. Tap one to open it.',
      },
      {
        target: ['.hm-tiles'],
        title: 'My Barangay',
        body: 'Live tiles for advisories, weather, garbage collection, community issues, quick services and hotlines. Signed-in residents also see their requests and their street\'s flood level.',
      },
      {
        target: ['#hm-customize'],
        title: 'Arrange it your way',
        body: 'Tap Customize to move, widen or hide tiles. Your layout is saved on this device.',
      },
      {
        target: ['#hm-panel'],
        title: 'Announcements',
        body: 'News from the barangay. Pinned posts stay on top, and a dot marks posts you haven\'t opened yet.',
      },
      {
        when: 'guest',
        target: ['.pb2-actions .pb2-btn-primary', '.pb2-burger'],
        title: 'Create your account',
        body: 'Register once to request documents, book facilities, report issues and follow your requests online.',
      },
      {
        when: 'resident',
        target: ['.pb2-account-btn', '.pb2-burger'],
        title: 'Your account',
        body: 'Open My Requests to follow your documents and reports, or Edit Profile to update your details.',
      },
      HELP_STEP,
    ],
    hotspots: [
      {
        id: 'home-search-code',
        target: ['.hm-search'],
        title: 'Tracking codes work here too',
        body: 'Paste the code you got after a request (like CLR-2026...) to jump straight to its status.',
      },
      {
        id: 'home-a11y',
        target: ['.a11y-fab'],
        title: 'Easier to read',
        body: 'This button makes the text bigger, raises the contrast, slows down animations and more.',
      },
    ],
  },

  // ------------------------------------------------------------------ Services
  {
    key: 'services',
    name: 'Services',
    match: (p) => p === '/services',
    steps: [
      {
        target: ['.sp-search-bar'],
        title: 'Search the services',
        body: 'Type part of a name, like "residency" or "ID", to find a service quickly.',
      },
      {
        target: ['.sp-filters'],
        title: 'Filter by kind',
        body: 'Show only documents, bookings, reports or programs.',
      },
      {
        target: ['.sp-grid'],
        title: 'Pick a service',
        body: 'Each card says what the service is for. A greyed-out card is closed for now and shows the reason.',
      },
      {
        target: ['.sp-btn-request'],
        title: 'Start a request',
        body: 'Tap Request to open the form. You will need to log in first. After you submit, you get a tracking code to follow your request.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },

  // ------------------------------------------------------------------ Request forms
  {
    key: 'request-form',
    name: 'Request form',
    match: (p) => p.startsWith('/request/'),
    steps: [
      {
        target: ['.ep-stepper'],
        title: 'A few short steps',
        body: 'The form is split into steps. What you type is kept if the page reloads, so you won\'t lose your work.',
      },
      {
        target: ['.ep-toggle-wrapper'],
        title: 'Who is this for?',
        body: 'Choose Myself to use the details in your profile, or Someone else to request for a family member. Requests for someone else need their ID and an authorization letter.',
      },
      {
        target: ['.iof-wrap'],
        title: 'Your ID is already on file',
        body: 'For your own requests, the valid ID you registered with is used. You don\'t need to upload it again.',
      },
      {
        target: ['.ep-actions'],
        title: 'Continue when ready',
        body: 'If something is missing, the form tells you which field to fix. The last step shows the fee and how to pay.',
      },
      HELP_STEP,
    ],
    hotspots: [
      {
        id: 'form-draft',
        target: ['.ep-stepper'],
        title: 'Your progress is saved',
        body: 'If you refresh or go back, the form fills itself in again for up to 12 hours. Photos and files need to be attached again.',
      },
    ],
  },

  // ------------------------------------------------------------------ Booking
  {
    key: 'booking',
    name: 'Facility booking',
    match: (p) => p === '/amenity-reservation',
    steps: [
      {
        target: ['.ep-stepper'],
        title: 'Book in three steps',
        body: 'Choose what to book, pick the date and time, then confirm your contact details.',
      },
      {
        target: ['.bk-filter'],
        title: 'Venues, vehicles and equipment',
        body: 'Filter the list by kind. The ambulance is not booked online: it shows its hotline number instead.',
      },
      {
        target: ['.bk-grid'],
        title: 'Pick one',
        body: 'Tap a card to choose it. On the next step you see times or units already taken on your date, so you can pick a free slot.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },

  // ------------------------------------------------------------------ Track Request
  {
    key: 'track',
    name: 'My Requests',
    match: (p) => p === '/track-request' || p === '/dashboard',
    steps: [
      {
        target: ['.search-container'],
        title: 'Find a request by its code',
        body: 'Type or paste the tracking code you got after submitting.',
      },
      {
        target: ['.tab-navigation'],
        title: 'Documents and reports',
        body: 'Your document requests and your incident reports are in separate tabs. The number shows how many you have.',
      },
      {
        target: ['.track-content'],
        title: 'Status and details',
        body: 'Each row shows the current status. Tap View to see the details, staff remarks, payment, and what to do next.',
      },
      {
        target: ['.info-cards'],
        title: 'When to expect an update',
        body: 'How long each kind of request usually takes, office hours, and how to reach the barangay.',
      },
      HELP_STEP,
    ],
    hotspots: [
      {
        id: 'track-tabs',
        target: ['.tab-navigation'],
        title: 'Looking for an incident report?',
        body: 'Incident reports have their own tab next to Documents.',
      },
    ],
  },

  // ------------------------------------------------------------------ Issue Map
  {
    key: 'issue-map',
    name: 'Community Issue Map',
    match: (p) => p === '/issue-map',
    steps: [
      {
        target: ['.im-map-col'],
        title: 'Problems around the barangay',
        body: 'Each flag is a problem residents reported, like a broken streetlight, flooding or illegal dumping. Tap a flag to see it.',
      },
      {
        target: ['.im-legend'],
        title: 'Flag colours',
        body: 'The colour grows stronger as more residents report the same problem: yellow, then orange, red and purple.',
      },
      {
        target: ['.im-chips'],
        title: 'Show one kind of problem',
        body: 'Tap a category to see only those flags. The number shows how many are open.',
      },
      {
        target: ['.im-toggle'],
        title: 'See what was fixed',
        body: 'Tick this to also show problems the barangay resolved or rejected in the last 7 days.',
      },
      {
        target: ['.im-toolbar-row .im-btn'],
        title: 'Report a problem',
        body: 'Tap here, then tap the exact spot on the map (or use your current location). Choose the kind of problem and describe it.',
      },
      {
        target: ['.im-panel'],
        title: 'Details and updates',
        body: 'This panel shows the problem you picked, updates from barangay staff, and comments. Seen it too? Add your report to make the flag stronger.',
      },
      {
        target: ['.im-panel'],
        title: 'Rules keep it fair',
        body: 'Describe the problem, not people: no names, insults or phone numbers. Your name is never shown to other residents. Posts that break the rules are removed.',
      },
      HELP_STEP,
    ],
    hotspots: [
      {
        id: 'im-legend',
        target: ['.im-legend'],
        title: 'More reports, stronger colour',
        body: 'When you add your report to an existing flag instead of pinning a new one, the barangay sees how many residents are affected.',
      },
      {
        id: 'im-privacy',
        target: ['.im-panel'],
        title: 'Your name stays private',
        body: 'Other residents see comments without names. Only barangay staff can see who reported.',
      },
    ],
  },

  // ------------------------------------------------------------------ Disaster Risk
  {
    key: 'disaster-risk',
    name: 'Disaster Risk & Evacuation',
    match: (p) => p === '/disaster-risk',
    steps: [
      {
        target: ['.citizen-alert-banner', '.drrm-hero-header'],
        title: 'Advisories appear here',
        body: 'When the barangay issues a weather or disaster advisory, it shows at the top of this page with what to do. Some advisories have a Filipino version.',
      },
      {
        target: ['.adv-push'],
        title: 'Get alerts on this phone',
        body: 'Turn on alerts to get a notification when an advisory is posted, even when this website is closed.',
      },
      {
        target: ['.lh-wrap'],
        title: 'Live hazard readings',
        body: 'Storm signals from PAGASA, recent earthquakes from PHIVOLCS, and the rain forecast, checked automatically.',
      },
      {
        target: ['.citizen-tabs-bar'],
        title: 'Map, centers, protocols, hotlines',
        body: 'Switch between the evacuation map, the list of evacuation centers, what to do in each disaster, and emergency numbers.',
      },
      {
        target: ['.disaster-map-layer-controls'],
        reveal: ['.citizen-tabs-bar .citizen-tab-btn:first-child'],
        title: 'Map layers',
        body: 'We opened the Disaster Map for you. Here you can show flood-prone areas (Project NOAH) or the rain radar of the last 2 hours on the map.',
      },
      {
        target: ['.dm-nearest'],
        reveal: ['.citizen-tabs-bar .citizen-tab-btn:first-child'],
        title: 'Find your nearest evacuation center',
        body: 'Uses your location (or a spot you tap) to show the closest open center, how far it is, and walking directions.',
      },
      HELP_STEP,
    ],
    hotspots: [
      {
        id: 'dr-nearest',
        target: ['.dm-nearest-btn'],
        title: 'Know where to go',
        body: 'Check your nearest evacuation center now, before you need it. Your location stays on your phone.',
      },
      {
        id: 'dr-emergency',
        target: ['.citizen-tabs-bar'],
        title: 'Works without internet',
        body: 'Open "Emergency Info" from the Disaster & Safety menu once. After that it opens even with no connection.',
      },
    ],
  },

  // ------------------------------------------------------------------ Preparedness
  {
    key: 'preparedness',
    name: 'Disaster Preparedness',
    match: (p) => p === '/preparedness',
    steps: [
      {
        target: ['.prep-lookup', '[aria-labelledby="prep-street-h"]'],
        title: 'How deep can a flood get on your street?',
        body: 'Pick your street to see its flood level from the Project NOAH flood map.',
      },
      {
        target: ['#prep-hotlines'],
        title: 'Emergency hotlines',
        body: 'Tap a number to call. Save them on your phone now, before an emergency.',
      },
      {
        target: ['[aria-labelledby="prep-guide-h"]'],
        title: 'What to do',
        body: 'Simple steps for before, during and after each kind of disaster.',
      },
      {
        target: ['section.prep-card:has(.prep-progress)'],
        title: 'Checklists',
        body: 'Tick off your go-bag and family plan. Your ticks are saved on this device.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },

  // ------------------------------------------------------------------ Waste Management
  {
    key: 'waste',
    name: 'Waste Management',
    match: (p) => p === '/waste-management',
    steps: [
      {
        target: ['.waste-highlights-grid'],
        title: 'The basics',
        body: 'Quick reminders on segregation and collection in Pasong Buaya II.',
      },
      {
        target: ['.citizen-tabs-bar'],
        title: 'Schedules, segregation and facilities',
        body: 'See when the truck comes, how to sort your waste, and where to bring recyclables.',
      },
      {
        target: ['.citizen-search-panel'],
        title: 'Find your area',
        body: 'Search for your street or zone, or filter by day, to see your collection schedule.',
      },
      {
        target: ['.citizen-route-section'],
        title: 'Truck route',
        body: 'The route the garbage truck takes on the chosen day, also written out stop by stop.',
      },
      HELP_STEP,
    ],
    hotspots: [],
  },
];

export const tourForPath = (path, list = TOURS) => list.find((t) => t.match(path)) || null;

// ---- What this device has seen (per browser, like the other display choices)
const KEY = 'pb2_tours';
const EMPTY = { done: {}, dismissed: {}, tipsSeen: {}, tipsOff: false };

export const readTourState = (key = KEY) => {
  try {
    const saved = JSON.parse(localStorage.getItem(key) || '{}');
    return { ...EMPTY, ...saved, done: { ...saved.done }, dismissed: { ...saved.dismissed }, tipsSeen: { ...saved.tipsSeen } };
  } catch {
    return { ...EMPTY, done: {}, dismissed: {}, tipsSeen: {} };
  }
};

export const writeTourState = (state, key = KEY) => {
  try { localStorage.setItem(key, JSON.stringify(state)); } catch { /* private mode: tours still work, just not remembered */ }
};
