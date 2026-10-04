# Demo: Acme Notes

A ~150-line Node app (no dependencies) with two transactional emails sent through the Mermail Email API (`POST /api/v1/mailboxes/{mailbox}/emails`) from its own sender mailbox:

| Flow | Route | Email | Post-condition |
| --- | --- | --- | --- |
| Signup verification | `POST /api/signup {name, email}` | "Confirm your Acme Notes account" with a `/verify?token=` button | `GET /api/users/:email` → `verified: true` after the click |
| Password reset | `POST /api/password-reset {email}` | "Your Acme Notes reset code" with a 6-digit code | `POST /api/password-reset/confirm {email, code}` → `200 {ok: true}` |

## Seeded bugs

All three are the kind that pass code review and unit tests:

1. **`emails/verify.html` greets `{{firstName}}`**, but `server.mjs` renders it with `{ name }`. Users see `Hi {{firstName}},` → `CNT-001`, `CNT-002`.
2. **The verification URL is built from `user.id`**, but `/verify` looks users up by `user.verifyToken`. The link looks perfectly valid and only fails when clicked → `LNK-006` (HTTP 400), `E2E-001` (`verified: false`).
3. **The verification email is sent twice**: `signup()` calls `sendVerificationEmail()` directly, and the `onUserCreated` hook list calls it again. Every new user gets two emails → `DLV-003`.

Bonus: the signup email has no plain-text part (the reset email does). In `inbox` capture that is a `CNT-004` warning; in `sent` capture Mermail's Sent copy keeps only the HTML body, so the check reports INFO instead of guessing.

The password-reset flow is healthy, which shows the suite does not just fail everything.

## Run it

One Mermail mailbox is enough (Free plan):

```bash
export MERMAIL_API_KEY=…                       # Settings → API Keys in console.mermail.app
cd demo/acme-app
# set "sender" in acme.config.json to your mailbox address (the app sends through it)
node --watch server.mjs
```

In another terminal in `demo/acme-app`, with the skill installed (`npx skills add Anuragt1104/mermail-email-e2e`) and Mermail MCP connected, ask your agent:

> Use $mermail-email-e2e to test this app's signup and password-reset emails end to end and fix whatever is broken.

Expected: because the app sends through the same mailbox the agent reads, the agent picks `capture: "sent"`. The first run reports the seeded failures. The agent then fixes `emails/verify.html`, the URL builder, and the duplicate hook in `server.mjs`; `--watch` reloads the server; and the re-run is green, including `DLV-004` (Mermail's provider receipt: delivered), `LNK-006` (the verify page says "verified"), and `E2E-001` (`verified: true`).

For the strongest signal (`capture: "inbox"`), give the app a sender mailbox in a second workspace (`sender` in `acme.config.json`, that workspace's key as `ACME_API_KEY`) and test with your main mailbox. Mermail files a mailbox's own sends only under Sent, so inbox capture needs two different mailboxes.

## Run the suite without an agent

```bash
MERMAIL_E2E_MAILBOX=you@mermail.app node ../../skills/mermail-email-e2e/scripts/run-email-e2e.mjs --spec .mermail/email-e2e.json
```
