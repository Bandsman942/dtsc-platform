import fs from "node:fs";
import process from "node:process";

const target = Number.parseInt(process.env.TARGET_VUS || "0", 10);
const profile = (process.env.LOAD_PROFILE || "").toLowerCase();
const registryPath = process.env.SCALE7_REGISTRY_PATH || "data/scalability/scale7-certifications.json";

if (![500, 1000, 2500, 5000].includes(target) || !["ramp", "soak", "spike"].includes(profile)) {
  console.error("Invalid SCALE-7 target/profile");
  process.exit(1);
}

const registry = JSON.parse(fs.readFileSync(registryPath, "utf8"));
const records = Array.isArray(registry.records) ? registry.records : [];
const latestPass = (stage, mode) => records
  .filter((record) => record.targetVus === stage && record.profile === mode && record.status === "PASS")
  .sort((a, b) => Date.parse(b.testedAt) - Date.parse(a.testedAt))[0] || null;

const profiles = ["ramp", "soak", "spike"];
const previousStage = target === 1000 ? 500 : target === 2500 ? 1000 : target === 5000 ? 2500 : null;

if (previousStage && !profiles.every((mode) => latestPass(previousStage, mode))) {
  console.error(`SCALE-7 stage ${target} is blocked until ${previousStage} has PASS evidence for ramp, soak and spike`);
  process.exit(1);
}

if (profile === "soak" && !latestPass(target, "ramp")) {
  console.error(`SCALE-7 ${target} soak is blocked until ramp has PASS evidence`);
  process.exit(1);
}

if (profile === "spike" && (!latestPass(target, "ramp") || !latestPass(target, "soak"))) {
  console.error(`SCALE-7 ${target} spike is blocked until ramp and soak have PASS evidence`);
  process.exit(1);
}

console.log(`SCALE-7 progression gate: ${target} ${profile} allowed`);
