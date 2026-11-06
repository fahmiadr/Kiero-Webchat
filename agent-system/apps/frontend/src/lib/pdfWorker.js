import { pdfjs } from 'react-pdf';

// Use CDN worker with exact version match to prevent mismatch errors
pdfjs.GlobalWorkerOptions.workerSrc = `https://unpkg.com/pdfjs-dist@${pdfjs.version}/build/pdf.worker.min.mjs`;
