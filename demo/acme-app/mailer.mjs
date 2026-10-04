// Sends through Mermail's Email API: POST /api/v1/mailboxes/{mailbox}/emails.
// The sender mailbox comes from acme.config.json (or ACME_SENDER); the API key only from the environment.
import { config } from "./config.mjs";

const API = process.env.MERMAIL_API_URL ?? "https://console.mermail.app/api/v1";

export async function sendEmail({ to, subject, html, text }) {
  const sender = config.sender;
  const key = process.env.ACME_API_KEY ?? process.env.MERMAIL_API_KEY; // the app's own Mermail workspace
  if (!sender?.includes("@") || !key) throw new Error("Set sender in acme.config.json and export MERMAIL_API_KEY to send email");

  const response = await fetch(`${API}/mailboxes/${encodeURIComponent(sender)}/emails`, {
    method: "POST",
    headers: { "content-type": "application/json", ["x-api-key"]: key },
    body: JSON.stringify({ from: { email: sender, name: "Acme Notes" }, to, subject, html, ...(text ? { text } : {}) }),
  });
  const body = await response.text();
  if (!response.ok) throw new Error(`Mermail send failed: HTTP ${response.status} ${body.slice(0, 200)}`);
  console.log(`[mail] queued "${subject}" → ${to}`);
  return JSON.parse(body);
}
