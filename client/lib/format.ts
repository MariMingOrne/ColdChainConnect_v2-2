/** "₱1,250.50" from a decimal string or number; blank or non-numeric input shows as zero. */
export function formatPeso(value: string | number | null | undefined): string {
  const amount = Number(value);
  return `₱${(Number.isFinite(amount) ? amount : 0).toLocaleString("en-PH", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

/** The server's `{ error }` message from a failed response, or `fallback` when the body has none. */
export async function responseError(res: Response, fallback: string): Promise<string> {
  try {
    const body = await res.json();
    if (body && typeof body.error === "string" && body.error) return body.error;
  } catch {
    /* not JSON */
  }
  return fallback;
}
