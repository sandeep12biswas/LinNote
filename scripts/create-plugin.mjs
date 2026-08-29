#!/usr/bin/env node
// `pnpm create-plugin <name>` — Plugins §8. Copies plugins/_template,
// fills in the package name (@linnote/plugin-<name>), and leaves the
// manifest id as a TODO for the author to set. No central file needs
// editing: pnpm-workspace.yaml already globs plugins/*.
import { cpSync, existsSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";

const name = process.argv[2];
if (!name || !/^[a-z][a-z0-9-]*$/.test(name)) {
  console.error("Usage: pnpm create-plugin <kebab-case-name>");
  console.error('Example: pnpm create-plugin element-pdf-preview');
  process.exit(1);
}

const ROOT = join(import.meta.dirname, "..");
const src = join(ROOT, "plugins", "_template");
const dest = join(ROOT, "plugins", name);

if (existsSync(dest)) {
  console.error(`plugins/${name} already exists.`);
  process.exit(1);
}

cpSync(src, dest, { recursive: true });

const pkgPath = join(dest, "package.json");
const pkg = JSON.parse(readFileSync(pkgPath, "utf8"));
pkg.name = `@linnote/plugin-${name}`;
pkg.description = `TODO: describe this plugin. Scaffolded from plugins/_template (Plugins §8).`;
writeFileSync(pkgPath, JSON.stringify(pkg, null, 2) + "\n");

console.log(`Created plugins/${name} (${pkg.name}).`);
console.log("Next: set a real manifest id/name in src/index.ts, then `pnpm install`.");
