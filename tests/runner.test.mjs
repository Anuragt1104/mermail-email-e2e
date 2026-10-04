// Offline end-to-end test of the runner: a fake Mermail MCP server plus a fake app that "delivers"
// mail into it. Exercises baseline, polling, Sent-copy filtering, duplicate detection, link following,
// OTP extraction, post-conditions, exit codes, and report files without any network or credentials.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, writeFile } from "node:fs/promises";
import { createServer } from "node:http";
import { tmpdir } from "node:os";
import path from "node:path";
import { after, before, test } from "node:test";

const runner = path.resolve(import.meta.dirname, "../skills/mermail-email-e2e/scripts/run-email-e2e.mjs");
const MAILBOX = { public_id: "mbx_test", email: "acme@mermail.app", can_receive: true, receiving_status: "ready" };
const fakeKey = [["sk", "proj"].join("-"), "offline", "test", "0000000000"].join("-");

let mcp, app, mcpUrl, appUrl;
let store = []; // emails in the fake mailbox
let bugs = { firstName: true, wrongToken: true, htmlOnly: true, doubleSend: false };
const users = new Map();
let seq = 0;

function deliver({ to, subject, html, text }) {
  // Shaped like a real Mermail get_email record: one HTML body plus JSON-encoded raw headers.
  const contentType = text ? "multipart/alternative; boundary=b1" : "text/html; charset=UTF-8";
  const raw_headers = JSON.stringify([{ key: "from", value: `Acme Notes <${MAILBOX.email}>` }, { key: "content-type", value: contentType }]);
  const base = { subject, sender: MAILBOX.email, recipient: to, date: new Date().toISOString(), scan_status: "clean", sender_authentication: { status: "unknown" }, body: html, body_format: "html", raw_headers };
  // Sent copy (sender-side capture) starts queued and gets a provider receipt later; Inbox copy is the delivered message.
  store.push({ ...base, id: `msg_${++seq}`, folder_id: "sent", delivery_status: "queued", provider_metadata: null, scan_status: null });
  store.push({ ...base, id: `msg_${++seq}`, folder_id: "inbox" });
}

before(async () => {
  store.push({ id: "msg_old", subject: "Confirm your Acme Notes account", sender: MAILBOX.email, recipient: MAILBOX.email, date: new Date(Date.now() - 30_000).toISOString(), folder_id: "inbox", scan_status: "clean", body: "<p>old</p>" });

  mcp = createServer(async (req, res) => {
    const body = JSON.parse(await read(req));
    assert.equal(req.headers["x-api-key"], fakeKey);
    const reply = (result) => res.end(JSON.stringify({ jsonrpc: "2.0", id: body.id, result }));
    if (body.method === "initialize") return reply({ serverInfo: { name: "fake-mermail" } });
    const { name, arguments: a } = body.params;
    assert.equal(typeof a.query === "string", false, "query must be a native object");
    const q = a.query ?? {};
    const ok = (structuredContent) => reply({ content: [{ type: "text", text: JSON.stringify(structuredContent) }], structuredContent });
    if (name === "list_mailboxes") return ok({ items: [MAILBOX] });
    if (name === "list_emails") return ok({ items: store.filter((e) => e.folder_id === (q.folder ?? "inbox")).map(meta) });
    if (name === "search_emails") {
      const hits = store.filter((e) => (!q.folder || e.folder_id === q.folder) && (!q.to || e.recipient.includes(q.to)) && (!q.subject || e.subject.includes(q.subject)) && (!q.date_start || e.date >= q.date_start));
      const response = ok({ emails: hits.map(meta), totalCount: hits.length });
      for (const e of hits) if (e.folder_id === "sent") deliverReceipt(e); // the receipt shows up on a later look
      return response;
    }
    if (name === "get_email") {
      const email = store.find((e) => e.id === a.emailId);
      if (q.require_scan_status && email.scan_status !== q.require_scan_status) return ok({ ...meta(email), content_omitted: true });
      return ok(q.metadata_only ? meta(email) : email);
    }
    reply({ isError: true, content: [{ type: "text", text: `unknown tool ${name}` }] });
  });

  app = createServer(async (req, res) => {
    const url = new URL(req.url, "http://x");
    const json = (status, obj) => (res.writeHead(status, { "content-type": "application/json" }), res.end(JSON.stringify(obj)));
    if (req.method === "POST" && url.pathname === "/api/signup") {
      const { name, email } = JSON.parse(await read(req));
      const user = { id: `u${seq}`, token: `tok${Date.now()}`, name, email, verified: false };
      users.set(email, user);
      const greeting = bugs.firstName ? "{{firstName}}" : name;
      const link = `${appUrl}/verify?token=${bugs.wrongToken ? user.id : user.token}`;
      const message = { to: email, subject: "Confirm your Acme Notes account", html: `<p>Hi ${greeting},</p><a href="${link}">Confirm email</a>`, text: bugs.htmlOnly ? undefined : `Hi ${name}, ${link}` };
      deliver(message);
      if (bugs.doubleSend) deliver(message);
      return json(201, { ok: true });
    }
    if (req.method === "GET" && url.pathname === "/verify") {
      const user = [...users.values()].find((u) => u.token === url.searchParams.get("token"));
      if (!user) return (res.writeHead(400), res.end("<p>This verification link is invalid or has expired.</p>"));
      user.verified = true;
      return (res.writeHead(200), res.end("<p>Your account is verified.</p>"));
    }
    if (req.method === "POST" && url.pathname === "/api/password-reset") {
      const { email } = JSON.parse(await read(req));
      const user = users.get(email);
      user.code = "482913";
      deliver({ to: email, subject: "Your Acme Notes reset code", html: `<p>Hi ${user.name}, your code is <b>482913</b></p>`, text: `Hi ${user.name}, your code is 482913` });
      return json(202, { ok: true });
    }
    if (req.method === "POST" && url.pathname === "/api/password-reset/confirm") {
      const { email, code } = JSON.parse(await read(req));
      return users.get(email)?.code === code ? json(200, { ok: true }) : json(400, { error: "bad code" });
    }
    if (req.method === "GET" && url.pathname.startsWith("/api/users/")) {
      const user = users.get(decodeURIComponent(url.pathname.slice(11)));
      return user ? json(200, { verified: user.verified }) : json(404, {});
    }
    json(404, {});
  });

  await Promise.all([listen(mcp), listen(app)]);
  mcpUrl = `http://127.0.0.1:${mcp.address().port}/mcp`;
  appUrl = `http://127.0.0.1:${app.address().port}`;
});

after(() => {
  mcp.close();
  app.close();
});

// Mermail's undo window: a Sent copy reads "queued" first and gets its provider receipt afterwards.
function deliverReceipt(email) {
  email.delivery_status = "delivered";
  email.provider_metadata = { delivery: { status: "delivered", provider: "cloudflare", deliveryTimeMs: 412 }, terminal: true };
}

function meta(e) {
  const { body, text, ...rest } = e;
  return rest;
}

async function runSuite({ capture = "inbox" } = {}) {
  const dir = await mkdtemp(path.join(tmpdir(), "email-e2e-"));
  const spec = {
    mailbox: MAILBOX.email,
    capture,
    appBaseUrl: appUrl,
    linkHosts: [new URL(appUrl).host],
    defaults: { timeoutSec: 10, pollSec: 0.2, maxLatencySec: 30 },
    flows: [
      {
        id: "signup-verification",
        trigger: { http: { method: "POST", url: "{appBaseUrl}/api/signup", json: { name: "Ada", email: "{address}" } } },
        expect: { subject: "Confirm your Acme Notes account", contains: ["Ada"], link: { pattern: "/verify?token=", follow: true, expectStatus: 200, expectBodyContains: "verified" } },
        then: [{ http: { method: "GET", url: "{appBaseUrl}/api/users/{address|url}" }, expectStatus: 200, expectJson: { verified: true } }],
      },
      {
        id: "password-reset",
        trigger: { http: { method: "POST", url: "{appBaseUrl}/api/password-reset", json: { email: "{address}" } } },
        expect: { subject: "Your Acme Notes reset code", otp: { pattern: "/\\b\\d{6}\\b/" } },
        then: [{ http: { method: "POST", url: "{appBaseUrl}/api/password-reset/confirm", json: { email: "{address}", code: "{otp}" } }, expectStatus: 200, expectJson: { ok: true } }],
      },
    ],
  };
  await writeFile(path.join(dir, "spec.json"), JSON.stringify(spec));
  const child = spawn(process.execPath, [runner, "--spec", "spec.json", "--rpm", "1000"], {
    cwd: dir,
    env: { ...process.env, MERMAIL_API_KEY: fakeKey, MERMAIL_MCP_URL: mcpUrl, MERMAIL_E2E_MIN_POLL_SEC: "0.1", NO_COLOR: "1" },
  });
  let out = "";
  child.stdout.on("data", (d) => (out += d));
  child.stderr.on("data", (d) => (out += d));
  const code = await new Promise((resolve) => child.on("close", resolve));
  const report = JSON.parse(await readFile(path.join(dir, "email-e2e-report", "report.json"), "utf8"));
  const junit = await readFile(path.join(dir, "email-e2e-report", "junit.xml"), "utf8");
  const markdown = await readFile(path.join(dir, "email-e2e-report", "report.md"), "utf8");
  return { code, out, report, junit, markdown };
}

const status = (report, flow, id) => report.flows.find((f) => f.flow === flow).checks.find((c) => c.id === id)?.status;

test("buggy app: runner reports the seeded bugs and exits 1", async () => {
  bugs = { firstName: true, wrongToken: true, htmlOnly: true, doubleSend: false };
  const { code, report, junit, markdown, out } = await runSuite();
  assert.equal(code, 1, out);
  assert.equal(status(report, "signup-verification", "DLV-001"), "pass");
  assert.equal(status(report, "signup-verification", "DLV-003"), "pass", "Sent copy and old mail must not count");
  assert.equal(status(report, "signup-verification", "CNT-001"), "fail");
  assert.equal(status(report, "signup-verification", "CNT-004"), "warn");
  assert.equal(status(report, "signup-verification", "LNK-006"), "fail");
  assert.equal(status(report, "signup-verification", "E2E-001"), "fail");
  assert.equal(status(report, "password-reset", "OTP-001"), "pass");
  assert.equal(status(report, "password-reset", "E2E-001"), "pass");
  assert.match(junit, /<failure message=/);
  assert.doesNotMatch(markdown + JSON.stringify(report), /482913/, "OTP must be redacted in reports");
});

test("fixed app: every flow passes and exits 0", async () => {
  bugs = { firstName: false, wrongToken: false, htmlOnly: false, doubleSend: false };
  const { code, report, out } = await runSuite();
  assert.equal(code, 0, out);
  assert.equal(report.summary.fail, 0);
  assert.equal(status(report, "signup-verification", "LNK-006"), "pass");
  assert.equal(status(report, "signup-verification", "E2E-001"), "pass");
});

test("double send is caught as DLV-003", async () => {
  bugs = { firstName: false, wrongToken: false, htmlOnly: false, doubleSend: true };
  const { code, report } = await runSuite();
  assert.equal(code, 1);
  assert.equal(status(report, "signup-verification", "DLV-003"), "fail");
});

function listen(server) {
  return new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
}

async function read(req) {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  return Buffer.concat(chunks).toString("utf8");
}

test("sender-side capture reads the Sent copy and waits for the provider receipt", async () => {
  bugs = { firstName: true, wrongToken: false, htmlOnly: false, doubleSend: false };
  const { code, report, out } = await runSuite({ capture: "sent" });
  assert.equal(code, 1, out);
  assert.equal(status(report, "signup-verification", "DLV-001"), "pass");
  assert.equal(status(report, "signup-verification", "DLV-004"), "pass", "queued → delivered receipt");
  assert.equal(status(report, "signup-verification", "SEC-001"), "info", "outbound copies are not scanned");
  assert.equal(status(report, "signup-verification", "CNT-001"), "fail");
  assert.equal(status(report, "signup-verification", "LNK-006"), "pass");
  assert.equal(status(report, "password-reset", "E2E-001"), "pass");
  assert.match(report.flows[0].checks.find((c) => c.id === "DLV-004").detail, /412 ms/);
});
