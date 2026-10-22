// Language of disaster advisories (migration 032): 'en' or 'fil'.
// A signed-in resident's choice is saved on their profile (Edit Profile,
// update_notify_channel.php) and mirrored here; visitors pick it on the page.
// Only a per-device convenience, so storage failures are ignored.

const KEY = 'pb2_advisory_lang';

export const getAdvisoryLang = () => {
  try {
    return localStorage.getItem(KEY) === 'fil' ? 'fil' : 'en';
  } catch {
    return 'en';
  }
};

export const setAdvisoryLang = (lang) => {
  try {
    localStorage.setItem(KEY, lang === 'fil' ? 'fil' : 'en');
  } catch {
    // storage unavailable: the choice lasts for this page only
  }
};

/** An advisory's title and instructions in the chosen language (English when no Filipino text). */
export const advisoryText = (alert, lang) => {
  const fil = lang === 'fil' && (alert?.title_fil || '').trim() !== '';
  return {
    title: fil ? alert.title_fil : alert?.title || '',
    instructions: fil && (alert.instructions_fil || '').trim() !== '' ? alert.instructions_fil : alert?.instructions || '',
    isFilipino: fil,
    hasFilipino: (alert?.title_fil || '').trim() !== '',
  };
};
