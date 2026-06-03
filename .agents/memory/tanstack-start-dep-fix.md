---
name: TanStack Start dep optimization fix
description: How to prevent Vite's esbuild dep scanner from failing on TanStack Start virtual module imports
---

The TanStack Start plugin uses virtual modules (`#tanstack-router-entry`, `#tanstack-start-entry`, `#tanstack-start-plugin-adapters`, `tanstack-start-manifest:v`) that are resolved by Vite plugins at runtime. Vite's esbuild dep scanner runs BEFORE these plugin resolvers are active, and tries to bundle `@tanstack/start-server-core` from the client environment's entry point crawl — hitting the `#...` imports and failing.

**Fix:** Add a post-plugin to `vite.config.ts` that excludes the problematic packages from client dep optimization:

```ts
{
  name: "fix-tanstack-start-dep-scan",
  enforce: "post",
  config() {
    return {
      optimizeDeps: {
        exclude: [
          "@tanstack/start-server-core",
          "@tanstack/react-start",
          "@tanstack/react-router",
        ],
      },
    };
  },
}
```

**Why:** Vite's `virtualModuleRE = /^virtual-module:.*/` only handles `virtual-module:` prefixed modules. The `#...` imports in `@tanstack/start-server-core` are not caught by this handler, so esbuild tries to resolve them via Node.js package `imports` map and fails.

**How to apply:** Always include this post-plugin in `vite.config.ts` for any TanStack Start project. The original `@lovable.dev/vite-tanstack-config` avoided this by running in a Lovable sandbox environment with different dev server setup.

**Also required:** Node.js >= 22.12.0. The packages have `"engines": {"node": ">=22.12.0"}`. Use `nodejs-22` module in Replit (not `nodejs-20`).
