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
      name: "no-ai-in-planning",
      comment: "planning/** must not import any AI package: scheduling is a pure, deterministic function (CLAUDE.md).",
      severity: "error",
      from: {
        path: "^packages/core/src/planning/",
      },
      to: {
        path: "^node_modules/(ai|@ai-sdk)/",
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
        path: "^node_modules/ts-fsrs",
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
