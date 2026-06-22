import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";
import webpush from "web-push";

dotenv.config();

const envPath = path.resolve(process.cwd(), ".env");
const force = process.argv.includes("--force");

function upsertEnvLine(content: string, key: string, value: string): string {
  const escaped = value.replace(/\r?\n/g, "");
  const line = `${key}="${escaped}"`;
  const pattern = new RegExp(`^${key}=.*$`, "m");

  if (pattern.test(content)) {
    return content.replace(pattern, line);
  }

  const trimmed = content.endsWith("\n") ? content : `${content}\n`;
  return `${trimmed}${line}\n`;
}

function readEnv(): string {
  if (fs.existsSync(envPath)) {
    return fs.readFileSync(envPath, "utf8");
  }
  return "";
}

function hasValue(raw: string, key: string): boolean {
  const pattern = new RegExp(`^${key}=(.*)$`, "m");
  const match = raw.match(pattern);
  if (!match) {
    return false;
  }

  const value = match[1].trim().replace(/^"|"$/g, "");
  return value.length > 0;
}

function main() {
  const current = readEnv();
  const hasPublic = hasValue(current, "VAPID_PUBLIC_KEY");
  const hasPrivate = hasValue(current, "VAPID_PRIVATE_KEY");
  const hasSubject = hasValue(current, "VAPID_SUBJECT");

  if (!force && hasPublic && hasPrivate && hasSubject) {
    console.log("VAPID keys already exist in .env. Use --force to regenerate.");
    return;
  }

  const keys = webpush.generateVAPIDKeys();

  let next = current;
  next = upsertEnvLine(next, "VAPID_PUBLIC_KEY", keys.publicKey);
  next = upsertEnvLine(next, "VAPID_PRIVATE_KEY", keys.privateKey);

  if (!hasSubject || force) {
    next = upsertEnvLine(next, "VAPID_SUBJECT", "mailto:admin@your-org.local");
  }

  fs.writeFileSync(envPath, next, "utf8");

  console.log("Push setup completed.");
  console.log("Updated .env keys: VAPID_PUBLIC_KEY, VAPID_PRIVATE_KEY, VAPID_SUBJECT");
}

main();
