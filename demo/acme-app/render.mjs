// Tiny {{var}} renderer. Unknown variables are left as-is, like many hand-rolled template helpers.
import { readFileSync } from "node:fs";

const dir = new URL("./emails/", import.meta.url);

export function render(file, vars) {
  return readFileSync(new URL(file, dir), "utf8").replace(/\{\{\s*(\w+)\s*\}\}/g, (token, key) => (key in vars ? escape(String(vars[key]), file) : token));
}

function escape(value, file) {
  if (!file.endsWith(".html")) return value;
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}
