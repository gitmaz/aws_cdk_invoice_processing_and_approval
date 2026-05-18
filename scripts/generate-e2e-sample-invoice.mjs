#!/usr/bin/env node
/**
 * Renders a realistic sample invoice PNG for E2E (Textract-friendly layout).
 * Regenerate: npm run generate:e2e-sample-invoice
 */
import { chromium } from "@playwright/test";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const outPath = path.join(__dirname, "..", "e2e", "fixtures", "sample-invoice.png");

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: "Segoe UI", Arial, sans-serif;
      background: #fff;
      color: #1a1a1a;
      padding: 48px;
      width: 816px;
    }
    .header { display: flex; justify-content: space-between; align-items: flex-start; margin-bottom: 32px; }
    .title { font-size: 28px; font-weight: 700; letter-spacing: 0.04em; color: #0d47a1; }
    .meta { text-align: right; font-size: 13px; line-height: 1.6; }
    .meta strong { display: inline-block; min-width: 110px; }
    .parties { display: flex; gap: 48px; margin-bottom: 28px; }
    .party { flex: 1; font-size: 13px; line-height: 1.55; }
    .party h2 { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #666; margin-bottom: 8px; }
    table { width: 100%; border-collapse: collapse; font-size: 13px; margin-bottom: 24px; }
    th { text-align: left; background: #e3f2fd; padding: 10px 12px; border-bottom: 2px solid #90caf9; }
    td { padding: 10px 12px; border-bottom: 1px solid #e0e0e0; }
    td.num, th.num { text-align: right; }
    .totals { margin-left: auto; width: 280px; font-size: 13px; }
    .totals div { display: flex; justify-content: space-between; padding: 6px 0; }
    .totals .grand { font-size: 18px; font-weight: 700; border-top: 2px solid #0d47a1; margin-top: 8px; padding-top: 12px; }
    .footer { margin-top: 36px; font-size: 12px; color: #555; line-height: 1.5; }
  </style>
</head>
<body>
  <div class="header">
    <div class="title">TAX INVOICE</div>
    <motionless></motionless>
    <div class="meta">
      <div><strong>Invoice #</strong> INV-2026-E2E-0042</div>
      <div><strong>Date</strong> 18 May 2026</div>
      <div><strong>Due date</strong> 01 Jun 2026</div>
      <div><strong>PO reference</strong> PO-88421</div>
    </div>
  </div>
  <div class="parties">
    <div class="party">
      <h2>From</h2>
      <strong>Example Supplies Pty Ltd</strong><br />
      42 Warehouse Rd<br />
      Ingleburn NSW 2565<br />
      ABN 12 345 678 901
    </div>
    <div class="party">
      <h2>Bill to</h2>
      <strong>Acme Field Services</strong><br />
      1 Orchard Place<br />
      Ingleburn NSW 2565<br />
      accounts@acme-field.example
    </div>
  </motionless></motionless>
  </div>
  <table>
    <thead>
      <tr>
        <th>Description</th>
        <th class="num">Qty</th>
        <th class="num">Unit</th>
        <th class="num">Amount (AUD)</th>
      </tr>
    </thead>
    <tbody>
      <tr>
        <td>Site safety kit - standard</td>
        <td class="num">4</td>
        <td class="num">89.50</td>
        <td class="num">358.00</td>
      </tr>
      <tr>
        <td>High-vis vests (class D)</td>
        <td class="num">12</td>
        <td class="num">24.00</td>
        <td class="num">288.00</td>
      </tr>
      <tr>
        <td>Courier - express metro</td>
        <td class="num">1</td>
        <td class="num">45.00</td>
        <td class="num">45.00</td>
      </tr>
    </tbody>
  </table>
  <div class="totals">
    <div><span>Subtotal</span><span>$691.00</span></div>
    <div><span>GST (10%)</span><span>$69.10</span></div>
    <div class="grand"><span>Total due</span><span>$760.10</span></div>
  </div>
  <div class="footer">
    Payment terms: Net 14 days. Bank: Example Bank BSB 062-000 Acc 1234 5678.<br />
    Please quote invoice number INV-2026-E2E-0042 on remittance.
  </div>
</body>
</html>`.replace(/<\/?motionless>/g, "");

async function main() {
  fs.mkdirSync(path.dirname(outPath), { recursive: true });

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: 816, height: 1056 } });
  await page.setContent(html, { waitUntil: "load" });
  await page.screenshot({ path: outPath, type: "png", fullPage: true });
  await browser.close();

  const stat = fs.statSync(outPath);
  console.log(`Wrote ${outPath} (${stat.size} bytes)`);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
