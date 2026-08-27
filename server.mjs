/**
 * The marketing site, served the way production serves it.
 *
 * These pages are written for the addresses the gateway gives them — `/`,
 * `/pricing`, `/download` — and every asset they ask for is root-absolute,
 * because the site is served at two different depths and a relative path
 * cannot be right for both. On disk they are flat files with `.html` on the
 * end, so a plain file server answers the homepage and then 404s every link
 * in the nav. The site looks fine and is unusable, which is the worst of the
 * available failures: nothing announces that the server is the problem.
 *
 * So the mirror carries the routing table with it. `ROUTES` below is the same
 * mapping the gateway builds from `SITE_FILES` in
 * `apps/web/src/assets.ts`, and the two are meant to be read side by side.
 *
 * Deliberately dependency-free. Anything that previews this repository —
 * Kumi's own play button included — installs before it starts, and a preview
 * that needs the network to show a page it could have served from disk is a
 * preview that fails in exactly the places previews matter.
 */

import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

const here = path.dirname(fileURLToPath(import.meta.url));

/**
 * Address → file, mirroring the gateway's `SITE_FILES`.
 *
 * An allowlist rather than a directory served whole, for the same reason the
 * gateway keeps one: what is reachable should be a decision somebody made,
 * not a consequence of what happens to be lying in the folder. It also means
 * a page added here without a route is a 404 in preview, which is the same
 * answer production would give — a mirror that is more permissive than the
 * thing it mirrors teaches the wrong lesson.
 */
const ROUTES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/pricing", ["pricing.html", "text/html; charset=utf-8"]],
  ["/waitlist", ["waitlist.html", "text/html; charset=utf-8"]],
  ["/about", ["about.html", "text/html; charset=utf-8"]],
  ["/faq", ["faq.html", "text/html; charset=utf-8"]],
  ["/security", ["security.html", "text/html; charset=utf-8"]],
  ["/download", ["download.html", "text/html; charset=utf-8"]],
  ["/site.css", ["site.css", "text/css; charset=utf-8"]],
  ["/site.js", ["site.js", "text/javascript; charset=utf-8"]],
  ["/site-boot.js", ["site-boot.js", "text/javascript; charset=utf-8"]],
  ["/field.js", ["field.js", "text/javascript; charset=utf-8"]],
  // The type, self-hosted: the deployment's CSP is `font-src 'self'`, so a
  // Google Fonts link would silently never load and the page would render in
  // whatever sans the visitor has. OFL notice ships beside them.
  ["/fonts/bricolage-grotesque.woff2", ["fonts/bricolage-grotesque.woff2", "font/woff2"]],
  ["/fonts/inter.woff2", ["fonts/inter.woff2", "font/woff2"]],
  ["/fonts/jetbrains-mono.woff2", ["fonts/jetbrains-mono.woff2", "font/woff2"]],
  ["/fonts/LICENSE.md", ["fonts/LICENSE.md", "text/plain; charset=utf-8"]],
  ["/kumi-logo.png", ["kumi-logo.png", "image/png"]],
  ["/kumi-mark.png", ["kumi-mark.png", "image/png"]],
  // Under /vendor/ for the reason the gateway puts it there: it is a minified
  // UMD build, and the checks that hold every first-party module to ES-module
  // rules skip this prefix. The licence travels with it — MIT requires that.
  ["/vendor/motion/motion.js", ["vendor/motion/motion.js", "text/javascript; charset=utf-8"]],
  ["/vendor/motion/LICENSE.md", ["vendor/motion/LICENSE.md", "text/plain; charset=utf-8"]],
]);

/**
 * Where the product itself lives.
 *
 * In production the dashboard is `/app` on this same origin — that is the
 * whole reason the site is served by the gateway rather than from a bucket:
 * the session cookie is `SameSite=Strict` and signing up is billing, so the
 * page selling the product posts to routes on its own origin.
 *
 * This repository holds the site portion and no dashboard, so `/app` here is
 * a hole. Sending it to the real deployment is closer to the truth than a
 * 404: the button does what the button says. Override for a preview that
 * should point at a staging deployment, or a local control plane.
 */
const APP_ORIGIN = process.env.KUMI_APP_ORIGIN ?? "https://kumi.up.railway.app";

const port = Number(process.env.PORT ?? 4173);
const host = process.env.HOST ?? "127.0.0.1";

function send(response, status, type, body) {
  const bytes = Buffer.isBuffer(body) ? body : Buffer.from(body, "utf8");
  response.writeHead(status, {
    "Content-Type": type,
    "Content-Length": String(bytes.length),
    // A preview is whatever the checkout holds right now.
    "Cache-Control": "no-store",
  });
  response.end(bytes);
}

/**
 * The address this request is really asking for.
 *
 * Two forgivenesses, both for muscle memory rather than for production
 * parity. A trailing slash is the same page — `/pricing/` is what a browser
 * produces when somebody edits the address bar. And `/pricing.html` is the
 * filename, which is what anybody who has previewed this folder with a plain
 * static server will type; it redirects rather than serving, so there is one
 * canonical address for each page and it is the one production uses.
 */
function resolveRoute(pathname) {
  if (pathname.length > 1 && pathname.endsWith("/")) {
    return { redirect: pathname.slice(0, -1) };
  }
  if (ROUTES.has(pathname)) {
    return { route: pathname };
  }
  if (pathname.endsWith(".html")) {
    const clean = pathname.slice(0, -".html".length);
    if (clean === "/index") {
      return { redirect: "/" };
    }
    if (ROUTES.has(clean)) {
      return { redirect: clean };
    }
  }
  return {};
}

const NOT_FOUND = `<!doctype html>
<meta charset="utf-8">
<title>Not here — Kumi</title>
<link rel="stylesheet" href="/site.css">
<div class="wrap" style="padding: 96px 0">
  <p class="eyebrow">404</p>
  <h1 style="font-size: 32px; letter-spacing: -0.02em">Nothing at this address.</h1>
  <p class="sub" style="margin-top: 16px">
    This repository is the marketing site. Everything under
    <code>/app</code> belongs to the deployment.
  </p>
  <p style="margin-top: 24px"><a class="btn btn-primary" href="/">Back to the site</a></p>
</div>
`;

const server = createServer((request, response) => {
  let pathname;
  try {
    pathname = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
  } catch {
    send(response, 400, "text/plain; charset=utf-8", "Bad request");
    return;
  }

  // The dashboard, and every deep link into it. Matched as a prefix because
  // the site links to `/app#signup` and `/app#signin`, and a fragment never
  // reaches a server — but a future `/app/whatever` would, and it belongs to
  // the deployment just as much.
  if (pathname === "/app" || pathname.startsWith("/app/")) {
    response.writeHead(302, { Location: new URL(pathname, APP_ORIGIN).toString() });
    response.end();
    return;
  }

  const resolved = resolveRoute(pathname);
  if (resolved.redirect !== undefined) {
    response.writeHead(301, { Location: resolved.redirect });
    response.end();
    return;
  }
  if (resolved.route === undefined) {
    send(response, 404, "text/html; charset=utf-8", NOT_FOUND);
    return;
  }

  const [file, type] = ROUTES.get(resolved.route);
  readFile(path.join(here, file))
    .then((bytes) => send(response, 200, type, bytes))
    .catch(() => {
      // A route with no file behind it is this table drifting from the folder,
      // which is worth saying out loud rather than reporting as a missing page.
      process.stderr.write(`route ${resolved.route} names a missing file: ${file}\n`);
      send(response, 500, "text/plain; charset=utf-8", `Missing ${file}`);
    });
});

server.listen(port, host, () => {
  process.stdout.write(`Kumi marketing site on http://${host}:${String(port)}\n`);
  process.stdout.write(`  /app redirects to ${APP_ORIGIN}\n`);
});
