import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createServer } from "node:http";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import staticIcons from "../../scripts/staticIcons.cjs";

const { createStaticIconHandler, STATIC_ICON_CACHE } = staticIcons;

const PNG_BYTES = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a, 1, 2, 3]);

let server;
let baseUrl;
let dir;

beforeAll(async () => {
  dir = mkdtempSync(join(tmpdir(), "static-icons-"));
  mkdirSync(join(dir, "providers"));
  mkdirSync(join(dir, "icons"));
  writeFileSync(join(dir, "providers", "claude.png"), PNG_BYTES);
  writeFileSync(join(dir, "providers", "brand.svg"), "<svg/>");
  writeFileSync(join(dir, "icons", "icon-192.svg"), "<svg/>");
  writeFileSync(join(dir, "providers", "notes.txt"), "not an icon");

  const handler = createStaticIconHandler({ publicDir: dir });
  server = createServer((req, res) => {
    if (handler(req, res)) return;
    res.writeHead(404, { "x-next": "1" });
    res.end("next-handler");
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  baseUrl = `http://127.0.0.1:${server.address().port}`;
});

afterAll(async () => {
  await new Promise((resolve) => server.close(resolve));
  rmSync(dir, { recursive: true, force: true });
});

describe("static icon handler", () => {
  it("serves icons with a long browser cache and the right content type", async () => {
    const res = await fetch(`${baseUrl}/providers/claude.png`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toBe("image/png");
    expect(res.headers.get("cache-control")).toBe(STATIC_ICON_CACHE);
    expect(res.headers.get("etag")).toBeTruthy();
    expect(Buffer.from(await res.arrayBuffer()).equals(PNG_BYTES)).toBe(true);
  });

  it("serves svg files from both icon directories", async () => {
    const a = await fetch(`${baseUrl}/providers/brand.svg`);
    const b = await fetch(`${baseUrl}/icons/icon-192.svg`);
    expect(a.status).toBe(200);
    expect(a.headers.get("content-type")).toBe("image/svg+xml");
    expect(b.status).toBe(200);
  });

  it("answers HEAD without a body", async () => {
    const res = await fetch(`${baseUrl}/providers/claude.png`, { method: "HEAD" });
    expect(res.status).toBe(200);
    expect(res.headers.get("content-length")).toBe(String(PNG_BYTES.length));
    expect(await res.text()).toBe("");
  });

  it("revalidates with the ETag", async () => {
    const first = await fetch(`${baseUrl}/providers/claude.png`);
    const etag = first.headers.get("etag");
    const second = await fetch(`${baseUrl}/providers/claude.png`, { headers: { "if-none-match": etag } });
    expect(second.status).toBe(304);
  });

  it("ignores query strings", async () => {
    const res = await fetch(`${baseUrl}/providers/claude.png?v=123`);
    expect(res.status).toBe(200);
  });

  it("falls through for everything outside the allowlist", async () => {
    const paths = [
      "/dashboard",
      "/providers/missing.png",
      "/providers/notes.txt",
      "/providers/claude.png/extra",
      "/providers/%2e%2e%2fsecret.txt",
      "/providers/..%2Fsecret.txt",
      "/other/claude.png",
    ];
    for (const path of paths) {
      const res = await fetch(`${baseUrl}${path}`);
      expect(res.headers.get("x-next"), path).toBe("1");
    }
  });

  it("rejects non-GET/HEAD methods", async () => {
    const res = await fetch(`${baseUrl}/providers/claude.png`, { method: "POST" });
    expect(res.headers.get("x-next")).toBe("1");
  });
});
