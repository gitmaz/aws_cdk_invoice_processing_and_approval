# Future improvements — invoice review UX

Suggestions for evolving the human review experience beyond the current JSON textarea in `spa/src/ReviewPage.tsx`. No implementation commitment; captures design options discussed for the invoice processing SPA.

---

## Current behavior (baseline)

- Reviewers open `?invoiceId=…&session=…` and load data via `GET /public/invoice/{invoiceId}` (`lambda/public-api/index.ts`).
- Textract output is stored as `ocrSummary` (AnalyzeExpense shape under `expenseDocuments`) in DynamoDB after `lambda/validate/index.ts`.
- UI shows **lowest field confidence**, a manual vs automatic banner, and a **single monospace textarea** (`editedJson`) — editable when `manualVerificationRequired` is true.
- On Approve, the textarea is parsed and sent as `editedFields` on `POST /public/decision`.
- The **original invoice file is not shown** on the review page; only OCR JSON metadata is returned to the SPA.

---

## 1. Labeled form fields (structured editing)

### Idea

Replace or supplement the raw JSON textarea with **labeled inputs** derived from Textract `SummaryFields` (and optionally line items in `LineItemGroups`).

Example mapping per field:

- **Label:** `Type.Text` or `LabelDetection.Text` (e.g. `VENDOR_NAME`, `INVOICE_RECEIPT_DATE`, `TOTAL`)
- **Value:** `ValueDetection.Text`
- **Optional:** show `ValueDetection.Confidence` next to each label

### Benefits

- Easier for non-technical reviewers than editing nested JSON.
- Can highlight only fields below `OCR_CONFIDENCE_THRESHOLD` as required edits.
- Same approve path: rebuild an object and send as `editedFields`.

### Considerations

- `ocrSummary` is **hierarchical**, not a flat key/value map — needs a **normalize → render → denormalize** step in the SPA.
- Decide **saved shape** on approve: full Textract JSON vs simplified `{ fields: [{ id, label, value }] }` (downstream must accept it; today `editedFields` is stored opaquely in DynamoDB via finalize Lambdas).
- Keep a collapsible **“Advanced: raw JSON”** panel for edge cases and support.
- Line items may warrant a **table** (rows/columns) rather than one input per summary field.

### Likely touchpoints

| Area | Change |
|------|--------|
| `spa/src/ReviewPage.tsx` | New field list / table components; state per field or derived model |
| `spa/src/` (new) | `ocrSummaryToFormModel.ts`, `formModelToEditedFields.ts` |
| E2E | Assert banner + sample field values when using realistic fixture |

---

## 2. Document overlay — inputs on the invoice image (advanced)

### Idea

Display the **original invoice** (PNG/PDF) with an HTML overlay: **positioned edit boxes** on top of Textract bounding boxes, prioritizing fields with **low confidence** (e.g. below `OCR_CONFIDENCE_THRESHOLD`).

```
┌─────────────────────────────┐
│  [invoice image]            │
│     ┌──────────┐            │
│     │ 760.10   │  ← input   │  only where confidence is low
│     └──────────┘            │
└─────────────────────────────┘
```

### Why it is feasible

Textract `AnalyzeExpense` can return, per field:

- `ValueDetection.Text`
- `ValueDetection.Confidence`
- `ValueDetection.Geometry.BoundingBox` — normalized `Left`, `Top`, `Width`, `Height` (typically 0–1 relative to page)

That geometry is already inside the persisted `ocrSummary` when Textract returns it on real AWS runs. Overlay math: scale boxes to displayed image size (`left = Left * displayWidth`, etc.), update on resize via `ResizeObserver`.

### Gaps in the current stack

| Need | Today | Required for overlay |
|------|--------|----------------------|
| Field text + confidence | `GET /public/invoice` → `ocrSummary` | Use as-is |
| Bounding boxes | In stored Textract JSON (real dev/prod) | Verify on one production sample; extend `mockAnalyzeExpenseOutput()` for local overlay dev |
| **Image in review SPA** | Not exposed | Session-scoped **presigned GET** (or short-lived proxy) using `bucket` + `objectKey` from DynamoDB, same auth as review session |
| PDF uploads | Supported at presign | **PDF.js** or server-side rasterize to PNG for consistent overlay coordinates |
| Multi-page invoices | Possible in Textract | Per-page coordinate space and page selector |

### UX / engineering notes

- **Which fields get overlays:** e.g. `confidence < threshold`, or all fields with weak confidence highlighted and strong fields read-only on hover.
- **Summary vs line items:** Summary fields first; line-item cells are denser and need a separate overlay strategy or table sidebar.
- **Security:** Image URL must require valid `invoiceId` + `session`, short TTL (mirror presign upload pattern).
- **Accessibility:** Overlays alone are weak for keyboard/screen-reader users — keep **sidebar or form list** as primary or parallel path.
- **Edited payload:** Patch Textract JSON in place, or maintain `{ fieldId, correctedText }[]` and merge on submit before `editedFields`.

### Likely touchpoints

| Area | Change |
|------|--------|
| `lambda/public-api/index.ts` | Optional `documentUrl` (presigned GET) on GET invoice when session valid |
| `lib/invoice-processing-stack.ts` | Grant public-api Lambda `s3:GetObject` + presigner if not already |
| `spa/src/ReviewPage.tsx` or new `DocumentReviewOverlay.tsx` | Image + absolute-positioned inputs |
| `lambda/validate/textract-helpers.ts` | Mock geometry for LocalStack E2E |
| E2E | Optional: open review URL, assert overlay or image loads |

---

## 3. Suggested implementation order

1. **Presigned document URL** on review GET (unblocks image display for any UI).
2. **Labeled form fields** from `SummaryFields` (high value, lower risk than overlay).
3. **Image overlay** for low-confidence fields (pilot on single-page PNG; then PDF/multi-page).
4. **E2E assertions** on confidence banner, field labels, and (if overlay) at least one positioned control.

---

## 4. Out of scope for these items

- Changing the rule that **human approve/reject is always required** (OCR threshold only affects editability, not auto-approval).
- Replacing Textract with another OCR engine.
- Cognito on review routes (review remains `invoiceId` + `session` bearer link).

---

## References (current code)

- Review UI: `spa/src/ReviewPage.tsx`
- Public read API: `lambda/public-api/index.ts`
- Textract + persistence: `lambda/validate/index.ts`, `lambda/validate/textract-helpers.ts`
- Threshold: `OCR_CONFIDENCE_THRESHOLD` on validate Lambda (from CDK stage config)
- Upload presign (includes `headUrl` for uploader only today): `lambda/presign-upload/index.ts`
