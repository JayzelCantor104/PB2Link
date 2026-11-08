// How soon residents can expect an update, by kind of request. One place for
// the wording so every form, success screen and Track Request say the same.
// Change the times here; ProcessingNote shows them.
export const OFFICE_HOURS = 'Monday to Friday, 8:00 AM to 5:00 PM';

export const PROCESSING_TIMES = {
  documents: {
    label: 'Document requests',
    time: 'within the day',
    detail: 'Staff review your request and tell you when it is ready for pick-up, or if anything is missing.',
    officeDays: true,
  },
  facilities: {
    label: 'Facility bookings',
    time: 'within the day',
    detail: 'Staff check the schedule and approve or decline your booking.',
    officeDays: true,
  },
  incident: {
    label: 'Incident reports',
    time: 'within 24 hours',
    detail: 'Barangay officials review your report and update its status. In an emergency, call 911 right away.',
  },
  profile: {
    label: 'Profile updates',
    time: 'within 24 hours',
    detail: 'Changes that need a document are checked by staff before they appear on your profile.',
  },
  issue: {
    label: 'Community issue reports',
    time: 'within 24 hours to 3 days',
    detail: 'Staff acknowledge the problem and post updates on the map until it is fixed.',
  },
};

/** "Expect an update within the day." */
export const expectUpdate = (kind) => `Expect an update ${PROCESSING_TIMES[kind]?.time || 'soon'}.`;
