import fs from "node:fs";
import path from "node:path";

/** Committed example invoice PNG (see `npm run generate:e2e-sample-invoice`). */
export const SAMPLE_INVOICE_PNG_PATH = path.join(
  process.cwd(),
  "e2e",
  "fixtures",
  "sample-invoice.png",
);

export function readSampleInvoicePng(): Buffer {
  if (!fs.existsSync(SAMPLE_INVOICE_PNG_PATH)) {
    throw new Error(
      `Missing ${SAMPLE_INVOICE_PNG_PATH}. Run: npm run generate:e2e-sample-invoice`,
    );
  }
  return fs.readFileSync(SAMPLE_INVOICE_PNG_PATH);
}
