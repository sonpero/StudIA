import { defineConfig } from "drizzle-kit";

// Points straight at each module's infra/schema.ts rather than an
// apps/api-level re-export: drizzle-kit loads the schema file via a plain
// Node require() with no bundler, which cannot follow this repo's NodeNext
// `.js`-suffixed relative imports across the @studia/core package boundary.
// A glob keeps this working as new modules add their own infra/schema.ts.
export default defineConfig({
  schema: "../../packages/core/src/*/infra/schema.ts",
  out: "./drizzle",
  dialect: "sqlite",
});
