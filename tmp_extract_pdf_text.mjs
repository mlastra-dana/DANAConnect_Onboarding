import fs from 'node:fs';
import { getDocument } from 'pdfjs-dist/legacy/build/pdf.mjs';

const filePath = process.argv[2];
const data = new Uint8Array(fs.readFileSync(filePath));
const doc = await getDocument({ data, useWorkerFetch: false, isEvalSupported: false }).promise;
let out = '';
for (let i = 1; i <= doc.numPages; i++) {
  const page = await doc.getPage(i);
  const content = await page.getTextContent();
  out += content.items.map((it) => ('str' in it ? it.str : '')).join(' ') + '\n';
}
console.log(out);
