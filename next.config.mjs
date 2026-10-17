import { execSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const projectRoot = dirname(fileURLToPath(import.meta.url));

// Commit the app is built from, baked into every bundle (client + server) so
// the dashboard and /api/version can show which revision an instance runs.
// Empty when building without a git checkout (packaged tarballs, docker COPY).
const buildGitSha = (() => {
  try {
    return execSync("git rev-parse HEAD", { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
  } catch {
    return "";
  }
})();

// "owner/repo" of the origin remote (the fork the server syncs from), used by
// /api/version to check whether the running commit is the latest one on the
// repo. Empty when there is no GitHub origin — the check is then skipped.
const buildRepoSlug = (() => {
  try {
    const remote = execSync("git remote get-url origin", { cwd: projectRoot, stdio: ["ignore", "pipe", "ignore"] })
      .toString()
      .trim();
    const match = remote.match(/github\.com[:/]([^/\s]+)\/([^/\s]+?)(?:\.git)?\/?$/i);
    return match ? `${match[1]}/${match[2]}` : "";
  } catch {
    return "";
  }
})();
// CLI bundling needs workspace root so tracing includes hoisted node_modules (slim ~50MB).
// Docker / default uses projectRoot so server.js lands at /app/server.js (not nested).
const tracingRoot = process.env.NEXT_TRACING_ROOT_MODE === "workspace"
  ? join(projectRoot, "..")
  : projectRoot;
const proxyClientMaxBodySize = process.env.NINEROUTER_PROXY_CLIENT_MAX_BODY_SIZE || "128mb";

/** @type {import('next').NextConfig} */
const nextConfig = {
  distDir: process.env.NEXT_DIST_DIR || ".next",
  // Default: standalone output (Docker, CLI packaging, `npm run start:bun`).
  // Deployments that serve via `next start` from a repo checkout can set
  // NEXT_OUTPUT=default to skip the unused standalone build — that also keeps
  // Next from warning about `next start` with a standalone config.
  output: process.env.NEXT_OUTPUT === "default" ? undefined : "standalone",
  // `open` must stay external. It derives its own directory from `import.meta.url`, and
  // webpack replaces that with the absolute path of the BUILD machine as a string literal.
  // A release built on macOS therefore ships `file:///Users/.../open/index.js`, which
  // `fileURLToPath` rejects on Windows ("File URL path must be absolute" — no drive
  // letter). That throw happens at module scope, so every consumer of `open` dies on
  // import — including xAI/Grok token refresh, which loads the OAuth service that imports
  // it. Keeping it external preserves the real `import.meta.url` at runtime.
  // @aws-sdk/credential-providers must stay external for the same class of reason: it reads
  // ~/.aws/config and the SSO token cache from disk at runtime and resolves its credential
  // plugins by dynamic require, neither of which survives bundling.
  serverExternalPackages: ["better-sqlite3", "sql.js", "node:sqlite", "bun:sqlite", "open", "@aws-sdk/credential-providers"],
  turbopack: {
    root: tracingRoot
  },
  outputFileTracingRoot: tracingRoot,
  outputFileTracingExcludes: {
    "*": ["./gitbook/**/*"]
  },
  images: {
    unoptimized: true
  },
  env: {
    BUILD_GIT_SHA: buildGitSha,
    BUILD_REPO_SLUG: buildRepoSlug
  },
  experimental: {
    // #1529/#1572: LLM clients can send long context or base64 image payloads through /v1 rewrites.
    proxyClientMaxBodySize,
    // Cache fetch responses across HMR refreshes for faster dev reloads.
    serverComponentsHmrCache: true,
    // Tree-shake heavy barrel imports to cut compile + bundle size
    optimizePackageImports: ["@xyflow/react", "@dnd-kit/core", "@dnd-kit/sortable", "material-symbols", "marked"],
  },
  webpack: (config, { isServer }) => {
    // Ignore fs/path modules in browser bundle
    if (!isServer) {
      config.resolve.fallback = {
        ...config.resolve.fallback,
        fs: false,
        path: false,
      };
    }
    // Exclude non-source dirs from watcher to reduce inotify load
    config.watchOptions = {
      ...config.watchOptions,
      aggregateTimeout: 300,
      ignored: /[\\/](node_modules|\.git|logs|\.next|\.next-cli-build|gitbook|cli|open-sse\.old|tests|docs)[\\/]/,
    };
    return config;
  },
  async rewrites() {
    return [
      {
        source: "/v1/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1/v1",
        destination: "/api/v1"
      },
      {
        source: "/codex/:path*",
        destination: "/api/v1/responses"
      },
      {
        source: "/responses",
        destination: "/api/v1/responses"
      },
      {
        source: "/systemone",
        destination: "/api/v1/systemone"
      },
      {
        source: "/v1beta/:path*",
        destination: "/api/v1beta/:path*"
      },
      {
        source: "/v1beta",
        destination: "/api/v1beta"
      },
      {
        source: "/v1/:path*",
        destination: "/api/v1/:path*"
      },
      {
        source: "/v1",
        destination: "/api/v1"
      }
    ];
  }
};

export default nextConfig;
