#!/usr/bin/env bash
set -euo pipefail

[[ "${CI:-}" == true && "${GITHUB_ACTIONS:-}" == true && -n "${RUNNER_TEMP:-}" ]]
project="$RUNNER_TEMP/dtsc-1226-supabase"

case "${1:-}" in
  start)
    # Fresh, unlinked local project outside the application checkout.
    mkdir "$project"
    (
      cd "$project"
      supabase init
      supabase start --exclude imgproxy,realtime,mailpit,postgres-meta,studio,edge-runtime,logflare,vector,supavisor >/dev/null
      supabase status --output env
    ) > "$project/local.env"

    # Parse only local credentials. Never source the output.
    node --input-type=module - "$project/local.env" <<'NODE'
import { appendFileSync, readFileSync, unlinkSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

const credentialsFile = process.argv[2];
const values = Object.fromEntries(
  readFileSync(credentialsFile, "utf8")
    .split(/\r?\n/)
    .map(line => line.match(/^([A-Z_]+)="([^"\r\n]+)"$/))
    .filter(Boolean)
    .map(([, key, value]) => [key, value]),
);
unlinkSync(credentialsFile);
const url = "http://127.0.0.1:54321";
const bucket = "dtsc-ci-private";
if (values.API_URL !== url && values.API_URL !== "http://localhost:54321") {
  throw new Error("Supabase CLI did not report the expected loopback endpoint");
}
for (const key of [values.SERVICE_ROLE_KEY, values.ANON_KEY]) {
  if (!key || !/^[A-Za-z0-9_.-]+$/.test(key)) {
    throw new Error("Local Supabase JWT missing or invalid");
  }
  console.log("::add-mask::" + key);
}

const storage = createClient(url, values.SERVICE_ROLE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
}).storage;
const result = await storage.createBucket(bucket, { public: false });
if (result.error) throw new Error("Could not create isolated private bucket");
const checked = await storage.getBucket(bucket);
if (checked.error || checked.data?.public !== false) {
  throw new Error("Isolated bucket was not confirmed private");
}

appendFileSync(process.env.GITHUB_ENV, [
  "SUPABASE_STORAGE_URL=" + url,
  "SUPABASE_STORAGE_SERVICE_ROLE_KEY=" + values.SERVICE_ROLE_KEY,
  "E2E_SUPABASE_ANON_KEY=" + values.ANON_KEY,
  "",
].join("\n"));
console.log("Private bucket confirmed on throwaway local Supabase Storage");
NODE
    ;;
  stop)
    if [[ -f "$project/supabase/config.toml" ]] && command -v supabase >/dev/null; then
      (cd "$project" && supabase stop --no-backup)
    fi
    ;;
  *)
    printf '%s\n' 'Expected start or stop' >&2
    exit 2
    ;;
esac
