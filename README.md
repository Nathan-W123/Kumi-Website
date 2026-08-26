# Kumi — marketing site

The public face of [Kumi](https://github.com/Nathan-W123/agentic-git): three
pages, one stylesheet, two small ES modules, and a vendored copy of
[Motion](https://motion.dev) (MIT — licence in `vendor/motion/LICENSE.md`).
No framework, no bundler, no build step.

## Where this is served from

The **source of truth lives in the product repository** at
`apps/web/public/site/`, and production serves it from the same gateway that
serves the app — deliberately: the session cookie is `SameSite=Strict`, and
sign-up *is* billing, so the page selling the product posts to routes on its
own origin.

| URL         | File            |
|-------------|-----------------|
| `/`         | `index.html`    |
| `/pricing`  | `pricing.html`  |
| `/download` | `download.html` |
| `/app`      | the Kumi dashboard (not in this repo) |

This repository mirrors the site portion. If you edit here, carry the change
back to `apps/web/public/site/` (or vice versa) — the gateway serves that
copy, not this one.

One page deliberately has no counterpart there. `/download` in production is
served by the dashboard, from `apps/web/public/download.html`, and that page
is styled with the dashboard's stylesheet rather than this one — 315 KB of
CSS carried into a marketing mirror is not a trade worth making. The version
here is the same links in the site's own styling. The links are the thing
that must not drift; see **Downloads** below.

## Running it

```sh
npm start          # http://127.0.0.1:4173
```

`server.mjs` is the whole thing: no dependencies, and it holds the same
address→file table the gateway builds from `SITE_FILES` in
`apps/web/src/assets.ts`. Read the two side by side when either changes.

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
