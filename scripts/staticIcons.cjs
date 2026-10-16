"use strict";

// Static-file handler for /providers/* and /icons/* (used by custom-server.js).
//
// Next serves files from public/ with "Cache-Control: public, max-age=0", so
// every dashboard load re-validates each provider icon as a conditional GET —
// a page with dozens of icons pays dozens of round-trips on every visit.
// These files are stable by name and small, so they are served here with a
// 7-day browser cache instead.
//
// The handler is deliberately conservative: anything outside the allowlist
// (non-GET/HEAD, unknown directory or extension, unsafe filename, missing
// file) returns false so the caller falls through to the Next handler, which
// keeps its existing 404 behaviour.

const fs = require("fs");
const path = require("path");

const STATIC_ICON_CACHE = "public, max-age=604800"; // 7 days

const ICON_DIRS = {
  "/providers/": "providers",
  "/icons/": "icons",
};

const ICON_CONTENT_TYPES = {
  ".png": "image/png",
  ".svg": "image/svg+xml",
  ".webp": "image/webp",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".ico": "image/x-icon",
};

function createStaticIconHandler({ publicDir, cacheControl = STATIC_ICON_CACHE } = {}) {
  if (!publicDir) throw new Error("staticIcons: publicDir is required");

  return function tryServeStaticIcon(req, res) {
    if (!req || !res) return false;
    if (req.method !== "GET" && req.method !== "HEAD") return false;

    const rawUrl = typeof req.url === "string" ? req.url : "";
    const queryIndex = rawUrl.indexOf("?");
    const pathname = queryIndex === -1 ? rawUrl : rawUrl.slice(0, queryIndex);

    let dir = null;
    let file = null;
    for (const prefix of Object.keys(ICON_DIRS)) {
      if (pathname.startsWith(prefix)) {
        dir = ICON_DIRS[prefix];
        file = pathname.slice(prefix.length);
        break;
      }
    }
    if (!dir || !file) return false;

    // Filenames are flat icon ids; refuse subpaths, encoded characters and
    // ".." so nothing outside public/<dir>/ can be requested.
    if (!/^[A-Za-z0-9._-]+$/.test(file) || file.includes("..")) return false;
    const contentType = ICON_CONTENT_TYPES[path.extname(file).toLowerCase()];
    if (!contentType) return false;

    const fullPath = path.join(publicDir, dir, file);
    let stat;
    try {
      stat = fs.statSync(fullPath);
    } catch {
      return false; // missing file → Next handles the 404 like before
    }
    if (!stat.isFile()) return false;

    const etag = `"${stat.size.toString(16)}-${Math.floor(stat.mtimeMs).toString(16)}"`;
    res.setHeader("Cache-Control", cacheControl);
    res.setHeader("ETag", etag);
    res.setHeader("Last-Modified", stat.mtime.toUTCString());
    if (req.headers && req.headers["if-none-match"] === etag) {
      res.writeHead(304);
      res.end();
      return true;
    }

    res.setHeader("Content-Type", contentType);
    res.setHeader("Content-Length", String(stat.size));
    res.writeHead(200);
    if (req.method === "HEAD") {
      res.end();
      return true;
    }
    const stream = fs.createReadStream(fullPath);
    stream.on("error", () => res.destroy());
    stream.pipe(res);
    return true;
  };
}

module.exports = { createStaticIconHandler, STATIC_ICON_CACHE };
