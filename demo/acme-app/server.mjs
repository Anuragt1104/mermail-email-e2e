// Acme Notes: a deliberately small app whose transactional emails we test end to end.
// Signup sends a verification link; password reset sends a 6-digit code. Mail goes out through
// Mermail's Email API (the same workspace the test inbox lives in).
import { randomInt, randomUUID } from "node:crypto";
import { createServer } from "node:http";
import { config } from "./config.mjs";
import { sendEmail } from "./mailer.mjs";
import { render } from "./render.mjs";

const PORT = config.port;
const APP_URL = config.appUrl;

/** @type {Map<string, {id: string, name: string, email: string, verified: boolean, verifyToken: string, resetCode?: string, resetExpires?: number}>} */
const users = new Map();

async function sendVerificationEmail(user) {
  await sendEmail({
    to: user.email,
    subject: "Confirm your Acme Notes account",
    html: render("verify.html", {
      name: user.name,
      verifyUrl: `${APP_URL}/verify?token=${user.id}`,
    }),
  });
}

function trackSignup(user) {
  console.log(`[analytics] signup ${user.id}`);
}

// Side effects that run for every new account.
const onUserCreated = [trackSignup, sendVerificationEmail];

async function signup({ name, email }) {
  const user = { id: randomUUID(), name, email: email.toLowerCase(), verified: false, verifyToken: randomUUID().replace(/-/g, "") };
  users.set(user.email, user);

  await sendVerificationEmail(user);
  for (const hook of onUserCreated) await hook(user);
  return { id: user.id, email: user.email, verified: user.verified };
}

async function requestPasswordReset({ email }) {
  const user = users.get(String(email).toLowerCase());
  if (!user) return { ok: true }; // never reveal whether an account exists
  user.resetCode = String(randomInt(0, 1_000_000)).padStart(6, "0");
  user.resetExpires = Date.now() + 10 * 60_000;

  const vars = { name: user.name, code: user.resetCode };
  await sendEmail({
    to: user.email,
    subject: "Your Acme Notes reset code",
    html: render("reset.html", vars),
    text: render("reset.txt", vars),
  });
  return { ok: true };
}

function confirmPasswordReset({ email, code }) {
  const user = users.get(String(email).toLowerCase());
  if (!user || !user.resetCode || user.resetExpires < Date.now() || code !== user.resetCode) return [400, { error: "Invalid or expired code" }];
  user.resetCode = undefined;
  return [200, { ok: true, email: user.email }];
}

function verify(token) {
  const user = [...users.values()].find((u) => u.verifyToken === token);
  if (!user) return [400, page("Link invalid", "This verification link is invalid or has expired.")];
  user.verified = true;
  return [200, page("Email verified", `Thanks ${escapeHtml(user.name)}, your Acme Notes account is verified.`)];
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (ch) => `&#${ch.charCodeAt(0)};`);

function page(title, message) {
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><title>${title} · Acme Notes</title>
<style>body{font:16px/1.5 system-ui,sans-serif;background:#f6f7fb;display:grid;place-items:center;min-height:100vh;margin:0}
main{background:#fff;padding:40px 48px;border-radius:14px;box-shadow:0 8px 30px #0001;max-width:440px}h1{margin:0 0 8px}</style></head>
<body><main><h1>${title}</h1><p>${message}</p></main></body></html>`;
}

const LANDING = page(
  "Acme Notes",
  `Notes that sync everywhere.<br><br><form method="post" action="/signup-form">
<input name="name" placeholder="Name" required> <input name="email" type="email" placeholder="Email" required> <button>Sign up</button></form>`,
);

const server = createServer(async (req, res) => {
  const url = new URL(req.url, APP_URL);
  const send = (status, body) => {
    const isJson = typeof body !== "string";
    res.writeHead(status, { "content-type": isJson ? "application/json" : "text/html; charset=utf-8" });
    res.end(isJson ? JSON.stringify(body) : body);
  };
  try {
    if (req.method === "GET" && url.pathname === "/") return send(200, LANDING);
    if (req.method === "GET" && url.pathname === "/verify") return send(...verify(url.searchParams.get("token") ?? ""));
    if (req.method === "GET" && url.pathname.startsWith("/api/users/")) {
      const user = users.get(decodeURIComponent(url.pathname.slice("/api/users/".length)).toLowerCase());
      return user ? send(200, { email: user.email, name: user.name, verified: user.verified }) : send(404, { error: "Not found" });
    }
    if (req.method === "POST") {
      const body = await readBody(req);
      if (url.pathname === "/api/signup") {
        if (!body.email || !body.name) return send(400, { error: "name and email are required" });
        return send(201, await signup(body));
      }
      if (url.pathname === "/signup-form") {
        await signup(body);
        return send(200, page("Check your inbox", `We sent a confirmation link to ${escapeHtml(body.email)}.`));
      }
      if (url.pathname === "/api/password-reset") return send(202, await requestPasswordReset(body));
      if (url.pathname === "/api/password-reset/confirm") return send(...confirmPasswordReset(body));
    }
    send(404, { error: "Not found" });
  } catch (error) {
    console.error(error);
    send(502, { error: error.message });
  }
});

async function readBody(req) {
  const chunks = [];
  for await (const chunk of req) chunks.push(chunk);
  const raw = Buffer.concat(chunks).toString("utf8");
  if ((req.headers["content-type"] ?? "").includes("application/json")) return raw ? JSON.parse(raw) : {};
  return Object.fromEntries(new URLSearchParams(raw));
}

server.listen(PORT, () => console.log(`Acme Notes listening on ${APP_URL}`));
