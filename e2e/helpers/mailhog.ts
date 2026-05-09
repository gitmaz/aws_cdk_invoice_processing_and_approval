/**
 * MailHog REST API — optional assertion that notify-human produced a message mentioning the invoice.
 */
export async function mailhogMessagesIncludeInvoice(params: {
  mailhogBaseUrl: string;
  invoiceId: string;
}): Promise<boolean> {
  const base = params.mailhogBaseUrl.replace(/\/$/, "");
  const res = await fetch(`${base}/api/v2/messages`);
  if (!res.ok) return false;
  const data = (await res.json()) as { items?: unknown[] };
  const hay = JSON.stringify(data.items ?? []);
  return hay.includes(params.invoiceId);
}
