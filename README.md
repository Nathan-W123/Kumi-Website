# Kumi — marketing site

The public face of [Kumi](https://github.com/Nathan-W123/agentic-git): eight
pages, one stylesheet, three small ES modules, and a vendored copy of
[Motion](https://motion.dev) (MIT — licence in `vendor/motion/LICENSE.md`).
No framework, no bundler, no build step.

## Where this is served from

**This repository is the source of truth.** It used to be a mirror: the site
lived in the product repository at `apps/web/public/site/` and the gateway
served it beside the app. That is over. The gateway now answers its own
origin with the dashboard, because a deployment whose front door is an
advertisement for itself is not what that deployment is for.

| URL        | File            |
|------------|-----------------|
| `/`        | `index.html`    |
| `/pricing` | `pricing.html`  |
| `/about`   | `about.html`    |
| `/faq`     | `faq.html`      |
| `/security`| `security.html` |
| `/privacy` | `privacy.html`  |
| `/terms`   | `terms.html`    |
| `/waitlist`| `waitlist.html` |
| `/download`| `download.html` |
| `/app`     | the Kumi deployment (not in this repo) |

Nothing carries back to the product repository any more; there is no second
copy to keep in step.

### One thing the move costs

The waitlist form posts to `/api/v1/waitlist`, which is a route on the
**gateway**, not on this server. While the site was served from the gateway
that was a same-origin POST and it worked. Served from anywhere else it is
cross-origin, and it will fail until either the form posts at the deployment's
absolute address with CORS allowed for this origin, or this site is served
behind something that proxies `/api/` through. That decision is open.

## Running it

```sh
npm start          # http://127.0.0.1:4173
```

`server.mjs` is the whole thing: no dependencies, and `ROUTES` in it is the
address→file table — the one that used to have to agree with `SITE_FILES` in
the product repository, and now simply *is* the answer.

`PORT` and `HOST` are honoured, which is what makes this work under Kumi's own
preview button — press play on this repository and it runs `npm start` on a
port it picked and gives you the site at the addresses it really has.

`/app` is not in this repository, so the server redirects it to the
deployment. Set `KUMI_APP_ORIGIN` to point sign-in and the trial button
somewhere else:

```sh
KUMI_APP_ORIGIN=http://127.0.0.1:8080 npm start
```

### Why not just a static server

`npx serve .` and `python3 -m http.server` will serve the homepage, correctly
styled, and then 404 every link in the nav. The pages ask for `/pricing` and
`/download`, because that is how the gateway serves them; on disk those are
`pricing.html` and `download.html`. Hosts with clean-URL rewriting (Netlify,
Vercel, GitHub Pages) match production without help. Plain file servers do
not, which is what `server.mjs` is for.

It is forgiving about two things a plain server taught people to type:
`/pricing/` and `/pricing.html` both redirect to `/pricing`, so there is one
canonical address per page and it is production's.

### Served under a path prefix

Every asset and page reference in these files is **relative**, and it has to
stay that way. The site is served at more than one depth: production gives it
the origin root, and Kumi's own preview proxy gives it a deep path under
`/api/v1/projects/<id>/repositories/<id>/preview/app/` so the pages can be
looked at from a phone without a port being opened. A root-absolute
`href="/site.css"` resolves to the *deployment's* stylesheet in that second
case, and every link in the nav walks out of the preview and into production
— the page looks right and is not the page being previewed.

`/app` is the deliberate exception, and the only one. The dashboard really is
at the origin's root, so from inside a preview "open the product" should reach
the deployment rather than something inside the preview. `site-boot.js`
forwards to it only from `/` for the same reason: served anywhere else, its
installed-shell tell fires inside the preview and replaces the site with the
real app.

## Tests

```sh
npm test
```

`site.test.mjs` is the suite that came with the site when it moved out of the
product repository, plus a few checks that only became possible here. It holds
the things nothing else can: that every module parses and every stylesheet's
braces balance (nothing compiles or lints these files, and a stray top-level
`}` makes a browser silently swallow the *next* rule); that only `site.js` may
add the `anim` class that hides content, so a broken module graph leaves the
page readable rather than blank; that every `animation:` sits behind the
reduced-motion gate; that no page reference is root-absolute except `/app`, so
the pages survive being served under a path prefix; that no page reaches a
third-party host; that every internal link resolves to an address `ROUTES`
actually serves; and that every installer filename matches what the packager
builds, compared case-sensitively — a mis-cased release asset is a 404, not a
spelling preference.

Each test carries a comment saying which regression it exists to catch. Most
of them are there because that regression really shipped.

## Deploying

Any static host works — the files are flat and the routing this server does
is the same clean-URL rewriting those hosts do themselves. `server.mjs` is
for previewing, and is what runs when the site is served by Node.

## Motion

`site-boot.js` runs first, parser-blocking: it forwards legacy dashboard
deep links and installed shells to `/app`, and arms the `anim` class only
when the visitor accepts motion. `site.js` wires every animation through the
vendored Motion bundle and strips `anim` under `prefers-reduced-motion` — the
pages read whole with scripts disabled entirely.

## Downloads

`download.html` links at
`releases/latest/download/<file>` on
[Nathan-W123/Kumi](https://github.com/Nathan-W123/Kumi/releases), which
GitHub redirects to whatever the newest release calls that file — so the page
needs no edit when a version ships. The installer names come from
`apps/desktop/electron-builder.yml` in the product repository, and the
release workflow there checks them against what it actually built.
