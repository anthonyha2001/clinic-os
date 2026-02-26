export const VALID_INVOICE_TRANSITIONS: Record<string, string[]> = {
  draft: ["issued"],
  issued: ["partially_paid", "paid", "voided"],
  partially_paid: ["paid", "voided"],
  paid: [],
  voided: [],
};

export function isValidInvoiceTransition(from: string, to: string): boolean {
  return VALID_INVOICE_TRANSITIONS[from]?.includes(to) ?? false;
}
