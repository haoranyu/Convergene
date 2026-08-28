# Convergene coding agent entry

Before changing product behavior, start with `docs/README.md` and follow its reading order. Treat
accepted ADRs and domain invariants as constraints. Use the Node version from `.nvmrc`, pnpm, and
the repository scripts; do not add a second package manager lockfile or server-side meeting data.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
