// Where form drafts are kept (src/lib/useFormDraft.jsx). Separate from the hook
// so AuthContext can clear them on sign-out without a circular import.
// Residents' request forms and staff forms use different prefixes, so signing
// out of one side doesn't throw away the other side's work.
export const FORM_DRAFT_PREFIX = 'pb2_draft_';        // + <user_id>_<form>
export const ADMIN_FORM_DRAFT_PREFIX = 'pb2_draftA_'; // + <admin_id>_<form>

const clearPrefix = (prefix) => {
  try {
    Object.keys(sessionStorage).filter((k) => k.startsWith(prefix)).forEach((k) => sessionStorage.removeItem(k));
  } catch { /* storage blocked */ }
};

/** Removes every saved resident form draft (resident sign-out). */
export const clearAllFormDrafts = () => clearPrefix(FORM_DRAFT_PREFIX);

/** Removes every saved staff form draft (admin sign-out). */
export const clearAdminFormDrafts = () => clearPrefix(ADMIN_FORM_DRAFT_PREFIX);
