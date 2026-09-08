import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const routePath = path.join(root, "app/api/enterprise/[organizationId]/retail/active-customer/route.ts");
const source = fs.readFileSync(routePath, "utf8");
const failures = [];

if (!source.includes("shouldUseSecureSessionCookie")) failures.push("Active customer cookie must reuse the central secure-session cookie policy.");
if (source.includes('secure: process.env.NODE_ENV === "production"')) failures.push("Active customer cookie must not force Secure on loopback next start solely from NODE_ENV.");
if (!source.includes("httpOnly: true")) failures.push("Active customer cookie must remain HttpOnly.");
if (!source.includes('sameSite: "lax"')) failures.push("Active customer cookie must keep SameSite=Lax.");
if (!source.includes('path: "/"')) failures.push("Active customer cookie must remain available across authenticated POS routes.");

const getStart = source.indexOf("export async function GET");
const postStart = source.indexOf("export async function POST");
const deleteStart = source.indexOf("export async function DELETE");
const getBlock = getStart >= 0 && postStart > getStart ? source.slice(getStart, postStart) : "";
const deleteBlock = deleteStart >= 0 ? source.slice(deleteStart) : "";
if (!getBlock) failures.push("Active customer GET contract must remain discoverable.");
if (getBlock.includes("clearCookie(")) failures.push("Active customer GET must stay side-effect free so a stale read cannot erase a newer POS customer selection.");
if (!getBlock.includes("requestedSelection")) failures.push("Active customer GET must preserve observability of whether the request carried a selection without mutating it.");
if (!deleteBlock.includes("clearCookie(")) failures.push("Explicit active customer DELETE must remain the authoritative cookie clear operation.");

if (failures.length) {
  console.error("Shop 2 active customer cookie QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Shop 2 active customer cookie QA passed.");
