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

if (failures.length) {
  console.error("Shop 2 active customer cookie QA failed:\n" + failures.map((failure) => `- ${failure}`).join("\n"));
  process.exit(1);
}
console.log("Shop 2 active customer cookie QA passed.");
