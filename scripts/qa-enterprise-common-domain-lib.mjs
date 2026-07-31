import fs from "node:fs";
import path from "node:path";

const root = process.cwd();

export function read(relativePath) {
  const absolute = path.join(root, relativePath);
  if (!fs.existsSync(absolute)) throw new Error(`Missing required file: ${relativePath}`);
  return fs.readFileSync(absolute, "utf8");
}

export function requireTokens(relativePath, tokens) {
  const content = read(relativePath);
  for (const token of tokens) {
    if (!content.includes(token)) throw new Error(`${relativePath} is missing required token: ${token}`);
  }
}

export function forbidTokens(relativePath, tokens) {
  const content = read(relativePath);
  for (const token of tokens) {
    if (content.includes(token)) throw new Error(`${relativePath} contains forbidden token: ${token}`);
  }
}

export function requirePaths(paths) {
  for (const relativePath of paths) read(relativePath);
}

export function success(name) {
  console.log(`✓ ${name}`);
}
