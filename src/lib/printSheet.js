import html2pdf from 'html2pdf.js';
import '../styles/print-sheet.css';

/**
 * Printing and PDF for the Documents print preview (certificates and the
 * Barangay ID card).
 *
 * The preview sits inside the admin layout (sidebar margin, zoomed and scrolled
 * containers), which shifted and clipped the sheet when it was printed or
 * turned into a PDF. Both paths now use a clean copy of the sheet placed
 * directly on <body> at the top-left corner, at its real A4 size.
 */

const ROOT_ID = 'pb2-print-root';

function mountCopy(source) {
  document.getElementById(ROOT_ID)?.remove();
  const root = document.createElement('div');
  root.id = ROOT_ID;
  const copy = source.cloneNode(true);
  copy.removeAttribute('id'); // the preview keeps its own id
  root.appendChild(copy);
  document.body.appendChild(root);
  return { root, copy };
}

/** Prints the sheet with the browser's print dialog. */
export function printSheet(source) {
  if (!source) return;
  const { root } = mountCopy(source);
  const html = document.documentElement;
  html.classList.add('pb2-printing');
  let done = false;
  const cleanUp = () => {
    if (done) return;
    done = true;
    html.classList.remove('pb2-printing');
    root.remove();
    window.removeEventListener('afterprint', cleanUp);
  };
  window.addEventListener('afterprint', cleanUp);
  window.print();
  // Some browsers return from print() before 'afterprint'; give them a moment.
  setTimeout(cleanUp, 1000);
}

/** Print button of the Documents preview: the certificate sheet, or the ID card page. */
export function executePrint(printRequest) {
  if (!printRequest) return;
  const target = printRequest.type === 'Barangay ID'
    ? document.querySelector('.id-card-strict-print-page')
    : document.getElementById('pb2-printable-sheet-element');
  if (target) printSheet(target);
  else window.print();
}

/** Saves the sheet as an A4 PDF. Returns the html2pdf promise. */
export function downloadSheetPdf(source, filename) {
  if (!source) return Promise.reject(new Error('Nothing to save.'));
  const { root, copy } = mountCopy(source);
  root.classList.add('is-capturing');
  return html2pdf().set(pdfOptions(copy, filename)).from(copy).save().finally(() => root.remove());
}

/** html2pdf options that capture the copy at its own A4 size. */
export function pdfOptions(copy, filename) {
  const width = copy.offsetWidth;
  const height = copy.offsetHeight;
  return {
    margin: 0,
    filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: {
      scale: 2.5,
      useCORS: true,
      letterRendering: true,
      // Capture the copy at its own size, whatever the page's scroll or width.
      scrollX: 0,
      scrollY: 0,
      width,
      height,
      windowWidth: Math.max(width, document.documentElement.clientWidth),
    },
    jsPDF: { unit: 'mm', format: 'a4', orientation: 'portrait' },
    pagebreak: { mode: 'avoid-all' },
  };
}

/** For checks: a copy on <body> like the one Print and PDF use. */
export { mountCopy };
