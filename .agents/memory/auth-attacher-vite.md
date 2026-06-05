---
name: Auth attacher & Vite plugin order
description: auth-attacher.ts uses getStoredToken (not getAccessToken); react plugin must come after tanstackStart
---

## Auth attacher (`src/integrations/supabase/auth-attacher.ts`)

The file is kept even in Replit PG mode — it attaches `Authorization: Bearer <token>` to every server function call.

**Rule:** import `getStoredToken` from `@/lib/auth`, NOT `getAccessToken` (which only exists in Supabase versions of auth.ts).

```ts
import { getStoredToken } from "@/lib/auth";
const token = getStoredToken();
```

**Why:** When Supabase patch was applied, auth.ts exported `getAccessToken`; Replit PG auth.ts exports `getStoredToken`. Mixing them causes a runtime SyntaxError on page load.

## Vite plugin order

`@vitejs/plugin-react` must come **after** `tanstackStart()` in the plugins array, otherwise Vite throws:
> `'@vitejs/plugin-react' is placed before '@tanstack/router-plugin'. The TanStack Router plugin must come BEFORE JSX transformation plugins.`

Correct order:
```ts
plugins: [
  tanstackStart({ ... }),
  react(),
  tailwindcss(),
  tsConfigPaths(),
  ...
]
```

**Why:** TanStack Router plugin must process routes before JSX is transformed.
