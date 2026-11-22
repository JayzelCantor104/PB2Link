// What counts as a valid email address. Mirrors pb2_email_problem() in
// backend/api/email_rules.php, which the server enforces; this only lets the
// forms say what is wrong before sending.
//
//   local-part@domain
//   - No spaces, plain letters only (ASCII), exactly one @, at most 320 characters.
//   - Local part (before @): 1-64 characters; letters, numbers and . _ - +;
//     no period at the start or end; two of . _ - + never side by side.
//   - Domain (after @): labels separated by periods, each 1-63 characters of
//     letters, numbers and hyphens, not starting or ending with a hyphen; it
//     ends in a top-level domain of 2-63 letters (.com, .ph); not all numbers.

export const EMAIL_MAX = 320;
const LOCAL_MAX = 64;
const LABEL_MAX = 63;

/** Why this email address isn't valid, in plain words, or null when it is. */
export const emailProblem = (value) => {
  const email = String(value ?? '').trim();
  if (email === '') return 'Enter your email address.';
  if (/\s/.test(email)) return 'An email address can\'t have spaces.';
  if (/[^\x21-\x7E]/.test(email)) return 'Use only plain letters, numbers and . _ - + in the email address.';
  if (email.length > EMAIL_MAX) return `An email address can be at most ${EMAIL_MAX} characters.`;

  const at = email.split('@');
  if (at.length === 1) return 'The email address is missing the @ sign (for example name@gmail.com).';
  if (at.length > 2) return 'An email address has only one @ sign.';
  const [local, domain] = at;

  if (local === '') return 'Add your name part before the @ (for example juan.delacruz@gmail.com).';
  if (local.length > LOCAL_MAX) return `The part before the @ can be at most ${LOCAL_MAX} characters.`;
  if (/[^A-Za-z0-9._+-]/.test(local)) return 'Before the @, use only letters, numbers and . _ - +';
  if (local.startsWith('.') || local.endsWith('.')) return 'The part before the @ can\'t start or end with a period.';
  if (/[._+-]{2}/.test(local)) return 'Two of . _ - + can\'t be side by side (for example "juan..cruz").';

  if (domain === '') return 'Add the domain after the @ (for example gmail.com).';
  const labels = domain.split('.');
  if (labels.length < 2) return 'The domain needs an ending such as .com or .ph (for example gmail.com).';
  if (labels.some((l) => l === '')) return 'The domain can\'t have a period at the start or end, or two periods together.';
  if (labels.some((l) => l.length > LABEL_MAX)) return `Each part of the domain can be at most ${LABEL_MAX} characters.`;
  if (labels.some((l) => /[^A-Za-z0-9-]/.test(l))) return 'After the @, use only letters, numbers, hyphens and periods.';
  if (labels.some((l) => l.startsWith('-') || l.endsWith('-'))) return 'A part of the domain can\'t start or end with a hyphen.';
  const tld = labels[labels.length - 1];
  if (!/^[A-Za-z]{2,63}$/.test(tld)) return 'The domain must end in letters, such as .com or .ph.';
  if (/^[0-9.]+$/.test(domain.replace(/\.[A-Za-z]+$/, ''))) return 'The domain can\'t be only numbers.';
  return null;
};

export const isValidEmail = (value) => emailProblem(value) === null;
