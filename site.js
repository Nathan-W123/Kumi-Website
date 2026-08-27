/**
 * Every discrete animation on the marketing site, in one module.
 *
 * The library is the vendored Motion UMD bundle (vendor/motion/motion.js,
 * MIT — licence served beside it). It is loaded as a classic script before
 * this module because its ES build re-exports from a bare specifier no
 * browser can resolve without a bundler, and this repo ships none.
 *
 * The gate is checked once, here, at the top — not sprinkled per effect.
 * Reduced motion, or a missing library, means this module wires nothing and
 * instead STRIPS the `anim` class the boot script added, so no element can
 * be left waiting for a reveal that will never come. The page reads
 * perfectly with this file absent; everything below is decoration.
 *
 * The point field is the one thing here that is not decoration, and it is
 * also the one thing that can fail on its own — no WebGL, a driver that
 * refuses, a shader that will not compile on some phone. It is therefore
 * started inside its own try, after everything else is wired, so a field that
 * cannot be drawn costs the field and nothing else.
 */

import { startField } from "./field.js";

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const motion = window.Motion;
const EASE = [0.32, 0.72, 0, 1];
// The long decelerating tail for the big entrances: almost all of the
// distance in the first third, then a settle slow enough to watch land.
const EXPO = [0.16, 1, 0.3, 1];

// Undo hooks for everything standing — see the header. Run at most once.
const teardowns = [];

// The source markup is a useful no-JavaScript fallback, but it predates the
// actual product surface. Replace it before the motion gate is evaluated so
// reduced-motion visitors see the same faithful Kumi UI, simply at rest.
mountCoordinationShowcase();

let stopField;

function disarm() {
  document.documentElement.classList.remove("anim");
  if (stopField !== undefined) {
    stopField();
    stopField = undefined;
  }
}

if (reduceMotion.matches || motion === undefined) {
  disarm();
} else {
  // A preference flipped mid-visit is honoured immediately: the CSS block in
  // site.css stops the continuous animations, dropping the class shows
  // anything still waiting on a scroll reveal, and the field stops drawing.
  reduceMotion.addEventListener("change", () => {
    if (reduceMotion.matches) {
      disarm();
      for (const undo of teardowns.splice(0)) {
        undo();
      }
    }
  });
  wire();
  field();
}

/**
 * How far through the field's three forms the page has scrolled, 0 to 1.
 *
 * Measured against the top of the last section rather than the whole
 * document, so the final form is fully assembled while it is still on screen
 * — running the morph to the very bottom of the page would finish it under
 * the footer, where nobody is looking.
 */
function progress() {
  const end = document.querySelector("#channel");
  const last =
    end === null
      ? document.body.scrollHeight - window.innerHeight
      : end.offsetTop - window.innerHeight * 0.4;
  if (last <= 0) {
    return 0;
  }
  return Math.max(0, Math.min(1, window.scrollY / last));
}

/**
 * Where the form should sit on screen, section by section.
 *
 * The copy is not centred — the hero splits left and right, "how it works"
 * is a left column, and the last section puts a wide card on the right. A
 * form fixed at the middle of the viewport would be behind the text in two
 * of those four, so it steps aside instead, and the step is slow enough to
 * read as the field making room rather than as a jump.
 *
 * Keyed to the same scroll progress that drives the morph, so the two never
 * disagree about which section is being read.
 */
const SHIFTS = [
  [0.0, [0.0, 0.0]],
  [0.34, [0.0, -0.14]],
  [0.62, [0.0, -0.2]],
  [1.0, [0.0, -0.18]],
];

function shift() {
  const p = progress();
  for (let i = 1; i < SHIFTS.length; i += 1) {
    const [end, to] = SHIFTS[i];
    const [start, from] = SHIFTS[i - 1];
    if (p <= end || i === SHIFTS.length - 1) {
      const t = Math.max(0, Math.min(1, (p - start) / (end - start)));
      // Smoothstep rather than linear: the field should ease out of one
      // position and into the next, not slide at a constant rate.
      const e = t * t * (3 - 2 * t);
      return [from[0] + (to[0] - from[0]) * e, from[1] + (to[1] - from[1]) * e];
    }
  }
  return [0, 0];
}

function field() {
  const canvas = document.querySelector("#field");
  if (canvas === null) {
    return;
  }
  try {
    stopField = startField(canvas, { progress, shift });
  } catch {
    // A shader that would not compile, or a context lost on creation. The
    // stylesheet's gradient is already behind the canvas and is a complete
    // background on its own, so there is nothing to clean up and nothing
    // worth telling the visitor.
    stopField = undefined;
  }
}

function wire() {
  const { animate, inView, stagger, hover, press, scroll } = motion;
  const fine =
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;
  // One switch aborts every listener the standing effects attach, so a
  // teardown never has to enumerate them.
  const halt = new AbortController();
  teardowns.push(() => halt.abort());
  const signal = halt.signal;

  // -- Hero: words rise out of their clipped line boxes, then the chip, the
  //    aside, and the scroll cue follow. The starting offsets came from the
  //    stylesheet (armed by `html.anim`), so the first frame never flashes.
  const words = document.querySelectorAll(".hero h1 .w > span");
  if (words.length > 0) {
    animate(
      words,
      { transform: ["translateY(110%)", "translateY(0%)"] },
      { delay: stagger(0.07), type: "spring", stiffness: 120, damping: 18 },
    );
  }
  const follow = (selector, delay) => {
    const el = document.querySelector(selector);
    if (el === null) {
      return null;
    }
    return animate(
      el,
      { opacity: [0, 1], transform: ["translateY(26px)", "translateY(0px)"] },
      { duration: 0.9, delay, ease: EXPO },
    );
  };
  follow(".hero .chip", 0.15);
  follow(".hero-aside", 0.42);
  follow(".scroll-cue", 0.62);

  // -- Scroll reveals: one behaviour for every section heading, paragraph
  //    block, and card. Card rows and step rows stagger their children as a
  //    group instead, so neighbours arrive as a family, not a queue.
  for (const group of document.querySelectorAll("[data-reveal-group]")) {
    const items = group.querySelectorAll(".reveal");
    inView(
      group,
      () => {
        animate(
          items,
          { opacity: [0, 1], transform: ["translateY(24px)", "translateY(0px)"] },
          { duration: 0.6, delay: stagger(0.08), ease: EASE },
        );
      },
      { margin: "0px 0px -12% 0px" },
    );
  }
  for (const el of document.querySelectorAll(".reveal")) {
    if (el.closest("[data-reveal-group]") !== null) {
      continue;
    }
    inView(
      el,
      () => {
        animate(
          el,
          { opacity: [0, 1], transform: ["translateY(24px)", "translateY(0px)"] },
          { duration: 0.6, ease: EASE },
        );
      },
      { margin: "0px 0px -12% 0px" },
    );
  }

  // -- Nav grows an edge once the page has left the hero: transparent over
  //    the field, blurred ground with a hairline after 40px.
  const nav = document.querySelector(".site-nav");
  if (nav !== null) {
    const settle = () => {
      nav.classList.toggle("lifted", window.scrollY > 40);
    };
    window.addEventListener("scroll", settle, { passive: true });
    settle();
  }

  // -- Cards: a spring lift on hover. Desktop-only by capability, not
  //    user-agent — coarse pointers never see it, because a lift that
  //    triggers on tap reads as a rendering bug.
  if (fine) {
    hover(".card", (el) => {
      animate(
        el,
        { transform: "translateY(-4px)" },
        { type: "spring", stiffness: 300, damping: 24 },
      );
      return () => {
        animate(
          el,
          { transform: "translateY(0px)" },
          { type: "spring", stiffness: 300, damping: 24 },
        );
      };
    });
  }

  // -- Primary CTAs: pressed-in feedback, and a small particle burst on
  //    activation. The burst spawns real elements rather than a canvas so it
  //    inherits the button's colours and needs nothing else.
  press(".btn-primary", (el) => {
    animate(el, { scale: 0.97 }, { duration: 0.14, ease: EASE });
    return () => {
      animate(
        el,
        { scale: 1 },
        { type: "spring", stiffness: 400, damping: 20 },
      );
    };
  });
  for (const el of document.querySelectorAll(".btn-primary")) {
    el.addEventListener("click", () => {
      for (let i = 0; i < 12; i += 1) {
        const spark = document.createElement("span");
        spark.className = "spark";
        el.append(spark);
        animate(
          spark,
          {
            x: (Math.random() - 0.5) * 80,
            y: (Math.random() - 0.5) * 80,
            opacity: [1, 0],
            scale: [1, 0],
          },
          { duration: 0.6, ease: "easeOut" },
        ).finished.then(() => {
          spark.remove();
        });
      }
    });
  }

  // -- Scroll-linked, and deliberately wired last: everything above must be
  //    in place even if scrubbing fails. All of it is driven by the
  //    visitor's own scrolling rather than a clock. The reading line fills
  //    with page progress; the aurora drifts down slower than the content
  //    (depth, not attachment) and thins to nothing by the time the hero is
  //    gone; the hero's own content recedes and dims a step behind the
  //    scroll, so the page appears to pull away from it in depth.
  const progress = document.querySelector(".scroll-progress");
  if (progress !== null) {
    scroll(animate(progress, { scaleX: [0, 1] }, { ease: "linear" }));
  }
  const aurora = document.querySelector(".aurora");
  const hero = document.querySelector(".hero");
  if (aurora !== null && hero !== null) {
    scroll(
      animate(aurora, { y: [0, 160], opacity: [1, 0] }, { ease: "linear" }),
      { target: hero, offset: ["start start", "end start"] },
    );
  }
  const heroWrap = document.querySelector(".hero .wrap");
  if (hero !== null && heroWrap !== null) {
    scroll(
      animate(heroWrap, { y: [0, 110], opacity: [1, 0.4] }, { ease: "linear" }),
      { target: hero, offset: ["start start", "end start"] },
    );
  }

  velocitySkew(signal);
  liveMarquee(inView, signal);
}

/* ------------------------------------------------------------------------ */

/**
 * The stylesheet for machinery only this module creates — the cursor pair,
 * the headline glyphs, the doubled nav labels. Injected rather than kept in
 * site.css so the selectors can never match for a visitor whose page never
 * builds the elements; removing the element on teardown removes every rule
 * with it. All continuous motion in here is transition-on-property only —
 * the transforms themselves are written each frame by the loops below.
 */
function injectStyles() {
  const style = document.createElement("style");
  style.textContent = `
    html.has-cursor,
    html.has-cursor a,
    html.has-cursor button {
      cursor: none;
    }

    .kc-ring,
    .kc-dot {
      position: fixed;
      top: 0;
      left: 0;
      border-radius: 50%;
      pointer-events: none;
      opacity: 0;
      will-change: transform;
      transition: opacity 0.3s var(--ease-motion),
        border-color 0.25s var(--ease-motion),
        background-color 0.25s var(--ease-motion);
    }

    .kc-ring {
      z-index: 60;
      width: 34px;
      height: 34px;
      border: 1.5px solid color-mix(in srgb, var(--salmon) 55%, transparent);
    }

    .kc-ring.is-active {
      border-color: color-mix(in srgb, var(--salmon) 90%, transparent);
      background-color: color-mix(in srgb, var(--salmon) 12%, transparent);
    }

    .kc-dot {
      z-index: 61;
      width: 6px;
      height: 6px;
      background: var(--salmon);
    }

    html.kc-live .kc-ring,
    html.kc-live .kc-dot {
      opacity: 1;
    }

    .hero h1 .ch {
      display: inline-block;
      transform-origin: 50% 100%;
      will-change: transform;
    }

    .nav-link.swap {
      position: relative;
      display: inline-block;
      overflow: hidden;
    }

    .swap .swap-a,
    .swap .swap-b {
      display: block;
      transition: transform 0.5s var(--ease-motion);
    }

    .swap .swap-b {
      position: absolute;
      inset: 0;
      transform: translateY(115%);
    }

    @media (hover: hover) {
      .swap:hover .swap-a {
        transform: translateY(-115%);
      }

      .swap:hover .swap-b {
        transform: translateY(0%);
      }
    }
  `;
  document.head.append(style);
  teardowns.push(() => style.remove());
}

/**
 * The headline entrance: every word box is split into per-glyph spans, and
 * the glyphs rise through the existing clip with a small straightening
 * rotation, staggered in reading order. Built synchronously so there is no
 * frame between "words hidden by the CSS arm" and "glyphs hidden inline" —
 * the parent word is released to 0% only after its glyphs carry the offset.
 *
 * The shimmer word stays whole and rises as a single unit: its panning
 * gradient is clipped to the span's own text, and splitting it would restart
 * the gradient on every glyph. Screen readers get the heading as one string
 * via aria-label; the visual boxes are hidden from them, which also stops
 * the per-glyph spans being read out letter by letter.
 */
function riseHeadline(animate, stagger) {
  const heading = document.querySelector(".hero h1");
  if (heading === null) {
    return;
  }
  const words = heading.querySelectorAll(".w > span");
  if (words.length === 0) {
    return;
  }
  const START = "translateY(120%) rotate(6deg)";
  heading.setAttribute(
    "aria-label",
    heading.textContent.trim().replace(/\s+/g, " "),
  );
  const units = [];
  for (const word of words) {
    word.parentElement.setAttribute("aria-hidden", "true");
    if (word.classList.contains("shimmer")) {
      word.style.transformOrigin = "50% 100%";
      word.style.transform = START;
      units.push(word);
      continue;
    }
    const text = word.textContent;
    word.textContent = "";
    for (const glyph of text) {
      const ch = document.createElement("span");
      ch.className = "ch";
      ch.textContent = glyph;
      ch.style.transform = START;
      word.append(ch);
      units.push(ch);
    }
    // The glyphs hold the hidden state now; the word box must not add its
    // CSS-armed offset on top of theirs.
    word.style.transform = "translateY(0%)";
  }
  animate(
    units,
    { transform: [START, "translateY(0%) rotate(0deg)"] },
    { delay: stagger(0.016), duration: 0.95, ease: EXPO },
  );
}

/**
 * The custom cursor: a dot that hugs the pointer and a ring that chases it
 * on a slower lerp. The ring's own per-frame velocity — not the pointer's —
 * drives a squash along its direction of travel, so it stretches while
 * catching up and relaxes back to a circle as it arrives. Over anything
 * clickable the ring swells and fills faintly while the dot shrinks away;
 * pressing tightens the whole thing.
 *
 * The native cursor is hidden only while this layer exists — the class and
 * both elements go away in teardown, and the pair stays invisible until the
 * first real pointer move so nobody ever sees it fly in from 0,0. The loop
 * parks itself whenever every lerp has settled; events wake it.
 */
function pointerLayer(signal) {
  const ring = document.createElement("div");
  ring.className = "kc-ring";
  ring.setAttribute("aria-hidden", "true");
  const dot = document.createElement("div");
  dot.className = "kc-dot";
  dot.setAttribute("aria-hidden", "true");
  document.body.append(ring, dot);
  document.documentElement.classList.add("has-cursor");
  teardowns.push(() => {
    ring.remove();
    dot.remove();
    document.documentElement.classList.remove("has-cursor", "kc-live");
  });

  const RING = 34;
  const DOT = 6;
  let tx = 0;
  let ty = 0;
  let rx = 0;
  let ry = 0;
  let dx = 0;
  let dy = 0;
  let grow = 1;
  let growTo = 1;
  let hold = 1;
  let holdTo = 1;
  let dotS = 1;
  let dotTo = 1;
  let angle = 0;
  let seen = false;
  let frame = null;

  const step = () => {
    dx += (tx - dx) * 0.55;
    dy += (ty - dy) * 0.55;
    const wasX = rx;
    const wasY = ry;
    rx += (tx - rx) * 0.16;
    ry += (ty - ry) * 0.16;
    grow += (growTo - grow) * 0.18;
    hold += (holdTo - hold) * 0.3;
    dotS += (dotTo - dotS) * 0.25;
    const vx = rx - wasX;
    const vy = ry - wasY;
    const speed = Math.hypot(vx, vy);
    if (speed > 0.35) {
      // Held below that threshold: a ring easing to a stop should relax in
      // place, not snap its stretch axis around on noise.
      angle = Math.atan2(vy, vx);
    }
    const stretch = Math.min(speed * 0.011, 0.34);
    const scale = grow * hold;
    ring.style.transform =
      `translate3d(${rx - RING / 2}px, ${ry - RING / 2}px, 0) ` +
      `rotate(${angle}rad) ` +
      `scale(${(1 + stretch) * scale}, ${(1 - stretch * 0.65) * scale})`;
    dot.style.transform =
      `translate3d(${dx - DOT / 2}px, ${dy - DOT / 2}px, 0) scale(${dotS})`;
    const settled =
      Math.abs(tx - rx) < 0.05 &&
      Math.abs(ty - ry) < 0.05 &&
      Math.abs(tx - dx) < 0.05 &&
      Math.abs(ty - dy) < 0.05 &&
      Math.abs(growTo - grow) < 0.002 &&
      Math.abs(holdTo - hold) < 0.002 &&
      Math.abs(dotTo - dotS) < 0.002;
    frame = settled ? null : requestAnimationFrame(step);
  };
  const wake = () => {
    if (frame === null) {
      frame = requestAnimationFrame(step);
    }
  };
  teardowns.push(() => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
    }
  });

  window.addEventListener(
    "pointermove",
    (event) => {
      if (event.pointerType === "touch") {
        return;
      }
      tx = event.clientX;
      ty = event.clientY;
      if (!seen) {
        seen = true;
        rx = dx = tx;
        ry = dy = ty;
        document.documentElement.classList.add("kc-live");
      }
      wake();
    },
    { signal },
  );
  window.addEventListener(
    "pointerover",
    (event) => {
      if (event.pointerType === "touch") {
        return;
      }
      const on =
        event.target instanceof Element &&
        event.target.closest("a, button") !== null;
      growTo = on ? 1.7 : 1;
      dotTo = on ? 0 : 1;
      ring.classList.toggle("is-active", on);
      wake();
    },
    { signal },
  );
  window.addEventListener(
    "pointerdown",
    (event) => {
      if (event.pointerType === "touch") {
        return;
      }
      holdTo = 0.82;
      wake();
    },
    { signal },
  );
  window.addEventListener(
    "pointerup",
    (event) => {
      if (event.pointerType === "touch") {
        return;
      }
      holdTo = 1;
      wake();
    },
    { signal },
  );
  // Leaving the window strands both shapes mid-page; fade them out until the
  // pointer returns. A button released out there never sends its pointerup,
  // so the pressed-in state is dropped here too.
  document.addEventListener(
    "mouseleave",
    () => {
      holdTo = 1;
      document.documentElement.classList.remove("kc-live");
    },
    { signal },
  );
  document.addEventListener(
    "mouseenter",
    () => {
      if (seen) {
        document.documentElement.classList.add("kc-live");
      }
    },
    { signal },
  );
}

/**
 * Magnetic pull: buttons and nav links lean toward the pointer while it is
 * over them and spring home — deliberately underdamped, so the release has a
 * visible wobble — when it leaves. The pull goes through Motion's x/y so it
 * composes with the press scale on the primary buttons instead of clobbering
 * one shared transform string. The centre is captured on entry, before any
 * pull has moved the box, so the offset never feeds back into itself.
 */
function magnetise(animate, signal) {
  for (const el of document.querySelectorAll(".btn, .nav-link, .nav-brand")) {
    const pull = el.classList.contains("btn") ? 0.3 : 0.16;
    let cx = 0;
    let cy = 0;
    el.addEventListener(
      "pointerenter",
      (event) => {
        if (event.pointerType === "touch") {
          return;
        }
        const box = el.getBoundingClientRect();
        cx = box.left + box.width / 2;
        cy = box.top + box.height / 2;
      },
      { signal },
    );
    el.addEventListener(
      "pointermove",
      (event) => {
        if (event.pointerType === "touch") {
          return;
        }
        animate(
          el,
          {
            x: (event.clientX - cx) * pull,
            y: (event.clientY - cy) * pull,
          },
          { type: "spring", stiffness: 420, damping: 42 },
        );
      },
      { signal },
    );
    el.addEventListener(
      "pointerleave",
      (event) => {
        if (event.pointerType === "touch") {
          return;
        }
        animate(
          el,
          { x: 0, y: 0 },
          { type: "spring", stiffness: 220, damping: 14 },
        );
      },
      { signal },
    );
    teardowns.push(() => {
      el.style.transform = "";
    });
  }
}

/**
 * Nav labels become two stacked copies in a clipped box: hovering slides the
 * visible one out through the top as its double rises from below. Built only
 * for plain-text links (the brand carries an image and keeps its own hover),
 * and the double is hidden from assistive tech so the link's name stays
 * single. The nav is a center-aligned flex row, so the clipped box cannot
 * disturb any baseline; teardown restores the original text node.
 */
function splitNavLabels() {
  for (const link of document.querySelectorAll(".nav-link")) {
    if (link.children.length > 0) {
      continue;
    }
    const label = link.textContent.trim();
    if (label === "") {
      continue;
    }
    const face = document.createElement("span");
    face.className = "swap-a";
    face.textContent = label;
    const double = document.createElement("span");
    double.className = "swap-b";
    double.textContent = label;
    double.setAttribute("aria-hidden", "true");
    link.textContent = "";
    link.append(face, double);
    link.classList.add("swap");
    teardowns.push(() => {
      link.classList.remove("swap");
      link.textContent = label;
    });
  }
}

/**
 * The page shears a fraction of a degree with scroll velocity and eases back
 * upright the moment scrolling stops — inertia made visible. The skew is
 * applied per block (hero, marquee, main, footer) rather than to one wrapper
 * the markup does not have; that is safe because skewY displaces points by
 * horizontal position only, and these are all full-width siblings with the
 * same centred origin, so the shear field lines up seamlessly across their
 * boundaries. The fixed chrome — nav, reading line, cursor — is deliberately
 * left rigid. The loop only exists while there is skew to ease out; parked,
 * it writes nothing and clears every inline transform it owns.
 */
function velocitySkew(signal) {
  const sheets = [".hero", ".marquee", "main", ".site-footer"]
    .map((selector) => document.querySelector(selector))
    .filter((el) => el !== null);
  if (sheets.length === 0) {
    return;
  }
  let lastY = window.scrollY;
  let skew = 0;
  let frame = null;
  const step = () => {
    const y = window.scrollY;
    const target = Math.max(-1.4, Math.min(1.4, (y - lastY) * 0.05));
    lastY = y;
    skew += (target - skew) * 0.11;
    const settled = target === 0 && Math.abs(skew) < 0.004;
    if (settled) {
      skew = 0;
    }
    for (const el of sheets) {
      el.style.transform = settled ? "" : `skewY(${skew}deg)`;
    }
    frame = settled ? null : requestAnimationFrame(step);
  };
  window.addEventListener(
    "scroll",
    () => {
      if (frame === null) {
        frame = requestAnimationFrame(step);
      }
    },
    { passive: true, signal },
  );
  teardowns.push(() => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
    }
    for (const el of sheets) {
      el.style.transform = "";
    }
  });
}

/**
 * The marquee stops being a clock and starts listening to the page: it keeps
 * the CSS cadence as its idle speed, but scrolling shoves it — harder with
 * faster scrolling — and scrolling upward reverses it, the direction
 * lingering until the next change of mind. The CSS animation is parked with
 * an inline `animation: none` while this drives (making the hover-pause rule
 * inert, deliberately — a strip that answers scrolling should not also stop
 * for the pointer), and teardown hands the strip straight back to it.
 * Runs only while the strip is anywhere near the viewport.
 */
function liveMarquee(inView, signal) {
  const track = document.querySelector(".marquee-track");
  if (track === null) {
    return;
  }
  const strip = track.closest(".marquee") ?? track;
  let half = track.scrollWidth / 2;
  if (half === 0) {
    // An empty strip has no cadence to keep, and 0 would poison the wrap
    // arithmetic below; the CSS animation can keep the corpse.
    return;
  }
  window.addEventListener(
    "resize",
    () => {
      half = track.scrollWidth / 2;
    },
    { signal },
  );
  track.style.animation = "none";
  let x = 0;
  let dir = -1;
  let boost = 0;
  let lastY = window.scrollY;
  let lastT = null;
  let frame = null;
  const step = (now) => {
    const dt = lastT === null ? 0.016 : Math.min((now - lastT) / 1000, 0.05);
    lastT = now;
    const y = window.scrollY;
    const moved = y - lastY;
    lastY = y;
    if (moved !== 0) {
      dir = moved > 0 ? -1 : 1;
      boost = Math.min(boost + Math.abs(moved) * 5, 1800);
    }
    boost *= Math.exp(-3.2 * dt);
    if (boost < 1) {
      boost = 0;
    }
    // half/40s is exactly the cadence the CSS animation had.
    x += dir * (half / 40 + boost) * dt;
    x %= half;
    if (x > 0) {
      x -= half;
    }
    track.style.transform = `translate3d(${x}px, 0, 0)`;
    frame = requestAnimationFrame(step);
  };
  const start = () => {
    if (frame === null) {
      lastY = window.scrollY;
      lastT = null;
      frame = requestAnimationFrame(step);
    }
  };
  const stop = () => {
    if (frame !== null) {
      cancelAnimationFrame(frame);
      frame = null;
    }
  };
  const watching = inView(
    strip,
    () => {
      start();
      return stop;
    },
    { margin: "100px 0px 100px 0px" },
  );
  teardowns.push(() => {
    watching();
    stop();
    track.style.animation = "";
    track.style.transform = "";
  });
}

/**
 * Rebuild the marketing illustration from the same visual primitives and
 * content as the real Kumi channel. The large channel surface and the lifted
 * coordination thread mirror Ando's product-first composition: the product
 * stays legible in the back while one important interaction is brought close.
 *
 * This happens even when motion is disabled. The old source markup remains a
 * no-script fallback; once this module runs, there is only one version of the
 * product story for animation and accessibility to describe.
 */
function mountCoordinationShowcase() {
  const stage = document.querySelector("[data-coordination-stage]");
  if (stage === null) {
    return;
  }

  stage.classList.add("coord-product-stage");
  stage.setAttribute("role", "img");
  stage.setAttribute(
    "aria-label",
    "A Kumi channel coordinating Rhea and Hera while they build an expense tracker",
  );
  stage.innerHTML = `
    <div class="kumi-demo-glow" aria-hidden="true"></div>
    <div class="kumi-demo-depth" aria-hidden="true">
      <div class="kumi-demo-perspective">
        <div class="kumi-demo-shell" data-coord-shell>
          <div class="kumi-demo-app">
            <aside class="kumi-demo-rail" aria-label="Repositories">
              <span class="kumi-demo-rail-menu" aria-hidden="true"><i></i><i></i><i></i></span>
              <span class="kumi-demo-repo"><b>C</b><i></i></span>
              <span class="kumi-demo-repo"><b>K</b><i></i></span>
              <span class="kumi-demo-repo active"><b>T</b><i></i></span>
              <span class="kumi-demo-repo"><b>W</b><i></i></span>
              <span class="kumi-demo-add" aria-hidden="true">+</span>
            </aside>

            <section class="kumi-demo-channel" aria-label="Testtwo channel">
              <header class="kumi-demo-channel-head">
                <div>
                  <strong>Testtwo</strong>
                  <span><i class="kumi-demo-person" aria-hidden="true"></i> 1&nbsp;&nbsp; <i class="kumi-demo-bot" aria-hidden="true"></i> 3&nbsp;&nbsp;|&nbsp;&nbsp;⌁</span>
                </div>
                <span class="kumi-demo-more" aria-hidden="true">•••</span>
              </header>

              <div class="kumi-demo-feed">
                <div class="kumi-demo-day"><span>Today</span></div>

                <article class="kumi-demo-post" data-coord-item>
                  <span class="kumi-demo-avatar">NA</span>
                  <div>
                    <p class="kumi-demo-meta"><strong>Nathan</strong><time>5:24 PM</time></p>
                    <p class="kumi-demo-request">Build me a small command-line expense tracker in TypeScript. I want to add an expense, list everything I’ve added, and keep it there next time I run it.</p>
                  </div>
                </article>

                <div class="kumi-demo-thread-count" data-coord-item>
                  <span class="kumi-demo-openai" aria-hidden="true">✦</span>
                  <strong>2 replies</strong>
                </div>

                <article class="kumi-demo-reply" data-coord-item>
                  <span class="kumi-demo-agent-mark rhea" aria-hidden="true"><i></i></span>
                  <div>
                    <p><strong>@Rhea</strong> I want to be able to search my expenses for a word and see just the ones that match.</p>
                    <small><i></i> 1 reply <span>Writing code</span></small>
                  </div>
                </article>

                <article class="kumi-demo-reply" data-coord-item>
                  <span class="kumi-demo-agent-mark hera" aria-hidden="true"><i></i></span>
                  <div>
                    <p><strong>@Hera</strong> I want to set a monthly spending limit and have it warn me when I’ve gone over it.</p>
                    <small><i></i> 1 reply <span>Writing code</span></small>
                  </div>
                </article>

                <div class="kumi-demo-thinking" data-coord-item><b>• • •</b> Rhea &amp; Hera are thinking</div>
              </div>

              <div class="kumi-demo-composer" aria-hidden="true">
                <span>+</span><p>Message #Testtwo</p><b>→</b>
              </div>
            </section>
          </div>
        </div>
      </div>

      <aside class="kumi-demo-focus" data-coord-focus aria-label="Kumi coordination decision">
        <header>
          <span class="kumi-demo-focus-icon" aria-hidden="true">⚖</span>
          <div><small>Coordination</small><strong>Plans ordered before edits</strong></div>
          <span class="kumi-demo-close" aria-hidden="true">×</span>
        </header>
        <div class="kumi-demo-focus-body">
          <article data-coord-item>
            <span class="kumi-demo-agent-mark rhea" aria-hidden="true"><i></i></span>
            <div><p><strong>Rhea</strong> is implementing search</p><small><i></i> Working in <code>search.ts</code></small></div>
            <b class="kumi-demo-live">LIVE</b>
          </article>
          <div class="kumi-demo-order" data-coord-item>
            <span aria-hidden="true">↳</span>
            <p><strong>Conflict resolved</strong>Hera takes <code>index.ts</code> when Rhea is done.</p>
          </div>
          <article data-coord-item>
            <span class="kumi-demo-agent-mark hera" aria-hidden="true"><i></i></span>
            <div><p><strong>Hera</strong> is adding budget limits</p><small><i></i> 8 files granted now</small></div>
            <b class="kumi-demo-queued">ORDERED</b>
          </article>
        </div>
        <footer data-coord-item>
          <span class="kumi-demo-check">✓</span>
          <p><strong>One shared history</strong><small>18 tests pass before promotion</small></p>
          <code>7ac41d2</code>
        </footer>
      </aside>
    </div>
  `;

  if (document.querySelector("#kumi-product-demo-styles") !== null) {
    return;
  }
  const style = document.createElement("style");
  style.id = "kumi-product-demo-styles";
  style.textContent = `
    .coord-product-stage {
      --stage-rx: 0deg;
      --stage-ry: 0deg;
      max-width: 1020px;
      min-height: 760px;
      padding: 24px 34px 86px;
    }

    .kumi-demo-glow {
      position: absolute;
      z-index: -1;
      inset: 3% 2% 1%;
      border-radius: 42%;
      background:
        radial-gradient(circle at 18% 24%, rgb(216 137 115 / 24%), transparent 37%),
        radial-gradient(circle at 82% 72%, rgb(168 148 182 / 24%), transparent 39%);
      filter: blur(58px);
      pointer-events: none;
    }

    .kumi-demo-depth {
      position: relative;
      min-height: 650px;
    }

    .kumi-demo-perspective {
      position: relative;
      width: min(100%, 850px);
      margin: 0 auto;
      transform: rotateX(var(--stage-rx)) rotateY(var(--stage-ry));
      transform-style: preserve-3d;
      transition: transform 0.55s var(--ease-motion);
    }

    .kumi-demo-shell {
      position: relative;
      overflow: hidden;
      height: 620px;
      border: 1px solid #3a3633;
      border-radius: 28px;
      background: #141211;
      box-shadow:
        0 52px 110px rgb(0 0 0 / 55%),
        inset 0 1px rgb(255 255 255 / 6%);
      transform-origin: 50% 100%;
    }

    .kumi-demo-shell::before {
      content: "";
      position: absolute;
      z-index: 3;
      inset: 0;
      border-radius: inherit;
      box-shadow: inset 0 0 0 8px rgb(255 255 255 / 1.5%);
      pointer-events: none;
    }

    .kumi-demo-app {
      display: grid;
      grid-template-columns: 108px 1fr;
      height: 100%;
      color: #f4f0ea;
      background: #12100f;
      font-family: var(--font);
      line-height: 1.45;
    }

    .kumi-demo-rail {
      display: flex;
      align-items: center;
      flex-direction: column;
      gap: 12px;
      padding: 24px 14px;
      border-right: 1px solid #2c2927;
      background: #151312;
    }

    .kumi-demo-rail-menu {
      display: grid;
      gap: 3px;
      width: 24px;
      margin: 2px 0 10px;
    }

    .kumi-demo-rail-menu i {
      width: 19px;
      height: 2px;
      border-radius: 9px;
      background: #85807b;
    }

    .kumi-demo-repo {
      position: relative;
      display: grid;
      place-items: center;
      width: 58px;
      height: 58px;
      border: 1px solid transparent;
      border-radius: 17px;
      background: #2b2825;
      color: #b9b2aa;
      font-size: 18px;
    }

    .kumi-demo-repo.active {
      border-color: rgb(216 137 115 / 18%);
      background: #302925;
      box-shadow: 0 0 0 5px rgb(216 137 115 / 5%);
      color: #eee7df;
    }

    .kumi-demo-repo i {
      position: absolute;
      right: -4px;
      bottom: -3px;
      width: 20px;
      height: 20px;
      border: 3px solid #151312;
      border-radius: 50%;
      background: #24211f;
    }

    .kumi-demo-repo i::before,
    .kumi-demo-repo i::after {
      content: "";
      position: absolute;
      top: 8px;
      left: 5px;
      width: 7px;
      height: 1px;
      background: #9b948d;
      transform: rotate(-45deg);
    }

    .kumi-demo-repo i::after {
      top: 10px;
      left: 8px;
      width: 3px;
    }

    .kumi-demo-add {
      color: #85807b;
      font-size: 30px;
      font-weight: 300;
      line-height: 1;
    }

    .kumi-demo-channel {
      position: relative;
      min-width: 0;
      background: #12100f;
    }

    .kumi-demo-channel-head {
      display: flex;
      align-items: center;
      justify-content: space-between;
      height: 84px;
      padding: 0 38px;
      border-bottom: 1px solid #2d2927;
      background: rgb(18 16 15 / 94%);
    }

    .kumi-demo-channel-head > div {
      display: flex;
      flex-direction: column;
    }

    .kumi-demo-channel-head strong {
      font-size: 20px;
      line-height: 1.25;
      letter-spacing: -0.025em;
    }

    .kumi-demo-channel-head span {
      display: flex;
      align-items: center;
      color: #85807b;
      font-size: 11px;
    }

    .kumi-demo-person,
    .kumi-demo-bot {
      position: relative;
      display: inline-block;
      width: 12px;
      height: 9px;
      margin-right: 3px;
      border: 1px solid #85807b;
      border-radius: 8px 8px 4px 4px;
    }

    .kumi-demo-person::before,
    .kumi-demo-bot::before {
      content: "";
      position: absolute;
      top: -7px;
      left: 3px;
      width: 4px;
      height: 4px;
      border: 1px solid #85807b;
      border-radius: 50%;
      background: #12100f;
    }

    .kumi-demo-bot { border-radius: 2px; }
    .kumi-demo-more { font-size: 15px !important; letter-spacing: 2px; }

    .kumi-demo-feed {
      max-width: 650px;
      height: 460px;
      margin: 0 auto;
      padding: 20px 36px 92px;
      overflow: hidden;
    }

    .kumi-demo-day {
      display: flex;
      align-items: center;
      gap: 12px;
      margin-bottom: 18px;
      color: #7f7973;
      font-size: 10px;
      font-weight: 650;
    }

    .kumi-demo-day::before,
    .kumi-demo-day::after {
      content: "";
      flex: 1;
      height: 1px;
      background: #292624;
    }

    .kumi-demo-day span {
      padding: 3px 11px;
      border: 1px solid #2d2a27;
      border-radius: 999px;
    }

    .kumi-demo-post {
      display: grid;
      grid-template-columns: 45px 1fr;
      gap: 14px;
    }

    .kumi-demo-avatar {
      display: grid;
      place-items: center;
      width: 44px;
      height: 44px;
      border-radius: 50%;
      background: #df8971;
      color: #fff8f2;
      font-size: 13px;
      font-weight: 750;
    }

    .kumi-demo-meta {
      display: flex;
      align-items: baseline;
      gap: 8px;
      margin-bottom: 4px;
      line-height: 1.3;
    }

    .kumi-demo-meta strong { font-size: 15px; }
    .kumi-demo-meta time { color: #6f6964; font-size: 10px; font-weight: 650; }

    .kumi-demo-request {
      max-width: 51ch;
      color: #e8e2dc;
      font-size: 13px;
      font-weight: 560;
      line-height: 1.55;
    }

    .kumi-demo-thread-count {
      display: flex;
      align-items: center;
      gap: 9px;
      margin: 12px 0 8px 59px;
      color: #b39bc2;
      font-size: 12px;
    }

    .kumi-demo-openai {
      display: grid;
      place-items: center;
      width: 20px;
      height: 20px;
      border: 1px solid #aaa39d;
      border-radius: 50%;
      color: #ddd6d0;
      font-size: 10px;
    }

    .kumi-demo-reply {
      display: grid;
      grid-template-columns: 30px 1fr;
      gap: 9px;
      margin: 9px 0 0 59px;
    }

    .kumi-demo-agent-mark {
      position: relative;
      display: grid;
      place-items: center;
      flex: 0 0 auto;
      width: 28px;
      height: 28px;
      border: 1px solid #4a4642;
      border-radius: 8px;
      background: linear-gradient(135deg, #68625d 0 48%, #282522 49%);
      transform: rotate(45deg);
    }

    .kumi-demo-agent-mark.hera {
      background: conic-gradient(from 28deg, #d9d2ca, #3b3734, #8e8881, #24211f, #d9d2ca);
      border-radius: 50%;
    }

    .kumi-demo-agent-mark i {
      position: absolute;
      right: -4px;
      bottom: -3px;
      width: 7px;
      height: 7px;
      border: 2px solid #12100f;
      border-radius: 50%;
      background: #57d68b;
    }

    .kumi-demo-reply p {
      color: #e6dfd8;
      font-size: 12px;
      font-weight: 540;
      line-height: 1.5;
    }

    .kumi-demo-reply p strong {
      display: inline-block;
      margin-right: 4px;
      border-radius: 4px;
      padding: 0 4px;
      background: rgb(216 137 115 / 12%);
      color: #df927c;
    }

    .kumi-demo-reply small {
      display: flex;
      align-items: center;
      gap: 5px;
      margin-top: 2px;
      color: #b39bc2;
      font-size: 9px;
      font-weight: 650;
    }

    .kumi-demo-reply small i {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #59d98d;
      box-shadow: 0 0 0 3px rgb(89 217 141 / 8%);
    }

    .kumi-demo-reply small span { color: #716b65; }

    .kumi-demo-thinking {
      margin: 18px 0 0 59px;
      border-top: 1px solid #292624;
      padding-top: 11px;
      color: #77716b;
      font-size: 11px;
      font-weight: 650;
    }

    .kumi-demo-thinking b {
      margin-right: 6px;
      color: #9d9690;
      letter-spacing: 2px;
    }

    .kumi-demo-composer {
      position: absolute;
      right: 32px;
      bottom: 26px;
      left: 32px;
      display: grid;
      grid-template-columns: 28px 1fr 28px;
      align-items: center;
      min-height: 64px;
      padding: 0 17px;
      border: 1px solid #3a3633;
      border-radius: 18px;
      background: #2b2825;
      color: #77716b;
      box-shadow: 0 12px 35px rgb(0 0 0 / 18%);
    }

    .kumi-demo-composer span { font-size: 23px; font-weight: 300; }
    .kumi-demo-composer p { font-size: 14px; font-weight: 580; }
    .kumi-demo-composer b { font-size: 22px; font-weight: 300; text-align: right; }

    .kumi-demo-focus {
      position: absolute;
      z-index: 5;
      right: -2px;
      bottom: -36px;
      width: min(470px, calc(100% - 90px));
      overflow: hidden;
      border: 1px solid #49433f;
      border-radius: 22px;
      background: rgb(31 28 26 / 96%);
      box-shadow:
        0 38px 80px rgb(0 0 0 / 58%),
        inset 0 1px rgb(255 255 255 / 5%);
      backdrop-filter: blur(18px);
      -webkit-backdrop-filter: blur(18px);
      transform-origin: 82% 100%;
    }

    .kumi-demo-focus > header {
      display: grid;
      grid-template-columns: 36px 1fr 24px;
      align-items: center;
      gap: 11px;
      padding: 15px 18px;
      border-bottom: 1px solid #3a3532;
      background: rgb(39 35 33 / 85%);
    }

    .kumi-demo-focus-icon {
      display: grid;
      place-items: center;
      width: 34px;
      height: 34px;
      border-radius: 10px;
      background: rgb(216 137 115 / 12%);
      color: #df927c;
      font-size: 15px;
    }

    .kumi-demo-focus header div {
      display: flex;
      flex-direction: column;
      line-height: 1.25;
    }

    .kumi-demo-focus header small {
      color: #8a837c;
      font-size: 8px;
      font-weight: 700;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .kumi-demo-focus header strong { margin-top: 2px; font-size: 12px; }
    .kumi-demo-close { color: #8a837c; font-size: 21px; font-weight: 300; text-align: right; }

    .kumi-demo-focus-body { padding: 4px 18px; }

    .kumi-demo-focus-body > article {
      display: grid;
      grid-template-columns: 29px 1fr auto;
      align-items: center;
      gap: 10px;
      padding: 12px 0;
    }

    .kumi-demo-focus-body article > div { line-height: 1.35; }
    .kumi-demo-focus-body article p { color: #d9d2cb; font-size: 10px; }
    .kumi-demo-focus-body article p strong { color: #f0ebe5; font-size: 11px; }
    .kumi-demo-focus-body article small { color: #77716b; font-size: 8px; }
    .kumi-demo-focus-body code,
    .kumi-demo-focus footer code { font-family: var(--mono); }

    .kumi-demo-live,
    .kumi-demo-queued {
      border-radius: 999px;
      padding: 3px 6px;
      color: #78c792;
      background: rgb(87 214 139 / 8%);
      font-family: var(--mono);
      font-size: 6px;
      letter-spacing: 0.06em;
    }

    .kumi-demo-queued {
      color: #c1aacd;
      background: rgb(168 148 182 / 10%);
    }

    .kumi-demo-order {
      display: grid;
      grid-template-columns: 25px 1fr;
      align-items: center;
      gap: 8px;
      margin: 0 5px;
      border: 1px solid rgb(216 137 115 / 18%);
      border-radius: 11px;
      padding: 8px 10px;
      background: linear-gradient(90deg, rgb(216 137 115 / 7%), rgb(168 148 182 / 5%));
    }

    .kumi-demo-order > span { color: #df927c; font-size: 16px; }
    .kumi-demo-order p { display: flex; flex-direction: column; color: #8e877f; font-size: 8px; line-height: 1.35; }
    .kumi-demo-order strong { color: #cfc7c0; font-size: 9px; }

    .kumi-demo-focus > footer {
      display: flex;
      align-items: center;
      gap: 10px;
      padding: 11px 18px;
      border-top: 1px solid #393532;
      background: rgb(87 214 139 / 4%);
    }

    .kumi-demo-check {
      display: grid;
      place-items: center;
      width: 22px;
      height: 22px;
      border-radius: 50%;
      background: #65bd82;
      color: #132218;
      font-size: 11px;
      font-weight: 800;
    }

    .kumi-demo-focus footer p { display: flex; flex: 1; flex-direction: column; line-height: 1.35; }
    .kumi-demo-focus footer strong { color: #d9e8dc; font-size: 9px; }
    .kumi-demo-focus footer small { color: #718276; font-size: 7px; }
    .kumi-demo-focus footer code { color: #708075; font-size: 7px; }

    html.anim .kumi-demo-shell,
    html.anim [data-coord-item],
    html.anim [data-coord-focus] {
      opacity: 0;
    }

    @media (max-width: 900px) {
      .coord-product-stage {
        min-height: 720px;
        margin-inline: -18px;
        padding: 20px 18px 80px;
      }

      .kumi-demo-app { grid-template-columns: 78px 1fr; }
      .kumi-demo-rail { padding-inline: 9px; }
      .kumi-demo-repo { width: 48px; height: 48px; border-radius: 14px; }
      .kumi-demo-channel-head { padding-inline: 25px; }
      .kumi-demo-feed { padding-inline: 24px; }
      .kumi-demo-focus { right: 8px; }
    }

    @media (max-width: 600px) {
      .coord-product-stage {
        min-height: 680px;
        padding: 8px 4px 72px;
      }

      .kumi-demo-depth { min-height: 610px; }
      .kumi-demo-shell { height: 590px; border-radius: 22px; }
      .kumi-demo-app { grid-template-columns: 58px 1fr; }
      .kumi-demo-rail { gap: 11px; padding: 20px 6px; }
      .kumi-demo-rail-menu { width: 20px; }
      .kumi-demo-repo { width: 38px; height: 38px; border-radius: 11px; font-size: 13px; }
      .kumi-demo-repo i { width: 16px; height: 16px; }
      .kumi-demo-repo i::before { top: 6px; left: 3px; }
      .kumi-demo-repo i::after { top: 8px; left: 6px; }
      .kumi-demo-channel-head { height: 72px; padding: 0 16px; }
      .kumi-demo-channel-head strong { font-size: 16px; }
      .kumi-demo-feed { height: 450px; padding: 15px 14px 90px; }
      .kumi-demo-post { grid-template-columns: 37px 1fr; gap: 10px; }
      .kumi-demo-avatar { width: 36px; height: 36px; font-size: 10px; }
      .kumi-demo-request { display: -webkit-box; overflow: hidden; font-size: 11px; -webkit-box-orient: vertical; -webkit-line-clamp: 3; }
      .kumi-demo-meta strong { font-size: 13px; }
      .kumi-demo-thread-count,
      .kumi-demo-reply,
      .kumi-demo-thinking { margin-left: 47px; }
      .kumi-demo-reply p { font-size: 10px; }
      .kumi-demo-reply small { font-size: 8px; }
      .kumi-demo-composer { right: 12px; bottom: 18px; left: 12px; min-height: 55px; border-radius: 15px; }
      .kumi-demo-composer p { font-size: 11px; }
      .kumi-demo-focus { right: 8px; bottom: -28px; width: calc(100% - 78px); }
      .kumi-demo-focus > header { grid-template-columns: 31px 1fr 18px; padding: 11px 12px; }
      .kumi-demo-focus-icon { width: 29px; height: 29px; }
      .kumi-demo-focus-body { padding-inline: 12px; }
      .kumi-demo-focus-body > article { padding: 9px 0; }
      .kumi-demo-focus > footer { padding: 9px 12px; }
    }

    @media (prefers-reduced-motion: reduce) {
      .kumi-demo-perspective { transform: none !important; transition: none; }
      .kumi-demo-shell,
      [data-coord-item],
      [data-coord-focus] { opacity: 1 !important; transform: none !important; }
    }
  `;
  document.head.append(style);
}

/**
 * Bring the real product surface in as one object, then let the conversation
 * and its lifted coordination decision resolve in reading order. Separate
 * wrappers own entrance, scroll depth, and pointer perspective so transforms
 * compose instead of competing for the same element.
 */
function wireCoordinationShowcase(
  { animate, inView, stagger, scroll },
  fine,
  signal,
) {
  const stage = document.querySelector("[data-coordination-stage]");
  if (stage === null) {
    return;
  }

  const shell = stage.querySelector("[data-coord-shell]");
  const feedItems = stage.querySelectorAll(
    ".kumi-demo-feed [data-coord-item]",
  );
  const focus = stage.querySelector("[data-coord-focus]");
  const focusItems = stage.querySelectorAll(
    ".kumi-demo-focus [data-coord-item]",
  );
  inView(
    stage,
    () => {
      if (shell !== null) {
        animate(
          shell,
          {
            opacity: [0, 1],
            transform: [
              "translateY(52px) scale(0.95) rotateX(5deg)",
              "translateY(0px) scale(1) rotateX(0deg)",
            ],
          },
          { duration: 1.05, ease: EXPO },
        );
      }
      animate(
        feedItems,
        { opacity: [0, 1], transform: ["translateY(14px)", "translateY(0px)"] },
        { duration: 0.55, delay: stagger(0.1, { startDelay: 0.38 }), ease: EASE },
      );
      if (focus !== null) {
        animate(
          focus,
          {
            opacity: [0, 1],
            transform: [
              "translateY(74px) scale(0.92)",
              "translateY(0px) scale(1)",
            ],
          },
          { duration: 0.9, delay: 0.72, ease: EXPO },
        );
        animate(
          focusItems,
          {
            opacity: [0, 1],
            transform: ["translateY(10px)", "translateY(0px)"],
          },
          {
            duration: 0.46,
            delay: stagger(0.08, { startDelay: 0.9 }),
            ease: EASE,
          },
        );
      }
    },
    { margin: "0px 0px -14% 0px" },
  );

  const depth = stage.querySelector(".kumi-demo-depth");
  if (depth !== null) {
    scroll(animate(depth, { y: [42, -30] }, { ease: "linear" }), {
      target: stage,
      offset: ["start end", "end start"],
    });
  }
  const glow = stage.querySelector(".kumi-demo-glow");
  if (glow !== null) {
    scroll(animate(glow, { y: [38, -26] }, { ease: "linear" }), {
      target: stage,
      offset: ["start end", "end start"],
    });
  }

  if (!fine) {
    return;
  }
  stage.addEventListener(
    "pointermove",
    (event) => {
      const box = stage.getBoundingClientRect();
      const x = (event.clientX - box.left) / box.width - 0.5;
      const y = (event.clientY - box.top) / box.height - 0.5;
      stage.style.setProperty("--stage-rx", `${y * -1.5}deg`);
      stage.style.setProperty("--stage-ry", `${x * 2.2}deg`);
    },
    { signal },
  );
  stage.addEventListener(
    "pointerleave",
    () => {
      stage.style.setProperty("--stage-rx", "0deg");
      stage.style.setProperty("--stage-ry", "0deg");
    },
    { signal },
  );
  teardowns.push(() => {
    stage.style.removeProperty("--stage-rx");
    stage.style.removeProperty("--stage-ry");
  });
}
