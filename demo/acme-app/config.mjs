// Non-secret settings live in acme.config.json; environment variables override them. Secrets stay in the environment.
import { readFileSync } from "node:fs";

const file = JSON.parse(readFileSync(new URL("./acme.config.json", import.meta.url), "utf8"));

export const config = {
  port: Number(process.env.PORT ?? 4000),
  appUrl: process.env.APP_URL ?? file.appUrl ?? "http://localhost:4000",
  sender: process.env.ACME_SENDER ?? file.sender, // the Mermail mailbox the app sends from
};
