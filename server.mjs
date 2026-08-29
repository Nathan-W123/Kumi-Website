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
import { fileURLToPath, pathToFileURL } from "node:url";

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
export const ROUTES = new Map([
  ["/", ["index.html", "text/html; charset=utf-8"]],
  ["/pricing", ["pricing.html", "text/html; charset=utf-8"]],
  ["/waitlist", ["waitlist.html", "text/html; charset=utf-8"]],
  ["/about", ["about.html", "text/html; charset=utf-8"]],
  ["/faq", ["faq.html", "text/html; charset=utf-8"]],
  ["/security", ["security.html", "text/html; charset=utf-8"]],
  ["/privacy", ["privacy.html", "text/html; charset=utf-8"]],
  ["/terms", ["terms.html", "text/html; charset=utf-8"]],
  ["/download", ["download.html", "text/html; charset=utf-8"]],
  ["/demo", ["demo.html", "text/html; charset=utf-8"]],
  ["/site.css", ["site.css", "text/css; charset=utf-8"]],
  ["/site.js", ["site.js", "text/javascript; charset=utf-8"]],
  ["/site-boot.js", ["site-boot.js", "text/javascript; charset=utf-8"]],
  ["/field.js", ["field.js", "text/javascript; charset=utf-8"]],
  ["/demo.css", ["demo.css", "text/css; charset=utf-8"]],
  ["/demo.js", ["demo.js", "text/javascript; charset=utf-8"]],
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
export const APP_ORIGIN = process.env.KUMI_APP_ORIGIN ?? "https://kumi.up.railway.app";

/**
 * The machinery behind "a confirmation from kumi.support is on its way".
 *
 * Both answers a visitor can see — the line site.js writes beside the button
 * and the page a scriptless submit navigates to — make that promise, and this
 * proxy is the one place every signup passes through, so this is where the
 * promise is kept. The mail goes out through Resend because Resend is one
 * HTTPS POST with a bearer key: the no-dependency rule that keeps this server
 * previewable holds, and `fetch` is already how the proxy talks upstream.
 *
 * Two things cannot live in this repository and must come from the
 * environment. The API key is a secret, so it rides in KUMI_RESEND_API_KEY
 * (or RESEND_API_KEY, the name the provider's own docs use); with neither
 * set, signups work exactly as before and each unsent confirmation is a
 * stderr line naming the missing key. And the sender only delivers once
 * kumi.support is verified with the provider — SPF and DKIM are DNS records,
 * not code — so until that is done the mail service refuses politely and the
 * refusal lands on stderr too.
 */
export const RESEND_ENDPOINT = "https://api.resend.com/emails";
export const RESEND_API_KEY =
  process.env.KUMI_RESEND_API_KEY ?? process.env.RESEND_API_KEY ?? "";
export const WAITLIST_FROM =
  process.env.KUMI_WAITLIST_FROM ?? "KUMI <hello@kumi.support>";

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

const WAITLIST_PATH = "/api/v1/waitlist";
const WAITLIST_BODY_LIMIT = 16 * 1024;

async function readRequestBody(request) {
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > WAITLIST_BODY_LIMIT) {
      throw new RangeError("waitlist request is too large");
    }
    chunks.push(chunk);
  }
  return Buffer.concat(chunks);
}

/**
 * The readable CSRF token in a Cookie header, if it carries one.
 *
 * Cookie names are deliberately matched by purpose. Kumi may add a
 * `__Host-` prefix without requiring every separately deployed copy of the
 * marketing site to change in lockstep.
 */
export function csrfTokenFromCookies(cookies = "") {
  for (const part of cookies.split(";")) {
    const separator = part.indexOf("=");
    if (separator === -1) {
      continue;
    }
    const name = part.slice(0, separator).trim();
    if (!/(?:^|[-_])(?:csrf|xsrf)(?:[-_]|$)/iu.test(name)) {
      continue;
    }
    const value = part.slice(separator + 1).trim();
    try {
      return decodeURIComponent(value);
    } catch {
      return value;
    }
  }
  return "";
}

/**
 * The headers a proxied submission carries to the gateway.
 *
 * The origin line is the whole reason this function exists to be tested. The
 * gateway guards its waitlist the way it guards every state-changing route:
 * the Origin header has to be one it recognises. A server-side fetch sends no
 * Origin header at all unless told to, so the proxy's forward arrived
 * origin-less and the gateway answered
 * {"error":{"code":"origin_rejected","message":"Request origin is not
 * allowed"}} — which a phone then displayed as the entire page. The one
 * origin the gateway is certain to allow is its own: the form began life
 * served by the gateway, same-origin, and worked. So the proxy names it
 * explicitly, and never repeats whatever origin the browser sent here — a
 * preview's address is not something the gateway can be expected to know.
 *
 * An existing session adds a second guard. Its readable CSRF cookie must be
 * echoed in a header, and both it and the session cookie must survive the
 * preview relay. Native forms cannot set that header, so the relay derives it
 * from the same cookie when site.js was unavailable. Cookies are forwarded
 * only when a CSRF token is present; unrelated preview cookies never travel
 * to the product deployment.
 */
export function waitlistUpstreamHeaders(incoming) {
  const headers = {
    "content-type": incoming["content-type"] ?? "application/octet-stream",
    accept: incoming.accept ?? "text/html",
    origin: new URL(APP_ORIGIN).origin,
  };
  const cookie = typeof incoming.cookie === "string" ? incoming.cookie : "";
  const cookieToken = csrfTokenFromCookies(cookie);
  const sentToken = incoming["x-csrf-token"];
  const token =
    typeof sentToken === "string" && sentToken !== ""
      ? sentToken
      : cookieToken;
  if (token !== "") {
    headers["x-csrf-token"] = token;
    if (cookieToken !== "") {
      headers.cookie = cookie;
    }
  }
  return headers;
}

/**
 * What a browser that navigated the form itself is shown when the gateway
 * says no.
 *
 * Without JavaScript — or before it, or after it failed to load — a submit is
 * a document navigation, and whatever comes back IS the page. The gateway
 * states its errors in JSON whatever the Accept header said, and that JSON,
 * relayed faithfully, rendered as the whole site on a phone. Refusing is
 * allowed; a screenful of raw JSON is not. Keep the gateway's words, say them
 * in the site's own voice, and offer the way back.
 */
export function waitlistFailurePage(bytes) {
  let reason = "The waitlist could not take the address just now.";
  try {
    const parsed = JSON.parse(bytes.toString("utf8"));
    const message =
      typeof parsed?.error === "string" ? parsed.error : parsed?.error?.message;
    if (typeof message === "string" && message.trim() !== "") {
      reason = message;
    }
  } catch {
    // Not JSON after all; the generic line above already covers it.
  }
  const safe = reason.replace(
    /[&<>"']/gu,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c],
  );
  return `<!doctype html>
<meta charset="utf-8">
<title>Waitlist — Kumi</title>
<link rel="stylesheet" href="/site.css">
<div class="wrap" style="padding: 96px 0">
  <p class="eyebrow">Waitlist</p>
  <h1 style="font-size: 32px; letter-spacing: -0.02em">That did not go through.</h1>
  <p class="sub" style="margin-top: 16px">${safe} Please go back and try again.</p>
  <p style="margin-top: 24px"><a class="btn btn-primary" href="/">Back to the site</a></p>
</div>
`;
}

/**
 * And what that browser is shown when the gateway says yes.
 *
 * The gateway answers acceptance in JSON too, so a submit that finally
 * worked would still have filled a phone's screen with {"added":true} — the
 * same photograph of raw JSON that got the refusal reported as a bug, now
 * standing for success. Same translation as the refusal, opposite mood.
 */
export function waitlistSuccessPage(bytes) {
  let already = false;
  try {
    already = JSON.parse(bytes.toString("utf8"))?.added === false;
  } catch {
    // Unreadable acceptance is still acceptance; say the ordinary thing.
  }
  // Same words as site.js writes beside the button, and the sender named for
  // the same reason: the confirmation comes from kumi.support, and mail from
  // a sender nobody was told to expect is mail that gets binned.
  const line = already
    ? "You are already on the list. A confirmation from kumi.support is on its way."
    : "You are on the list. A confirmation from kumi.support is on its way.";
  return `<!doctype html>
<meta charset="utf-8">
<title>Waitlist — Kumi</title>
<link rel="stylesheet" href="/site.css">
<div class="wrap" style="padding: 96px 0">
  <p class="eyebrow">Waitlist</p>
  <h1 style="font-size: 32px; letter-spacing: -0.02em">That went through.</h1>
  <p class="sub" style="margin-top: 16px">${line}</p>
  <p style="margin-top: 24px"><a class="btn btn-primary" href="/">Back to the site</a></p>
</div>
`;
}

/**
 * The address that signed up, read back out of the body that was forwarded.
 *
 * Two shapes reach the proxy: site.js gathers the form and posts JSON, and a
 * browser without JavaScript posts it urlencoded. The confirmation has to
 * find the address in both, because the promise is made to both. This is not
 * validation — the gateway has already accepted the address by the time this
 * runs — only recovery of the one field the mail needs, so anything
 * unreadable comes back as "" and the signup stands either way.
 */
export function waitlistAddressFromBody(body, contentType = "") {
  const text = body.toString("utf8");
  let value;
  if (contentType.includes("application/json")) {
    try {
      value = JSON.parse(text)?.email;
    } catch {
      return "";
    }
  } else {
    value = new URLSearchParams(text).get("email") ?? undefined;
  }
  if (typeof value !== "string") {
    return "";
  }
  const address = value.trim();
  return address.includes("@") ? address : "";
}

/**
 * The mail itself, in the site's own voice.
 *
 * Plain text on purpose: a first mail from a new domain is exactly the mail
 * spam filters weigh hardest, and text with no links to distrust is the
 * cheapest credibility there is. It opens with the same words the site
 * answered with, so the inbox confirms the screen. One mail for both moods —
 * new and already-waiting — because the pages promise the same confirmation
 * in both, and the gateway deliberately tells a visitor nothing more.
 */
export function confirmationEmail(address, from = WAITLIST_FROM) {
  return {
    from,
    to: [address],
    subject: "You are on the KUMI waitlist",
    text: `You are on the list.

This is the confirmation the site said to expect. We have this address,
and it is the one we will write to when KUMI opens up.

Nothing is needed from you until then. If you did not sign up, reply to
this mail and the address comes off the list.

— KUMI
The coordination layer between your agents and your codebase.
`,
  };
}

/**
 * Send the confirmation, and never let the sending matter to the signup.
 *
 * The mail is a consequence of joining the list, not a condition of it: a
 * missing key, an unverified domain, a mail service that is down — every one
 * of those is a stderr line and a false, never a throw, because the visitor
 * whose signup the gateway just accepted must not be told it failed over a
 * mail they have not missed yet. `deliver` exists so the tests can hold the
 * envelope without the network; production never passes it.
 */
export async function sendWaitlistConfirmation(address, options = {}) {
  const { key = RESEND_API_KEY, from = WAITLIST_FROM, deliver = fetch } = options;
  if (address === "") {
    process.stderr.write(
      "waitlist: a signup was accepted but no address could be read back to confirm it\n",
    );
    return false;
  }
  if (key === "") {
    process.stderr.write(
      "waitlist: confirmation not sent — set KUMI_RESEND_API_KEY to send them\n",
    );
    return false;
  }
  try {
    const reply = await deliver(RESEND_ENDPOINT, {
      method: "POST",
      headers: {
        authorization: `Bearer ${key}`,
        "content-type": "application/json",
      },
      body: JSON.stringify(confirmationEmail(address, from)),
    });
    if (!reply.ok) {
      const said =
        typeof reply.text === "function" ? await reply.text().catch(() => "") : "";
      process.stderr.write(
        `waitlist: the mail service refused a confirmation (${String(reply.status)}): ${said.slice(0, 200)}\n`,
      );
      return false;
    }
    return true;
  } catch (error) {
    process.stderr.write(
      `waitlist: a confirmation did not go out: ${error instanceof Error ? error.message : String(error)}\n`,
    );
    return false;
  }
}

/**
 * Keep the marketing origin as the form's front door while the deployment
 * remains the system that owns the waitlist. This also preserves the plain
 * HTML response for a browser without JavaScript and the JSON response used
 * by site.js to keep somebody on the page.
 */
async function proxyWaitlist(request, response) {
  let body;
  try {
    body = await readRequestBody(request);
  } catch (error) {
    if (error instanceof RangeError) {
      send(response, 413, "text/plain; charset=utf-8", "Request too large");
      return;
    }
    send(response, 400, "text/plain; charset=utf-8", "Bad request");
    return;
  }

  const wantsJson = request.headers.accept?.includes("application/json") === true;
  try {
    const reply = await fetch(new URL(WAITLIST_PATH, APP_ORIGIN), {
      method: "POST",
      headers: waitlistUpstreamHeaders(request.headers),
      body,
      redirect: "manual",
    });
    const bytes = Buffer.from(await reply.arrayBuffer());
    const type = reply.headers.get("content-type") ?? "application/octet-stream";
    if (reply.ok) {
      // The gateway took the address, so the promised mail leaves now.
      // Deliberately not awaited: the visitor's answer must never wait on a
      // mail API, and sendWaitlistConfirmation already turns every failure
      // into a stderr line rather than a rejection.
      void sendWaitlistConfirmation(
        waitlistAddressFromBody(body, request.headers["content-type"] ?? ""),
      );
    }
    // A document navigation shows whatever comes back AS the page, and the
    // gateway speaks JSON in both moods. Translate both, not just the
    // refusal: {"added":true} filling a phone's screen reads as a bug too.
    if (!wantsJson && type.includes("application/json")) {
      const page = reply.ok ? waitlistSuccessPage(bytes) : waitlistFailurePage(bytes);
      send(response, reply.status, "text/html; charset=utf-8", page);
      return;
    }
    send(response, reply.status, type, bytes);
  } catch {
    send(
      response,
      502,
      wantsJson ? "application/json; charset=utf-8" : "text/plain; charset=utf-8",
      wantsJson
        ? JSON.stringify({ error: "The waitlist service is unavailable." })
        : "The waitlist service is unavailable. Please try again.",
    );
  }
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

const server = createServer(async (request, response) => {
  let pathname;
  try {
    pathname = new URL(request.url ?? "/", `http://${host}:${port}`).pathname;
  } catch {
    send(response, 400, "text/plain; charset=utf-8", "Bad request");
    return;
  }

  if (pathname === WAITLIST_PATH) {
    if (request.method !== "POST") {
      response.setHeader("Allow", "POST");
      send(response, 405, "text/plain; charset=utf-8", "Method not allowed");
      return;
    }
    await proxyWaitlist(request, response);
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

/*
 * Only listen when this file is what was run.
 *
 * `site.test.mjs` imports `ROUTES` so the guards check the table production
 * routes from rather than a copy of it that could drift; importing a module
 * that binds a port as a side effect would make the suite fail on any machine
 * already using 4173, and fail confusingly.
 */
if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  server.listen(port, host, () => {
    process.stdout.write(`Kumi marketing site on http://${host}:${String(port)}\n`);
    process.stdout.write(`  /app redirects to ${APP_ORIGIN}\n`);
    // Said at boot, not discovered from a silent inbox: the pages promise
    // this mail, so whether it can actually leave is part of "up".
    process.stdout.write(
      RESEND_API_KEY === ""
        ? "  waitlist confirmations OFF — set KUMI_RESEND_API_KEY to send them\n"
        : `  waitlist confirmations go out from ${WAITLIST_FROM}\n`,
    );
  });
}
