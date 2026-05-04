import * as fs from "fs";
import * as path from "path";

/** Resolved settings for a deployment stage (defaults + optional CDK context + optional config file). */
export interface StageConfig {
  stage: string;
  /**
   * Field confidence threshold (0–100). Below = SPA requires manual verification of OCR before approve.
   * At/above = extraction trusted for display (verification automatic); human must still approve/reject explicitly.
   */
  ocrConfidenceThreshold: number;
  /** SES From address (must be verified in SES for the account/region). */
  sesFromAddress: string;
  /** Where human-review emails are sent. */
  humanReviewNotifyEmails: string[];
  /** Extra recipients when an invoice is rejected. */
  rejectionNotifyEmails: string[];
  /** Base URL for the approval SPA (no trailing slash), used in emails. */
  spaBaseUrl: string;
  /** Prefix for SSM parameters this app may read at runtime (documented for operators). */
  ssmParameterPrefix: string;
}

export interface InvoiceContextOverrides {
  ocrConfidenceThreshold?: number;
  sesFromAddress?: string;
  humanReviewNotifyEmails?: string[];
  rejectionNotifyEmails?: string[];
  spaBaseUrl?: string;
}

function readOptionalLocalConfig(stage: string): Partial<StageConfig> {
  const candidates = [
    path.join(__dirname, "..", "config", `${stage}.json`),
    path.join(__dirname, "..", "..", "config", `${stage}.json`),
  ];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    try {
      return JSON.parse(fs.readFileSync(p, "utf8")) as Partial<StageConfig>;
    } catch {
      return {};
    }
  }
  return {};
}

/**
 * Load stage configuration using:
 * 1) Safe defaults
 * 2) CDK context `invoice.<stage>` from cdk.json / `cdk deploy -c`
 * 3) Optional local file `config/<stage>.json` (gitignored) for secrets-free local overrides
 */
export function loadStageConfig(
  stage: string,
  contextRoot?: { invoice?: Record<string, InvoiceContextOverrides> },
): StageConfig {
  const ctxInvoice = contextRoot?.invoice ?? {};
  const ctxStage = ctxInvoice[stage] ?? {};
  const local = readOptionalLocalConfig(stage);

  const ocrConfidenceThreshold =
    ctxStage.ocrConfidenceThreshold ??
    local.ocrConfidenceThreshold ??
    (stage === "prod" ? 92 : stage === "test" ? 88 : 82);

  const sesFromAddress =
    ctxStage.sesFromAddress ??
    local.sesFromAddress ??
    `invoices-no-reply-${stage}@example.invalid`;

  const humanReviewNotifyEmails =
    ctxStage.humanReviewNotifyEmails ?? local.humanReviewNotifyEmails ?? [];

  const rejectionNotifyEmails =
    ctxStage.rejectionNotifyEmails ?? local.rejectionNotifyEmails ?? humanReviewNotifyEmails;

  const spaBaseUrl =
    ctxStage.spaBaseUrl ??
    local.spaBaseUrl ??
    (stage === "dev" ? "http://localhost:5173" : `https://invoice-spa-${stage}.example.com`);

  return {
    stage,
    ocrConfidenceThreshold,
    sesFromAddress,
    humanReviewNotifyEmails,
    rejectionNotifyEmails,
    spaBaseUrl,
    ssmParameterPrefix: `/invoice-pipeline/${stage}`,
  };
}
