# Recording-only shell setup for the VHS tapes (not needed to use the skill).
# The demo workspace is a fresh copy of demo/acme-app with "sender" set in acme.config.json.
cd "${ACME_DIR:-$HOME/Desktop/acme-notes}"
source ~/.mermail.env                         # exports MERMAIL_API_KEY (never committed)
export MERMAIL_E2E_MAILBOX="${MERMAIL_E2E_MAILBOX:?set to your test mailbox address}"
# Load only this project's MCP config (.mcp.json → Mermail), not the user's other connectors.
claude() { command claude --strict-mcp-config --mcp-config .mcp.json "$@"; }
PROMPT='%F{cyan}acme-notes%f %F{8}$%f '
