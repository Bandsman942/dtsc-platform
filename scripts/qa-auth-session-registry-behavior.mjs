import assert from "node:assert/strict";
import { randomUUID, webcrypto } from "node:crypto";
import { createRequire } from "node:module";
import { readFileSync } from "node:fs";
import ts from "typescript";

if (!globalThis.crypto) globalThis.crypto = webcrypto;
const nativeRequire = createRequire(import.meta.url);
function load(path, dependencies = {}) {
  const source = readFileSync(new URL("../" + path, import.meta.url), "utf8");
  const { outputText } = ts.transpileModule(source, {
    compilerOptions: { target: ts.ScriptTarget.ES2022, module: ts.ModuleKind.CommonJS },
  });
  const mod = { exports: {} };
  const resolver = (name) => name in dependencies ? dependencies[name] : nativeRequire(name);
  new Function("require", "module", "exports", outputText)(resolver, mod, mod.exports);
  return mod.exports;
}

const now = Date.now();
const records = new Map();
const preferences = new Map();
const inactive = new Set();
const blockedMemberships = new Set();
const prisma = {
  user: {
    async findUnique({ where }) {
      return { status: inactive.has(where.id) ? "SUSPENDED" : "ACTIVE" };
    },
  },
  organizationMember: {
    async findFirst({ where }) {
      return blockedMemberships.has(where.userId + ":" + where.organizationId) ? null : { id: "m1" };
    },
  },
  authSession: {
    async create({ data }) {
      assert.ok(!records.has(data.id), "IDs must be unique");
      records.set(data.id, { ...data, revokedAt: null, lastSeenAt: new Date() });
      return records.get(data.id);
    },
    async findFirst({ where }) {
      const row = records.get(where.id);
      return row && row.userId === where.userId && !row.revokedAt &&
        row.absoluteExpiresAt > where.absoluteExpiresAt.gt ? { id: row.id } : null;
    },
    async updateMany({ where, data }) {
      let count = 0;
      for (const row of records.values()) {
        if (typeof where.id === "string" && where.id !== row.id) continue;
        if (where.userId && where.userId !== row.userId) continue;
        if (where.revokedAt === null && row.revokedAt) continue;
        if (where.id?.not && row.id === where.id.not) continue;
        if (where.absoluteExpiresAt?.gt && row.absoluteExpiresAt <= where.absoluteExpiresAt.gt) continue;
        for (const [key, value] of Object.entries(data)) row[key] = value;
        count++;
      }
      return { count };
    },
  },
  userSessionPreference: {
    async findUnique({ where }) {
      return preferences.get(where.userId) || null;
    },
    async upsert({ where, create, update }) {
      const current = preferences.get(where.userId);
      const next = current ? { ...current, ...update } : create;
      preferences.set(where.userId, next);
      return next;
    },
  },
  async $transaction(promises) { return Promise.all(promises); },
};
const registry = load("lib/auth/session-registry.ts", {
  "@/lib/prisma": { prisma },
  "next/headers": { headers: async () => ({ get: (name) => name === "user-agent" ? "DTSC QA browser" : null }) },
});

const session = (userId, id) => ({
  userId, sessionId: id, exp: Math.floor((now + 60_000) / 1000),
  absoluteExp: Math.floor((now + 86_400_000) / 1000),
});
const u1a = session("u1", registry.newSessionId());
const u1b = session("u1", registry.newSessionId());
const u2 = session("u2", registry.newSessionId());
assert.match(u1a.sessionId, /^[0-9a-f-]{36}$/i);
await registry.registerAuthSession(u1a);
await registry.registerAuthSession(u1b);
await registry.registerAuthSession(u2);
assert.equal(records.size, 3);
assert.equal(records.get(u1a.sessionId).userAgent, "DTSC QA browser");

assert.equal(await registry.isAuthSessionActive(u1a), true);
inactive.add("u1");
assert.equal(await registry.isAuthSessionActive(u1a), false, "Suspended accounts must be rejected");
inactive.delete("u1");
assert.equal(await registry.isAuthSessionActive({
  ...u1a, activeContext: "ORGANIZATION", activeOrganizationId: "o1",
}), true);
blockedMemberships.add("u1:o1");
assert.equal(await registry.isAuthSessionActive({
  ...u1a, activeContext: "ORGANIZATION", activeOrganizationId: "o1",
}), false, "Revoked organization membership must terminate signed context");
blockedMemberships.delete("u1:o1");
assert.equal(await registry.isAuthSessionActive(u1b), true);
assert.equal(await registry.isAuthSessionActive(u2), true);
assert.equal(await registry.isAuthSessionActive({ ...u1a, userId: "u2" }), false, "Cannot use another user's session");
assert.equal(await registry.touchRegisteredSession(u1a), true);
assert.equal(await registry.revokeOneSession("u2", u1a.sessionId, "OTHER"), 0, "Cannot revoke foreign session");
assert.equal(await registry.revokeOneSession("u1", u1a.sessionId, "USER_REVOKE"), 1);
assert.equal(await registry.isAuthSessionActive(u1a), false, "Revoked session must be rejected");
assert.equal(await registry.touchRegisteredSession(u1a), false, "Revoked session cannot be renewed");
assert.equal(await registry.revokeOneSession("u1", u1a.sessionId, "AGAIN"), 0, "Revoke must be idempotent");

const legacy = { userId: "u1", authTime: Math.floor((now - 60_000) / 1000) };
assert.equal(await registry.isAuthSessionActive(legacy), true, "Legacy compatibility before cutover");
assert.equal(await registry.revokeOtherSessions("u1", u1b.sessionId), 0);
assert.equal(await registry.isAuthSessionActive(legacy), false, "Legacy sessions must be invalidated by cutover");
assert.equal(await registry.isAuthSessionActive(u1b), true, "Kept current session still authorized");
assert.equal(await registry.isAuthSessionActive(u2), true, "Other users untouched");

const windowMs = now + 1000;
const u1c = session("u1", registry.newSessionId());
await registry.registerAuthSession(u1c);
assert.equal(await registry.revokeOtherSessions("u1", u1b.sessionId), 1);
assert.equal(await registry.isAuthSessionActive(u1c), false);
assert.equal(await registry.isAuthSessionActive(u1b), true);

const sessionPolicy = {
  createInitialSessionWindow: (_minutes, seconds) => ({
    authTime: seconds, issuedAt: seconds, exp: seconds + 900,
    absoluteExp: seconds + 30 * 24 * 3600, idleTimeoutMinutes: 15,
  }),
  renewSessionWindow: ({ authTime, absoluteExp, nowSeconds }) => ({
    authTime, issuedAt: nowSeconds, exp: nowSeconds + 900,
    absoluteExp, idleTimeoutMinutes: 15,
  }),
};
const signer = load("lib/session.ts", { "@/lib/session-policy": sessionPolicy });
const newSigned = await signer.createSessionToken({
  userId: "u1", sessionId: u1b.sessionId, name: "DTSC", role: "CLIENT", email: "a@example.test",
}, "a-fixed-unit-test-secret-that-is-only-used-locally");
assert.ok(newSigned.token);
assert.equal((await signer.verifySessionToken(newSigned.token, "a-fixed-unit-test-secret-that-is-only-used-locally")).sessionId, u1b.sessionId);
assert.equal(await signer.verifySessionToken(newSigned.token, "WRONG"), null, "Invalid signature must fail");
const renewed = await signer.createSessionToken({
  userId: "u1", sessionId: u1b.sessionId, name: "DTSC", role: "CLIENT", email: "a@example.test",
}, "a-fixed-unit-test-secret-that-is-only-used-locally", { previous: newSigned.session });
assert.equal(renewed.session.sessionId, u1b.sessionId);
console.log("AUTH-03 behavioral tests: ledger, cross-user isolation, revocation, legacy cutover and signed renewal OK");
