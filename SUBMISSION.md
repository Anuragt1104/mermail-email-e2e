# Superteam Earn submission: Build and Demo a Mermail Agent Skill

| Field | Value |
| --- | --- |
| Skill | `mermail-email-e2e` |
| Pull request (Mermail Skills repo) | _filled after the PR is opened_ |
| Demo video (X) | _filled after posting_ |
| Demo video (file) | [video/mermail-email-e2e-demo.mp4](video/mermail-email-e2e-demo.mp4) |
| Source repo | https://github.com/Anuragt1104/mermail-email-e2e |
| AI client | Claude Code (CLI) with the hosted Mermail MCP server (`https://console.mermail.app/mcp`) |

## Short description

**mermail-email-e2e gives a coding agent a real Mermail inbox for end-to-end testing of the transactional emails its own app sends, and for fixing them.** The agent reads the repo and writes a test spec. It triggers signup, magic-link, OTP or password-reset flows, catches the real email through Mermail MCP, and runs about 20 deterministic checks: delivery and duplicates, scan status, unrendered `{{tokens}}`, link hosts and HTTPS, `token=undefined`, missing text part, OTP consistency. It then clicks the call-to-action on allowlisted hosts to prove the flow completes (`verified: true`). Each failure maps to a file and line, gets patched, and is re-run to green. A zero-dependency runner turns the same spec into a CI gate with JUnit output. The skill is read-only toward Mermail: it never sends, forwards or deletes mail, follows links only from a user-authored allowlist, redacts OTPs and tokens, and respects Free-plan limits.

## Why it matters

Every app that sends email needs a test inbox, and every coding agent now needs one too. Unit tests mock the provider; this skill tests the real email in a real inbox, then closes the loop by fixing the code. It's Mailosaur/Mailtrap-style QA, done by your agent, on Mermail.
