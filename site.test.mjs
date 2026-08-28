/**
 * The guards that came with the site when it left the product monorepo.
 *
 * Everything here used to live in `apps/web/src/assets.test.ts`,
 * `apps/web/src/download-links.test.ts` and `scripts/check-public-syntax.mjs`.
 * Those files stayed behind with the product; the invariants they held are
 * about the seven pages, four scripts and one stylesheet in this folder, so
 * they travelled.
 *
 * Nothing in this repository compiles, bundles, typechecks or lints what it
 * ships. The files are served to a browser exactly as they sit on disk. That
 * is the whole reason this file exists: every failure below is one a build
 * cannot catch and a reader will not notice, because each of them looks fine
 * — a page that renders in the wrong font, a rule silently deleted, a link
 * that 404s, a page that stays blank. Each test says which regression it is
 * standing in front of.
 *
 * Dependency-free on purpose, like the server: `node:test` and
 * `node:assert/strict` ship with the Node this package already requires.
 */

import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import {
  copyFileSync,
  mkdtempSync,
  readFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { fileURLToPath } from "node:url";

import {
  APP_ORIGIN,
  ROUTES,
  csrfTokenFromCookies,
  waitlistFailurePage,
  waitlistSuccessPage,
  waitlistUpstreamHeaders,
} from "./server.mjs";

const here = path.dirname(fileURLToPath(import.meta.url));

function read(file) {
  return readFileSync(path.join(here, file), "utf8");
}

function bytes(file) {
  return readFileSync(path.join(here, file));
}

/** Every address in the routing table whose file is an HTML page. */
function pages() {
  return [...ROUTES.entries()]
    .filter(([, [file]]) => file.endsWith(".html"))
    .map(([address, [file]]) => ({ address, file }));
}

/**
 * Every browser module in the folder, whatever the routing table says.
 *
 * Read off disk rather than off `ROUTES` so a script that was added and never
 * routed still gets parsed — an unrouted script is a separate failure, caught
 * below, and it should not also cost us the parse.
 */
function modules() {
  const found = readdirSync(here)
    .filter((name) => name.endsWith(".js"))
    .map((name) => name);
  for (const name of readdirSync(path.join(here, "vendor", "motion"))) {
    if (name.endsWith(".js")) {
      found.push(`vendor/motion/${name}`);
    }
  }
  return found.sort();
}

/** Every stylesheet served. There is one; the walk is so a second is caught. */
function stylesheets() {
  return readdirSync(here).filter((name) => name.endsWith(".css")).sort();
}

/* ------------------------------------------- addresses and what is behind -- */

test("the marketing site is served at its own addresses", () => {
  /*
   * `ROUTES` in server.mjs is this repository's copy of the gateway's
   * `SITE_FILES`. It is an allowlist, so the two ways it can be wrong are the
   * two ways an allowlist is always wrong: a route naming a file that is not
   * there, and a file that is there with no route naming it.
   *
   * The first produces a 500 with a line in the server's log nobody is
   * reading. The second is worse and quieter — a page added to the folder
   * without a line added here renders perfectly when you open the file and
   * 404s at the address the nav links to, which is the address everybody
   * except the author uses.
   */
  for (const [address, [file, type]] of ROUTES) {
    assert.doesNotThrow(
      () => bytes(file),
      `${address} routes to ${file}, which is not in this folder`,
    );
    // The Content-Type is what makes the bytes a page rather than a download.
    // A stylesheet served as text/plain is ignored by every browser without
    // saying so, which looks exactly like a stylesheet that failed to load.
    const expected = {
      ".html": "text/html; charset=utf-8",
      ".css": "text/css; charset=utf-8",
      ".js": "text/javascript; charset=utf-8",
      ".woff2": "font/woff2",
      ".png": "image/png",
      ".md": "text/plain; charset=utf-8",
    }[path.extname(file)];
    assert.equal(type, expected, `${address} (${file}) is served as ${type}`);
  }

  // The other direction. Every page, script and stylesheet at the root has to
  // be reachable at some address, or it is a file nobody can see.
  const routed = new Set([...ROUTES.values()].map(([file]) => file));
  const servable = readdirSync(here).filter((name) =>
    /\.(?:html|js|css)$/u.test(name),
  );
  const unrouted = servable.filter(
    (name) => !routed.has(name) && name !== "server.mjs" && name !== "site.test.mjs",
  );
  assert.deepEqual(
    unrouted,
    [],
    `these ship in the folder but have no address, so they 404: ${unrouted.join(", ")}`,
  );

  /*
   * And no address is declared twice.
   *
   * `ROUTES` is a `Map` built from an array literal, so a duplicated key does
   * not throw — the last one silently wins and the earlier line is dead text
   * that reads as though it were in force. The gateway throws on a shadowed
   * key when it builds its asset map; a Map literal cannot, so the table is
   * counted against its own source instead.
   */
  const source = read("server.mjs");
  const block = source.slice(
    source.indexOf("export const ROUTES"),
    source.indexOf("]);", source.indexOf("export const ROUTES")),
  );
  const declared = [...block.matchAll(/^\s*\["(\/[^"]*)",/gmu)].map((m) => m[1]);
  assert.equal(
    declared.length,
    ROUTES.size,
    `${String(declared.length)} routes are written but only ${String(ROUTES.size)} survive: ` +
      `${declared.filter((a, i) => declared.indexOf(a) !== i).join(", ")} declared twice`,
  );
});

test("the vendored notices are served beside the code they cover", () => {
  // MIT and the OFL both require the notice to travel with the files. It is
  // served from this origin for the same reason the fonts are: a licence
  // linked to somebody else's host is a licence that stops shipping the day
  // that host changes its mind.
  const motion = read("vendor/motion/LICENSE.md");
  assert.match(motion, /The MIT License/u);
  assert.match(motion, /Motion\]\(https:\/\/motion\.dev\) B\.V\./u);
  const fonts = read("fonts/LICENSE.md");
  assert.match(fonts, /SIL Open Font License/u);
});

test("the front page is the marketing page", () => {
  // Trivial until the day the folder holds two things that could answer "/".
  // In the monorepo this half of the test was the one that caught the
  // dashboard document being served at the origin root instead of the site.
  assert.match(read("index.html"), /coordination layer/iu);
});

test("the front-page waitlist starts and finishes in place", () => {
  const page = read("index.html");
  const hero = page.slice(
    page.indexOf('<header class="hero">'),
    page.indexOf("</header>"),
  );

  assert.doesNotMatch(hero, /Why KUMI\?/u);
  assert.doesNotMatch(hero, /href="waitlist"/u);
  // Relative, like every other reference in these pages. Root-absolute, the
  // post escapes the preview proxy's path prefix and lands on the
  // deployment's own /api/v1/waitlist — which has never heard of the
  // preview and answers a phone with a page of origin_rejected JSON. The
  // proxy in server.mjs only helps if the post actually reaches it.
  assert.match(hero, /<form[\s\S]*action="api\/v1\/waitlist"/u);
  assert.doesNotMatch(hero, /action="\/api\/v1\/waitlist"/u);
  assert.match(hero, /<input[\s\S]*name="email"[\s\S]*type="email"[\s\S]*required/u);
  assert.match(hero, /<button[^>]*type="submit">Join the waitlist<\/button>/u);

  const script = read("site.js");
  assert.match(script, /fetch\(form\.action,/u);
  assert.match(script, /event\.preventDefault\(\)/u);
  assert.match(script, /headers\["x-csrf-token"\] = token/u);
  assert.match(script, /credentials: "same-origin"/u);
  assert.doesNotMatch(
    script,
    /^import .*\.\/field\.js/mu,
    "the waitlist must not wait for the optional WebGL module to load",
  );
  assert.ok(
    script.indexOf('mark("waitlist")') < script.indexOf('import("./field.js")'),
    "the waitlist must be wired before the optional WebGL module is loaded",
  );

  const server = read("server.mjs");
  assert.match(server, /pathname === WAITLIST_PATH/u);
  assert.match(server, /new URL\(WAITLIST_PATH, APP_ORIGIN\)/u);
});

test("the proxied waitlist submission carries an origin the gateway allows", () => {
  /*
   * The rejection that reached a phone as a page of JSON — twice. The gateway
   * guards its waitlist with an origin check, and a server-side fetch sends
   * no Origin header at all unless told to, so the proxy's forward arrived
   * origin-less and the gateway answered
   * {"error":{"code":"origin_rejected","message":"Request origin is not
   * allowed"}}. The one origin the gateway is certain to accept is its own —
   * the form began life served by the gateway, same-origin, and worked — so
   * every forward has to say it explicitly.
   */
  const sent = waitlistUpstreamHeaders({
    "content-type": "application/json",
    accept: "application/json",
  });
  assert.equal(sent.origin, new URL(APP_ORIGIN).origin);
  // An origin, not an address: scheme and host only, nothing after the host.
  assert.match(sent.origin, /^https?:\/\/[^/]+$/u);
  // What the browser asked for still travels.
  assert.equal(sent["content-type"], "application/json");
  assert.equal(sent.accept, "application/json");

  // A browser posting the form natively sends its own Origin — the preview's
  // address, which the gateway has never heard of. The proxy must not repeat
  // it upstream.
  const forwarded = waitlistUpstreamHeaders({
    origin: "https://preview.example.test",
  });
  assert.equal(forwarded.origin, new URL(APP_ORIGIN).origin);
  // And a submission with no stated wants still reads as the plain form post
  // it is.
  assert.equal(forwarded.accept, "text/html");
});

test("the waitlist preserves an existing session's CSRF pair", () => {
  const cookie =
    "theme=dark; __Host-kumi-session=session-secret; " +
    "__Host-kumi-csrf=token%2Fwith%2Bencoding";
  assert.equal(csrfTokenFromCookies(cookie), "token/with+encoding");

  // JavaScript echoes the token itself. The relay still carries the cookies
  // because the gateway needs the session and readable cookie as well as the
  // header in order to validate the pair.
  const scripted = waitlistUpstreamHeaders({
    cookie,
    "x-csrf-token": "token/with+encoding",
  });
  assert.equal(scripted.cookie, cookie);
  assert.equal(scripted["x-csrf-token"], "token/with+encoding");

  // A native form cannot author a custom header. The relay reads the same
  // token from its cookie, so the no-JavaScript path remains functional too.
  const native = waitlistUpstreamHeaders({ cookie });
  assert.equal(native.cookie, cookie);
  assert.equal(native["x-csrf-token"], "token/with+encoding");

  // No CSRF cookie means an anonymous waitlist submission. Do not send
  // unrelated cookies from the preview to a different deployment.
  const anonymous = waitlistUpstreamHeaders({ cookie: "preview_session=not-for-kumi" });
  assert.equal(anonymous.cookie, undefined);
  assert.equal(anonymous["x-csrf-token"], undefined);
});

test("a navigated waitlist refusal is a page, not a screenful of JSON", () => {
  /*
   * Without JavaScript — or before it, or on the phone where it never ran —
   * a submit is a document navigation and the response IS the page. The
   * gateway states its errors in JSON whatever the Accept header said, and
   * that JSON, relayed faithfully, rendered as the entire site. The proxy
   * translates: the gateway's words, the site's voice, a way back.
   */
  const refusal = waitlistFailurePage(
    Buffer.from(
      JSON.stringify({
        error: { code: "origin_rejected", message: "Request origin is not allowed" },
      }),
    ),
  );
  assert.match(refusal, /<!doctype html>/u);
  assert.match(refusal, /Request origin is not allowed/u);
  assert.match(refusal, /href="\/"/u, "the way back to the site");

  // The gateway's words are quoted, never interpreted as markup.
  const hostile = waitlistFailurePage(
    Buffer.from(JSON.stringify({ error: { message: "<script>alert(1)</script>" } })),
  );
  assert.doesNotMatch(hostile, /<script>/u);

  // A body that is not JSON at all still comes out as a legible page.
  assert.match(waitlistFailurePage(Buffer.from("upstream fell over")), /<!doctype html>/u);
});

test("a navigated waitlist acceptance is a page too", () => {
  /*
   * The gateway answers yes in JSON as well, so the submit that finally
   * worked would have filled the same phone's screen with {"added":true} —
   * indistinguishable, to anyone not reading the braces, from the bug they
   * reported three times. Success gets the same translation as refusal.
   */
  const first = waitlistSuccessPage(Buffer.from(JSON.stringify({ added: true })));
  assert.match(first, /<!doctype html>/u);
  assert.match(first, /You are on the list\./u);
  assert.match(first, /href="\/"/u, "the way back to the site");

  // The endpoint says added:false for an address it already holds, and the
  // page says the same thing site.js says in place: no error, no drama.
  const again = waitlistSuccessPage(Buffer.from(JSON.stringify({ added: false })));
  assert.match(again, /You are already on the list\./u);

  // An acceptance whose body cannot be read is still an acceptance.
  assert.match(waitlistSuccessPage(Buffer.from("ok")), /You are on the list\./u);
});

test("every signup confirmation names kumi.support as the sender", () => {
  /*
   * The confirmation mail comes from kumi.support, and mail from a sender
   * nobody was told to expect is mail that gets binned — or distrusted as
   * phishing and reported. So the moment a signup goes through, the site says
   * who will write. That promise is made in two files that get edited apart:
   * the in-place answer site.js writes beside the button, and the page
   * server.mjs shows a browser that navigated the form without JavaScript.
   * Pinned in both, so a rewrite of one cannot quietly orphan the other.
   */
  const sender = /A confirmation from kumi\.support is on its way\./u;
  assert.match(read("site.js"), sender, "the in-place answer must name the sender");
  assert.match(
    waitlistSuccessPage(Buffer.from(JSON.stringify({ added: true }))),
    sender,
    "the navigated acceptance page must name the sender",
  );
  // An address already on the list gets the same sender to watch for — the
  // page already distinguishes "already", and that is all it distinguishes.
  assert.match(
    waitlistSuccessPage(Buffer.from(JSON.stringify({ added: false }))),
    sender,
    "the already-on-the-list page must name the sender too",
  );
  // The refusal pages stay sender-free on purpose: kumi.support confirms
  // signups that worked, and a failure page pointing at it would send
  // somebody to ask a mailbox about an address it never received.
  assert.doesNotMatch(
    waitlistFailurePage(Buffer.from(JSON.stringify({ error: "No." }))),
    /kumi\.support/u,
  );
});

test("no marketing address is cached beyond the checkout that served it", () => {
  /*
   * The monorepo's version of this asserted that no marketing key was marked
   * `immutable` — that is reserved for names carrying their own digest, and a
   * marketing page is edited by a human on a Tuesday.
   *
   * There is no digest machinery here, so the invariant is stated against
   * what the server actually sends: `no-store`, and nothing that would let a
   * proxy or a browser hold a page past an edit. A preview showing yesterday's
   * copy of the page you just changed is the failure this prevents, and it is
   * indistinguishable from the change not having worked.
   */
  const source = read("server.mjs");
  assert.match(source, /"Cache-Control": "no-store"/u);
  assert.doesNotMatch(source, /immutable/u);
  assert.doesNotMatch(source, /max-age/u);
});

/* ------------------------------------------------- the files parse at all -- */

test("every browser module parses before it is served", () => {
  /*
   * Nothing compiles, bundles or lints these files. A syntax error therefore
   * passes every check in this repository and fails only in a browser, where
   * one bad file takes down every module that imports it and the page renders
   * blank. A duplicate `export function` did exactly that.
   *
   * `node --check` parses without executing, which is all that is wanted: the
   * failure being caught is "this file cannot be read", not "this file
   * misbehaves".
   *
   * The copy to a `.mjs` name is not housekeeping. `--check` picks
   * module-vs-script from the extension, and these are ES modules living
   * under `.js` — site.js imports from field.js at the top level. Checking
   * the `.js` path directly fails with "Cannot use import statement outside a
   * module" on Node 20, which is this package's declared floor, so the copy
   * is what keeps the guard honest rather than merely passing on whatever
   * Node the author happens to run.
   *
   * The vendored Motion bundle is included on purpose: it is served to
   * browsers like everything else, and it parses cleanly as a module even
   * though it runs as a classic script.
   */
  const scratch = mkdtempSync(path.join(tmpdir(), "kumi-site-syntax-"));
  const failures = [];
  try {
    const found = modules();
    assert.ok(found.length >= 4, `expected the site's scripts, saw ${found.join(", ")}`);
    for (const file of found) {
      const copy = path.join(scratch, `${file.replaceAll("/", "__").slice(0, -3)}.mjs`);
      copyFileSync(path.join(here, file), copy);
      try {
        execFileSync(process.execPath, ["--check", copy], { stdio: "pipe" });
      } catch (error) {
        failures.push(
          `${file}: ${String(error.stderr ?? error.message)
            .split("\n")
            .filter((line) => line.trim().length > 0)
            .slice(0, 3)
            .join(" | ")}`,
        );
      }
    }
  } finally {
    rmSync(scratch, { recursive: true, force: true });
  }
  assert.deepEqual(failures, [], `browser modules that do not parse:\n  ${failures.join("\n  ")}`);
});

test("no backtick sits unescaped inside an HTML comment", () => {
  /*
   * Parsing cannot catch this, which is why it gets its own pass.
   *
   * A backtick inside an HTML comment inside a template literal closes the
   * template string, and the CSS selector the comment was quoting is then read
   * as code: `<!-- see \`.chan-sidebar\` -->` becomes a property read named
   * `chan`, a subtraction, and a bare identifier `sidebar`. That is perfectly
   * valid JavaScript, so `--check` above is happy, and the screen throws
   * `ReferenceError: sidebar is not defined` the moment it renders. It shipped
   * twice before anybody saw it.
   *
   * Deliberately a line heuristic rather than a parser: it flags any backtick
   * between `<!--` and `-->` that is not backslash-escaped. Escaping is the
   * fix when the selector is worth quoting; ordinary quotes when it is not.
   * The line carrying `<!--` is itself tested, and an unterminated comment
   * leaves the flag set, so every backtick after it is reported — both are
   * wanted, because both describe a file that is already wrong.
   */
  const hits = [];
  for (const file of modules()) {
    let open = false;
    read(file)
      .split(/\r?\n/u)
      .forEach((line, index) => {
        if (line.includes("<!--")) {
          open = true;
        }
        if (open && /(^|[^\\])`/u.test(line)) {
          hits.push(`${file}:${String(index + 1)}: ${line.trim()}`);
        }
        if (open && line.includes("-->")) {
          open = false;
        }
      });
  }
  assert.deepEqual(
    hits,
    [],
    `an unescaped backtick inside an HTML comment closes the surrounding ` +
      `template literal and the rest parses as code:\n  ${hits.join("\n  ")}`,
  );
});

test("every stylesheet's braces balance", () => {
  /*
   * The quietest failure in the repository.
   *
   * A stray `}` at the top level is not an error a browser reports. The
   * parser treats it as the start of a bad rule, swallows everything up to and
   * including the NEXT block, and carries on. One extra brace therefore
   * deletes exactly one innocent rule, somewhere below where it was typed,
   * with no warning anywhere.
   *
   * That is not hypothetical. An edit that removed a component left its
   * closing brace behind, which ate `.belt-defs { position: absolute; width: 0 }`
   * — the rule that folds the symbol defs out of the layout. The defs SVG fell
   * back to its intrinsic 300x150 and a 198px hole opened in the middle of a
   * section. Everything still worked; it just looked wrong, and nothing but
   * measuring the page could say why.
   *
   * Comments are blanked line-for-line so the reported line number is the real
   * one, and quoted strings are blanked so a brace inside `content:` cannot
   * count.
   */
  const failures = [];
  const sheets = stylesheets();
  assert.ok(sheets.length > 0, "no stylesheet found to check");
  for (const file of sheets) {
    const source = read(file)
      .replaceAll(/\/\*[\s\S]*?\*\//gu, (block) =>
        "\n".repeat((block.match(/\n/gu) ?? []).length),
      )
      .replaceAll(/"(?:[^"\\\n]|\\.)*"|'(?:[^'\\\n]|\\.)*'/gu, '""');
    let depth = 0;
    let line = 1;
    const opened = [];
    for (const character of source) {
      if (character === "\n") {
        line += 1;
      } else if (character === "{") {
        depth += 1;
        opened.push(line);
      } else if (character === "}") {
        depth -= 1;
        if (depth < 0) {
          failures.push(
            `${file}:${String(line)}: a closing brace with nothing open — ` +
              `this silently deletes the next rule`,
          );
          // Reset rather than cascade: one stray brace should report once.
          depth = 0;
        } else {
          opened.pop();
        }
      }
    }
    for (const at of opened) {
      failures.push(`${file}:${String(at)}: this block is never closed`);
    }
  }
  assert.deepEqual(
    failures,
    [],
    `stylesheets that do not balance:\n  ${failures.join("\n  ")}`,
  );
});

/* ------------------------------------------------------- the boot forward -- */

test("the front page forwards legacy deep links to /app", () => {
  /*
   * Mailed links predate the move of the dashboard to /app — claim links,
   * password resets, the trial-warning mail's settings pointer, the billing
   * returns handed to Stripe — and inboxes cannot be re-sent. The front page
   * therefore forwards any hash that names a dashboard screen, before paint,
   * with the fragment intact.
   *
   * It still matters here, where there is no dashboard: server.mjs sends /app
   * to the deployment, so a dropped forward still breaks a real link somebody
   * was mailed. The gateway's CSP forbids inline scripts, so the forwarder is
   * an external script in <head>, parser-blocking on purpose — inlining it
   * would be silently refused in production and work perfectly here.
   */
  const html = read("index.html");
  const headEnd = html.indexOf("</head>");
  assert.ok(headEnd > 0);
  assert.match(html.slice(0, headEnd), /<script src="site-boot\.js"><\/script>/u);

  const boot = read("site-boot.js");
  assert.match(boot, /window\.location\.replace\("\/app" \+ hash\)/u);
  // An allowlist, not "any hash": the page's own anchors must keep scrolling.
  for (const screen of [
    "signin",
    "register",
    "signup",
    "welcome",
    "setup",
    "forgot",
    "reset",
    "billing",
    "billing-done",
    "billing-cancelled",
    "settings",
  ]) {
    assert.match(boot, new RegExp(`"${screen}"`, "u"), `${screen} should forward`);
  }
  // Installed desktop shells load the bare origin forever; the preload's
  // KUMI_SERVER global is the tell that sends them on to the dashboard.
  assert.match(boot, /window\.KUMI_SERVER/u);
});

test("the site forwards only from the origin's front door", () => {
  /*
   * Each forward rescues somebody who asked for "/" — a mailed dashboard
   * link, a desktop shell built before the move, a PWA whose cached start_url
   * still says "/". Served through a preview proxy instead, the standalone
   * tell fires for any reader who has Kumi installed, and the preview replaces
   * itself with the real dashboard: the play button appears to start the
   * product rather than show the page.
   *
   * Containment, not "declared above". This used to compare each forward's
   * offset against the offset of the line that COMPUTES the guard, which is a
   * proxy that the real regression walks straight past: a forward lifted out
   * of the block — "a desktop shell should always go to the dashboard" — still
   * sits below `var atFrontDoor = ...` and satisfied the old check while
   * firing on every path, preview proxy included. So the block itself is
   * measured: find where the guard opens, brace-match to where it closes, and
   * require every forward to lie between them.
   *
   * Comments are blanked to the same length first, so a brace inside prose
   * cannot move the closing offset, and every index still lines up with the
   * file as written.
   */
  const boot = read("site-boot.js");
  assert.match(boot, /var atFrontDoor = window\.location\.pathname === "\/";/u);

  const scannable = boot
    .replaceAll(/\/\*[\s\S]*?\*\//gu, (block) =>
      block.replaceAll(/[^\n]/gu, " "),
    )
    .replaceAll(/\/\/[^\n]*/gu, (line) => " ".repeat(line.length));

  const opens = scannable.indexOf("if (atFrontDoor) {");
  assert.ok(opens > 0, "no `if (atFrontDoor)` block guards the forwards");
  let depth = 0;
  let closes = -1;
  for (let at = scannable.indexOf("{", opens); at < scannable.length; at += 1) {
    if (scannable[at] === "{") {
      depth += 1;
    } else if (scannable[at] === "}") {
      depth -= 1;
      if (depth === 0) {
        closes = at;
        break;
      }
    }
  }
  assert.ok(closes > opens, "the front-door block is never closed");

  const forwards = [...scannable.matchAll(/location\.replace\("\/app"/gu)];
  assert.ok(forwards.length > 0, "the boot script forwards nowhere");
  for (const forward of forwards) {
    const at = forward.index ?? 0;
    assert.ok(
      at > opens && at < closes,
      `a forward to /app at offset ${String(at)} sits outside the front-door ` +
        `guard (which runs ${String(opens)}–${String(closes)}), so it fires ` +
        `for readers who are not at the origin root`,
    );
  }
});

/* ------------------------------------------------------------ the motion -- */

test("only the module that animates may hide anything", () => {
  /*
   * The page went blank twice, both times the same way: the boot script armed
   * the `anim` class that hides the hero and every reveal, on the promise that
   * site.js would play them in — and a 404 anywhere in site.js's module graph
   * silently broke that promise, leaving a page where nothing had loaded to
   * show what nothing would ever reveal.
   *
   * The invariant that closed it: the file that hides content is the file that
   * animates it. Only site.js adds the class, and only after its reduced-motion
   * and library gates pass. A stale checkout, a missing file, a parse error —
   * any of them now cost the animations and never the content.
   *
   * This is the guard most worth having in this repository rather than the
   * monorepo. It ships to a static host, where a missing file is likelier.
   */
  for (const file of modules()) {
    if (file === "site.js") {
      continue;
    }
    assert.doesNotMatch(
      read(file),
      /classList\.add\("anim"\)|classList\.add\('anim'\)|className \+= " anim"/u,
      `${file} arms the class that hides content, and it is not the file that reveals it`,
    );
  }
  // And no page may ship the class already on, which would hide everything
  // before a single script had a chance to run.
  for (const { file } of pages()) {
    assert.doesNotMatch(
      read(file),
      /<html[^>]*\bclass="[^"]*\banim\b/u,
      `${file} hides its own content in markup, before any script can reveal it`,
    );
  }

  const site = read("site.js");
  assert.match(site, /classList\.add\("anim"\)/u);
  // Armed only after the gate: the add sits inside the else of the
  // reduced-motion/missing-library check, textually after the disarm path.
  assert.ok(
    site.indexOf('classList.add("anim")') > site.indexOf('classList.remove("anim")'),
    "the arming must come after the gate that would refuse it",
  );
});

test("motion is an enhancement behind the reduced-motion gate", () => {
  const site = read("site.js");
  const css = read("site.css");

  // The class that arms hidden reveal states exists only when JavaScript ran
  // AND motion is welcome — so no-JS visitors and reduced-motion visitors
  // never have content hidden from them.
  assert.match(site, /matchMedia\("\(prefers-reduced-motion: reduce\)"\)/u);
  // And the module strips the class rather than animating when the gate is
  // closed or the vendored library failed to load.
  assert.match(site, /classList\.remove\("anim"\)/u);

  // Hidden starting states are all scoped to the armed class. The negative
  // lookbehind is the load-bearing half: an unqualified `.reveal { }` rule
  // hides content for everybody, including the visitor who will never see it
  // revealed.
  assert.match(css, /html\.anim \.reveal \{/u);
  assert.doesNotMatch(css, /(?<!html\.anim )\.reveal \{/u);

  /*
   * Every CSS-only animation is declared inside the motion gate.
   *
   * This used to look for a single `animation: none` inside the reduce block,
   * which one opt-out anywhere in the file satisfied — it could not have
   * caught an ungated animation added next to it, and a marketing page shipped
   * with exactly that. The rule is stated the other way round now: an
   * animation is only ever declared under `no-preference`, so a reader who
   * asked for stillness never has one to turn off. Checked exhaustively,
   * because the point is that there is no exception rather than that there is
   * an example.
   */
  const openBlocks = [];
  const ungated = [];
  let prelude = "";
  let line = 1;
  const consider = (text) => {
    const declaration = text.trim();
    // `animation: none` disables rather than animates, so it is allowed
    // anywhere — it is how a stray element is unrendered.
    if (
      /^animation(-name)?\s*:/u.test(declaration) &&
      !/:\s*none/u.test(declaration) &&
      !openBlocks.some((block) => block.includes("no-preference"))
    ) {
      ungated.push(`${String(line)}: ${declaration}`);
    }
  };
  for (const character of css.replaceAll(/\/\*[\s\S]*?\*\//gu, " ")) {
    if (character === "\n") {
      line += 1;
      prelude += " ";
    } else if (character === "{") {
      openBlocks.push(prelude.trim());
      prelude = "";
    } else if (character === "}") {
      // The last declaration in a block may drop its semicolon — valid CSS,
      // and what most formatters and every minifier emit. Reading it only at
      // `;` let an ungated `animation:` written last in its rule through
      // untouched, which is the same rule with a character removed. Weighed
      // while the block is still open, so the enclosing `@media` still counts.
      consider(prelude);
      openBlocks.pop();
      prelude = "";
    } else if (character === ";") {
      consider(prelude);
      prelude = "";
    } else {
      prelude += character;
    }
  }
  assert.deepEqual(
    ungated,
    [],
    `site.css animates outside the reduced-motion gate:\n  ${ungated.join("\n  ")}`,
  );

  /*
   * And every page loads the gate, the library and the module, in that order.
   *
   * Driven off the routing table rather than a hand-kept list, because the
   * regression this catches is a NEW page — one written by copying an old one
   * and losing a tag, or written fresh with an animation and no gate above it.
   * A hardcoded pair of filenames is exactly the check that would not have
   * looked at it.
   */
  for (const { file } of pages()) {
    const html = read(file);
    assert.match(html, /<script src="site-boot\.js"><\/script>/u, `${file} skips the boot script`);
    assert.match(
      html,
      /<script src="vendor\/motion\/motion\.js"><\/script>/u,
      `${file} skips the motion library`,
    );
    assert.match(
      html,
      /<script type="module" src="site\.js"><\/script>/u,
      `${file} skips the module that reveals its content`,
    );
    const order = [
      html.indexOf('<script src="site-boot.js"></script>'),
      html.indexOf('<script src="vendor/motion/motion.js"></script>'),
      html.indexOf('<script type="module" src="site.js"></script>'),
    ];
    assert.deepEqual(
      order,
      [...order].sort((a, b) => a - b),
      `${file} loads boot, library and module out of order`,
    );
  }
});

/* --------------------------------------------------------- what it fetches -- */

test("the type is served from this origin, not asked for", () => {
  /*
   * The deployment sends `font-src 'self'`.
   *
   * A Google Fonts link is not refused loudly under that policy — the request
   * is blocked, the @font-face never resolves, and the page renders in
   * whatever sans the visitor's system happens to have. Which looks fine on
   * the machine that built it, because that machine has the font installed.
   *
   * So the faces ship. Three of them, and the stylesheet reaches them by a
   * relative URL for the same reason every page reference is relative: a
   * stylesheet served through the preview proxy resolves `url()` against
   * itself, and `/fonts/...` would fetch the deployment's copy instead.
   */
  for (const face of ["bricolage-grotesque", "inter", "jetbrains-mono"]) {
    const address = `/fonts/${face}.woff2`;
    const route = ROUTES.get(address);
    assert.ok(route, `${face} has no address`);
    assert.equal(route[1], "font/woff2", `${face} should be served as a font`);
    const body = bytes(route[0]);
    // woff2's magic number, so a truncated or wrong-format file fails here
    // rather than silently in a browser.
    assert.equal(
      body.subarray(0, 4).toString("latin1"),
      "wOF2",
      `${face} is not a woff2 file`,
    );
  }

  const css = read("site.css");
  assert.doesNotMatch(
    css,
    /@import|https:\/\/fonts\.googleapis\.com|https:\/\/fonts\.gstatic\.com/u,
    "the stylesheet must not reach off-origin for type",
  );
  for (const face of ["bricolage-grotesque", "inter", "jetbrains-mono"]) {
    assert.match(css, new RegExp(`url\\(fonts/${face}\\.woff2\\)`, "u"));
  }
  assert.doesNotMatch(css, /url\(\/fonts\//u, "font URLs must stay relative");
});

test("no page fetches a font, script, style or image from another host", () => {
  /*
   * Same policy, stated whole rather than only for type.
   *
   * The deployment's CSP is same-origin for scripts, styles, fonts and images,
   * and every one of those refusals is silent in a way that leaves the page
   * looking merely wrong: an analytics script that never runs, an icon font
   * that falls back to boxes, a hero image that is a blank rectangle. And a
   * third-party subresource is a third party who can change what this site
   * executes without anybody here making a commit.
   *
   * Only subresources are checked — `src`, `srcset`, and `<link href>`.
   * A plain `<a href>` to github.com is a navigation the reader chose, and the
   * download links depend on it.
   */
  const offenders = [];
  for (const { file } of pages()) {
    const html = read(file);
    const fetched = [
      ...[...html.matchAll(/\s(?:src|srcset|poster)="([^"]*)"/gu)].map((m) => m[1]),
      ...[...html.matchAll(/<link\b[^>]*\shref="([^"]*)"/gu)].map((m) => m[1]),
    ];
    for (const target of fetched) {
      if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//iu.test(target)) {
        offenders.push(`${file}: ${target}`);
      }
    }
  }
  // The stylesheet is a subresource that fetches subresources of its own.
  for (const url of [...read("site.css").matchAll(/url\(\s*['"]?([^'")]*)/gu)].map((m) => m[1])) {
    if (/^(?:[a-z][a-z0-9+.-]*:)?\/\//iu.test(url)) {
      offenders.push(`site.css: ${url}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `these load from a host this site does not control:\n  ${offenders.join("\n  ")}`,
  );
});

test("the water field leaves the top lockup clear", () => {
  const shader = read("field.js");
  assert.match(shader, /float topClear = 1\.0 - smoothstep\(0\.76, 0\.82, fieldY\)/u);
  assert.match(shader, /colour \*= topClear/u);
  assert.ok(
    shader.indexOf("colour *= topClear") < shader.indexOf("outColour ="),
    "the clear zone must be applied to the final field before it is drawn",
  );
});

test("no page carries an inline script or an inline event handler", () => {
  /*
   * The gateway's CSP has no `unsafe-inline`. An inline `<script>` body and an
   * `onclick=` attribute are both simply not executed under it — no error the
   * author will see, just a button that does nothing for everybody except the
   * person who tested it by opening the file from disk.
   *
   * This is why the boot forwarder is an external file rather than eight lines
   * in <head>, and the reason is worth a test rather than a comment: inlining
   * it is the obvious simplification for somebody who does not know.
   */
  const offenders = [];
  for (const { file } of pages()) {
    const html = read(file);
    for (const script of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/giu)) {
      if (script[2].trim().length > 0) {
        offenders.push(`${file}: inline <script${script[1]}> with a body`);
      }
    }
    for (const handler of html.matchAll(/<[a-z][^>]*?\s(on[a-z]+)\s*=/giu)) {
      offenders.push(`${file}: inline ${handler[1]}= handler`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `the content security policy refuses these silently:\n  ${offenders.join("\n  ")}`,
  );
});

/* ----------------------------------------------------- addresses in pages -- */

test("the pages survive being served under a path prefix", () => {
  /*
   * The site is served at more than one depth.
   *
   * Production gives it "/" and "/pricing" off the origin root. The control
   * plane's preview proxy gives the same pages a deep path —
   * `/api/v1/projects/<id>/repositories/<id>/preview/app/` — so somebody can
   * look at the site an agent just changed, from a phone, without a port being
   * opened. A root-absolute `href="/site.css"` resolves to the deployment's
   * own stylesheet in that second case, not the preview's, and every link in
   * the nav walks straight out of the preview into production. The page looks
   * right and is not the page being previewed, which is the worst way for a
   * preview to fail.
   *
   * `/app` is the deliberate exception. The dashboard really is at the
   * origin's root, and from inside a preview "open the product" should reach
   * the deployment rather than something inside the preview.
   *
   * Every page in the table, not a hardcoded two: a page added later is
   * written by copying one of these, and the thing most easily "tidied" in the
   * copy is exactly the leading slash that is missing on purpose.
   */
  // `action` scanned alongside `href` and `src` since the day a
  // root-absolute form action slipped past this test: under the preview
  // prefix the waitlist posted to the deployment's own API instead of the
  // preview's proxy, and three phones in a row photographed the JSON it
  // answered with.
  for (const { file } of pages()) {
    const html = read(file);
    const absolute = [...html.matchAll(/(?:href|src|action)="(\/[^"]*)"/gu)]
      .map((match) => match[1])
      .filter((target) => !target.startsWith("/app"));
    assert.deepEqual(
      absolute,
      [],
      `${file} would resolve these against the deployment root, not the ` +
        `page's own directory: ${absolute.join(", ")}`,
    );
  }
});

test("every form action still resolves to the address the server proxies", () => {
  /*
   * The other half of the relative-action rule. Relative keeps a post inside
   * the preview prefix, but it is only correct because every page carrying a
   * form sits at the origin root, where "api/v1/waitlist" resolves to
   * "/api/v1/waitlist" — the one path server.mjs forwards to the gateway. A
   * form copied onto a page served at another depth would resolve somewhere
   * nothing answers, and nothing else here would say so.
   */
  const posts = [];
  for (const { address, file } of pages()) {
    const base = new URL(address, "http://site.invalid");
    for (const m of read(file).matchAll(/action="([^"]*)"/gu)) {
      posts.push(`${file}: ${new URL(m[1], base).pathname}`);
    }
  }
  assert.deepEqual(posts, [
    "index.html: /api/v1/waitlist",
    "waitlist.html: /api/v1/waitlist",
  ]);
});

test("every internal link resolves to an address the server serves", () => {
  /*
   * The relative references the test above insists on are only correct if
   * they land somewhere. `href="about"` from `/pricing` is `/about`, which is
   * a route; `href="about.html"` would be a redirect and `href="team"` would
   * be a 404 that renders as a styled apology nobody reports.
   *
   * This is the check the monorepo did not have and could not have had — the
   * gateway's own tests knew the asset map but not which page linked where. It
   * is the one that catches a nav item added ahead of the page it points to,
   * which is the ordinary way a marketing site grows.
   */
  const dead = [];
  for (const { address, file } of pages()) {
    const base = new URL(address, "http://site.invalid");
    for (const href of [...read(file).matchAll(/href="([^"]*)"/gu)].map((m) => m[1])) {
      if (
        href.length === 0 ||
        href.startsWith("#") ||
        href.startsWith("/app") ||
        /^[a-z][a-z0-9+.-]*:/iu.test(href)
      ) {
        continue;
      }
      const resolved = new URL(href, base).pathname;
      if (!ROUTES.has(resolved)) {
        dead.push(`${file}: href="${href}" → ${resolved}, which nothing serves`);
      }
    }
  }
  assert.deepEqual(dead, [], `links to nowhere:\n  ${dead.join("\n  ")}`);
});

/* ------------------------------------------------------ what the copy says -- */

test("no page shows a literal backslash-n in its text", () => {
  /*
   * A generator that wrote these pages once escaped a newline into the copy
   * rather than emitting one, and the site shipped a heading reading
   * "About\n KUMI." to everybody who visited. Nothing was broken — the HTML
   * was valid, every test passed, the page rendered — it just had two visible
   * characters in it that were never meant to be read.
   *
   * Checked against text only: `\n` is legitimate inside a script or a style
   * block, and this deliberately does not look there.
   */
  const offenders = [];
  for (const { file } of pages()) {
    const text = read(file)
      .replaceAll(/<script\b[\s\S]*?<\/script>/giu, " ")
      .replaceAll(/<style\b[\s\S]*?<\/style>/giu, " ")
      .replaceAll(/<!--[\s\S]*?-->/gu, " ")
      .replaceAll(/<[^>]*>/gu, " ");
    for (const hit of text.matchAll(/(.{0,30}\\n.{0,30})/gu)) {
      offenders.push(`${file}: ${hit[1].replace(/\s+/gu, " ").trim()}`);
    }
  }
  assert.deepEqual(
    offenders,
    [],
    `an escaped newline is being read as two characters:\n  ${offenders.join("\n  ")}`,
  );
});

test("the seat price is written exactly once, on the pricing page", () => {
  /*
   * The product code carries no amount at all — only a STRIPE_PRICE_ID — so
   * the site is the single place a human reads the number. Keeping it to one
   * marked line is what makes a Stripe price change a one-line site edit, and
   * what stops a second copy somewhere quieter disagreeing with Stripe about
   * what the customer is about to be charged.
   *
   * Broadened on the move: the monorepo had two pages to police and this
   * folder has seven, so every page that is not the pricing page is checked
   * rather than only the front one.
   */
  const pricing = read("pricing.html");
  const amounts = pricing.match(/\$\d+/gu) ?? [];
  assert.equal(amounts.length, 1, `expected one price, saw: ${amounts.join(", ")}`);
  assert.match(pricing, /PRICE — the only place/u);
  for (const { file } of pages()) {
    if (file === "pricing.html") {
      continue;
    }
    const repeated = read(file).match(/\$\d+/gu) ?? [];
    assert.deepEqual(
      repeated,
      [],
      `${file} repeats the price (${repeated.join(", ")}); it lives on pricing.html alone`,
    );
  }
});

/* ------------------------------------------------------------- downloads -- */

/**
 * Every file that offers a release, read as one thing.
 *
 * The download page and the front page both hand out installers — the front
 * page offers them directly rather than sending a reader onward, so it is a
 * second copy of the same five filenames, and the one nobody thinks to update
 * because it is not called download anything. In the monorepo there was a
 * third, `download.js`, holding the links that the content security policy
 * pushed out of the HTML; there is no such file here.
 */
const RELEASE_PAGES = ["download.html", "index.html"];

function releaseSource() {
  return RELEASE_PAGES.map((file) => read(file)).join("\n");
}

test("every page that names a release names the same repository", () => {
  /*
   * The repository has been renamed once already. The failure that follows a
   * second rename is a download button that serves a redirect, or nothing, and
   * nobody notices until a stranger complains.
   *
   * In the monorepo this was compared against `kumi.releasesRepo` in
   * apps/desktop/package.json, which is the authority and is not in this
   * repository. The name is written out here instead, with that manifest named
   * as the thing it must agree with — a string comparison catches the drift
   * just as well as a dependency would, and this one fails on a laptop.
   *
   * Note the shape of the check: it is not "does every link name Kumi", it is
   * "do all the links agree with each other and with the manifest". A single
   * link with the repository name cased differently is a different repository
   * as far as anything but GitHub's own redirector is concerned, and it is the
   * exact drift that got past a reader here.
   */
  const named = [
    ...releaseSource().matchAll(/https:\/\/github\.com\/([^/"'\s]+\/[^/"'\s]+)\/releases/gu),
  ].map((match) => match[1]);
  assert.ok(named.length > 0, "no page names a releases repository");
  const distinct = new Set(named);
  assert.equal(
    distinct.size,
    1,
    `the site names more than one releases repository: ${[...distinct].join(", ")}`,
  );
  // `kumi.releasesRepo` in apps/desktop/package.json, in the product repo.
  assert.equal([...distinct][0], "Nathan-W123/Kumi");
});

test("every download the page offers is a file the packager actually builds", () => {
  /*
   * The names come from `artifactName` in apps/desktop/electron-builder.yml in
   * the product repository, which is deliberately version-free so these links
   * never expire. That template is not readable from here, so it cannot be
   * checked against; the release workflow there compares these same names to
   * the artifacts three real runners produced, which is the check that can fail
   * on reality. This one fails sooner and on a laptop.
   *
   * The subtlety is the whole point. The names are collected
   * case-INSENSITIVELY and compared case-SENSITIVELY, because a release asset
   * path is case sensitive: `KUMI-win-x64.exe` is a 404 and not a spelling
   * preference. Collecting with `/Kumi-/` would let a mis-cased name through by
   * never seeing it at all — which is how this very folder came to ship five
   * links that could not resolve.
   *
   * The odd spellings are load-bearing and were taken from real builds rather
   * than guessed. `${os}` expands to electron-builder's own configuration key,
   * so it is `mac` and `win`, never `macos` or `windows`; AppImage and `.deb`
   * each impose their own architecture spelling on top of `${arch}`.
   */
  const offered = new Set(
    [
      ...releaseSource().matchAll(/(kumi-[a-z0-9_.-]+\.(?:dmg|zip|exe|appimage|deb))/giu),
    ].map((match) => match[1]),
  );
  assert.ok(offered.size > 0, "the site offers no files");
  const built = new Set([
    "Kumi-mac-arm64.dmg",
    "Kumi-mac-x64.dmg",
    "Kumi-win-x64.exe",
    "Kumi-linux-x86_64.AppImage",
    "Kumi-linux-amd64.deb",
  ]);
  for (const file of offered) {
    assert.ok(built.has(file), `the site offers ${file}, which nothing builds`);
  }
});

/*
 * The waitlist form posts the names the deployment reads.
 *
 * The form ultimately talks to a service in another repository, which is the
 * whole problem: `POST /api/v1/waitlist` reads
 * `email`, `displayName`, `note` and `source`, and it ignores anything else
 * in silence rather than refusing it. So a field renamed on this side is not
 * an error anywhere — the form submits, the server answers 202, and what
 * somebody typed is dropped on the floor.
 *
 * That is not hypothetical either. The site once posted `name`, `agents`,
 * `company` and `teamSize` against a waitlist that has since been replaced by
 * a different one, and every one of those would now vanish. Pinned as an
 * exact set: a field added here without a matching field on the route is
 * exactly as broken as one renamed.
 */
test("the waitlist form posts the fields the deployment actually reads", () => {
  const page = read("waitlist.html");

  // The API is not served from this origin, but the action is relative on
  // purpose: server.mjs proxies /api/v1/waitlist to the deployment with an
  // origin the gateway accepts. An absolute action would post straight to the
  // deployment and be refused; a root-absolute one would escape a preview's
  // path prefix. Relative, it resolves to the one path the server forwards.
  const action = /<form[^>]*\baction="([^"]+)"/u.exec(page)?.[1];
  assert.equal(action, "api/v1/waitlist");

  const named = new Set(
    [...page.matchAll(/<(?:input|textarea|select)[^>]*\bname="([^"]+)"/gu)].map(
      (match) => match[1],
    ),
  );
  assert.deepEqual(
    [...named].sort(),
    ["displayName", "email", "note", "source"],
    "the form's field names have drifted from the route's",
  );

  // The route uses readJson and answers a form encoding with a 415, so the
  // script has to send JSON — the browser's own submission cannot work.
  const script = read("site.js");
  const submit = script.slice(script.indexOf("function waitlist()"));
  assert.match(submit, /"content-type":\s*"application\/json"/u);
  assert.match(submit, /JSON\.stringify/u);

  // A form collecting an address says where it goes, on the page, not only in
  // a policy somebody would have to think to open.
  assert.match(page, /<a\s+href="privacy">privacy policy<\/a>/u);
});
