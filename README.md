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

## Previewing

Any static server works for looking at the pages:

```sh
npx serve .          # or: python3 -m http.server
```

Two things behave differently outside the real gateway:

- The nav links are extensionless (`/pricing`, `/download`) because that is
  how the gateway serves them. A plain static server wants `pricing.html`;
  hosts with clean-URL rewriting (Netlify, Vercel) match production.
- Everything under `/app` — sign in, start free trial — belongs to the
  deployment, not this repo. Those buttons dead-end in a standalone preview.

## Motion

`site-boot.js` runs first, parser-blocking: it forwards legacy dashboard
deep links and installed shells to `/app`, and arms the `anim` class only
when the visitor accepts motion. `site.js` wires every animation through the
vendored Motion bundle and strips `anim` under `prefers-reduced-motion` — the
pages read whole with scripts disabled entirely.
