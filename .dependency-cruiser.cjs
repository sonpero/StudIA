/** @type {import('dependency-cruiser').IConfiguration} */
module.exports = {
  forbidden: [
    {
      name: "no-deep-module-import",
      comment:
        "Cross-module imports must go through the other module's index.ts, never its internals (CLAUDE.md).",
      severity: "error",
      from: {
        path: "^packages/core/src/([^/]+)/",
      },
      to: {
        path: "^packages/core/src/([^/]+)/(?!index\\.ts$).+",
        pathNot: "^packages/core/src/$1/",
      },
    },
    {
      name: "domain-is-pure",
      comment:
        "domain/** must have zero I/O: no importing application/**, infra/**, or any package that does I/O (CLAUDE.md).",
      severity: "error",
      from: {
        path: "^packages/core/src/[^/]+/domain/",
      },
      to: {
        path: "^packages/core/src/[^/]+/(application|infra)/",
      },
    },
    {
      name: "no-ai-in-progress",
      comment: "progress/** must not import any AI package: scheduling is a pure, deterministic function (CLAUDE.md).",
      severity: "error",
      from: {
        path: "^packages/core/src/progress/",
      },
      to: {
        // Not anchored to `^node_modules/`: pnpm resolves a package through
        // `node_modules/.pnpm/ai@x.y.z/node_modules/ai/...`, never through a
        // top-level `node_modules/ai/...`, so an anchored pattern never
        // matches under pnpm and this rule silently never fires (same bug,
        // same fix, as no-fsrs-outside-review below).
        path: "(^|/)node_modules/(ai|@ai-sdk)/",
      },
    },
    {
      name: "no-fsrs-outside-review",
      comment: "ts-fsrs must only be imported from review/domain/scheduler.ts (CLAUDE.md).",
      severity: "error",
      from: {
        pathNot: "^packages/core/src/review/domain/scheduler\\.ts$",
      },
      to: {
        // See no-ai-in-progress's comment: must match pnpm's nested
        // `.pnpm/ts-fsrs@x/node_modules/ts-fsrs/...` resolution too, not
        // just a hypothetical top-level `node_modules/ts-fsrs`.
        path: "(^|/)node_modules/ts-fsrs(/|$)",
      },
    },
    {
      name: "no-circular-dependency",
      comment:
        "No import cycle, anywhere: two modules that must each load before the other can is exactly the coupling this repo's module-per-domain design (CLAUDE.md) rules out. The concrete case this exists to catch: review <-> progress, considered and rejected for M6 (docs/modules/progress.md's 'notionsBelowTarget' section).",
      severity: "error",
      from: {},
      to: {
        circular: true,
      },
    },
    {
      name: "workspace-no-cross-module-sql",
      comment:
        "workspace/infra/** (its own SQL repository) must never touch another business module's tables directly (docs/modules/workspace.md: 'it reads through public interfaces only'). A plain to.path rule cannot forbid this: another module's schema tables are legitimately re-exported from its own index.ts for other modules' documented cross-module joins (e.g. review's), so the file-level edge from workspace/infra/** to that index.ts looks identical whether it's a join or an allowed type-only reference. dependencyTypesNot: type-only is what actually distinguishes them — importing a VALUE (a table, a class) from another module's index.ts is what this forbids; importing only its TYPES is not. shared/ and jobs/ are excluded from `to`: they are frozen kernels, not business modules with tables of their own, and every module (including workspace's infra layer, e.g. its LLM adapters' createLanguageModel, err/ok) legitimately imports values from them — found as a false positive the first time this rule ran for real, against workspace's own extractor adapters.",
      severity: "error",
      from: {
        path: "^packages/core/src/workspace/infra/",
      },
      to: {
        path: "^packages/core/src/(?!workspace/|shared/|jobs/)[^/]+/index\\.ts$",
        dependencyTypesNot: ["type-only"],
      },
    },
    {
      name: "frozen-kernels",
      comment:
        "jobs/** and shared/** are frozen kernels: they must not import any business module (CLAUDE.md).",
      severity: "error",
      from: {
        path: "^packages/core/src/(jobs|shared)/",
      },
      to: {
        path: "^packages/core/src/(?!jobs/|shared/)[^/]+/",
      },
    },
  ],
  options: {
    tsPreCompilationDeps: true,
    exclude: {
      path: "\\.(unit|int|contract)\\.test\\.tsx?$",
    },
    enhancedResolveOptions: {
      exportsFields: ["exports"],
      conditionNames: ["import", "node", "default"],
    },
  },
};
