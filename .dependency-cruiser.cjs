// Enforces Plugins page §7 / Desing architecture §3.1: a plugin may depend
// only on @linnote/plugin-sdk (and any other plugin it explicitly lists in
// its manifest's `dependencies`, resolved through the registry at runtime,
// never through a source import) — never by reaching into another plugin
// package's internals directly.
//
// Run: pnpm lint:boundaries   (wired into CI per Plugins page §12)

/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-cross-plugin-imports",
      comment:
        "Plugins must not import another plugin package's source directly. " +
        "Depend on it explicitly in package.json and go through the " +
        "PluginContext the registry hands to activate(), not a source import.",
      severity: "error",
      from: { path: "^plugins/([^/]+)/src" },
      to: {
        path: "^plugins/([^/]+)/src",
        pathNot: "^plugins/$1/src",
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    tsConfig: { fileName: "tsconfig.base.json" },
    doNotFollow: { path: "node_modules" },
    exclude: { path: "(^|/)(dist|target|gen|node_modules)($|/)" },
  },
};
