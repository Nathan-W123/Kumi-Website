/**
 * Every discrete animation on the marketing site, in one module.
 *
 * The library is the vendored Motion UMD bundle (/vendor/motion/motion.js,
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
 * Two kinds of decoration live here. The one-shot kind (entrances, reveals)
 * needs no undoing — once played, it leaves elements exactly where the
 * stylesheet puts them. The standing kind (the pointer layer, the velocity
 * skew, the scroll-driven marquee, the split nav labels) changes the DOM or
 * holds a rAF loop, so each pushes an undo into `teardowns`, and a mid-visit
 * flip to reduced motion runs the lot: the native cursor comes back, inline
 * transforms clear, the marquee hands itself back to its CSS animation.
 * Styles for elements only this module creates are injected from here too —
 * site.css never has to describe machinery that may never exist.
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const motion = window.Motion;
const EASE = [0.32, 0.72, 0, 1];
// The long decelerating tail for the big entrances: almost all of the
// distance in the first third, then a settle slow enough to watch land.
const EXPO = [0.16, 1, 0.3, 1];

// Undo hooks for everything standing — see the header. Run at most once.
const teardowns = [];

function disarm() {
  document.documentElement.classList.remove("anim");
}

if (reduceMotion.matches || motion === undefined) {
  disarm();
} else {
  // A preference flipped mid-visit is honoured immediately: the CSS block in
  // site.css stops the continuous animations, dropping the class shows
  // anything still waiting on a scroll reveal, and the teardowns dismantle
  // everything this module built on top of the markup.
  reduceMotion.addEventListener("change", () => {
    if (reduceMotion.matches) {
      disarm();
      for (const undo of teardowns.splice(0)) {
        undo();
      }
    }
  });
  wire();
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

  injectStyles();

  // -- Hero: the headline rises glyph by glyph out of the clipped word
  //    boxes, each character straightening from a slight lean as it lands.
  //    Then the subhead, CTAs, and the channel mock follow, overlapping the
  //    tail of the headline rather than queueing behind it.
  riseHeadline(animate, stagger);
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
  follow(".hero .sub", 0.55);
  follow(".hero-cta", 0.7);
  // The channel mock lands as an object — settling from a slight overscale
  // instead of sliding in like the text around it. Kept in a named handle:
  // the tilt below must wait for this entrance to finish, because the two
  // would otherwise fight over the same transform.
  const mock = document.querySelector(".hero-shot");
  const shotEntrance =
    mock === null
      ? null
      : animate(
          mock,
          {
            opacity: [0, 1],
            transform: [
              "translateY(34px) scale(1.05)",
              "translateY(0px) scale(1)",
            ],
          },
          { duration: 1.15, delay: 0.85, ease: EXPO },
        );

  // -- Scroll reveals: one behaviour for every section heading, paragraph
  //    block, and card. Bento grids and step rows stagger their children as
  //    a group instead, so neighbours arrive as a family, not a queue.
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

  // -- Nav condenses once the page has moved: transparent over the hero,
  //    blurred ground with a hairline after 40px.
  const nav = document.querySelector(".site-nav");
  if (nav !== null) {
    const settle = () => {
      nav.classList.toggle("scrolled", window.scrollY > 40);
    };
    window.addEventListener("scroll", settle, { passive: true });
    settle();
  }

  // -- Bento cards: a spring lift on hover, and a cursor-following glow fed
  //    by one pointermove listener per grid. Desktop-only by capability, not
  //    user-agent — coarse pointers never see either.
  if (fine) {
    hover(".bento-card", (el) => {
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
    for (const grid of document.querySelectorAll(".bento")) {
      grid.addEventListener("pointermove", (event) => {
        for (const card of grid.querySelectorAll(".bento-card")) {
          const box = card.getBoundingClientRect();
          card.style.setProperty("--mx", `${event.clientX - box.left}px`);
          card.style.setProperty("--my", `${event.clientY - box.top}px`);
        }
      });
    }

    // -- Channel mock: a shallow 3D tilt that follows the cursor and eases
    //    home when it leaves. It waits for the entrance animation to finish
    //    so the two never contest one transform, then writes the style
    //    directly from a single rAF loop — the lerp is the smoothing, and
    //    the loop parks itself the moment the card settles.
    const shot = document.querySelector(".hero-shot");
    if (shot !== null) {
      const begin =
        shotEntrance === null ? Promise.resolve() : shotEntrance.finished;
      begin.then(() => {
        const MAX_DEG = 2.5;
        let targetX = 0;
        let targetY = 0;
        let tiltX = 0;
        let tiltY = 0;
        let frame = null;
        const step = () => {
          tiltX += (targetX - tiltX) * 0.12;
          tiltY += (targetY - tiltY) * 0.12;
          const settled =
            Math.abs(targetX - tiltX) < 0.01 && Math.abs(targetY - tiltY) < 0.01;
          if (settled) {
            tiltX = targetX;
            tiltY = targetY;
          }
          shot.style.transform =
            settled && tiltX === 0 && tiltY === 0
              ? ""
              : `perspective(900px) rotateX(${tiltX}deg) rotateY(${tiltY}deg)`;
          frame = settled ? null : requestAnimationFrame(step);
        };
        const wake = () => {
          if (frame === null) {
            frame = requestAnimationFrame(step);
          }
        };
        shot.addEventListener("pointermove", (event) => {
          const box = shot.getBoundingClientRect();
          targetY = ((event.clientX - box.left) / box.width - 0.5) * 2 * MAX_DEG;
          targetX = (0.5 - (event.clientY - box.top) / box.height) * 2 * MAX_DEG;
          wake();
        });
        shot.addEventListener("pointerleave", () => {
          targetX = 0;
          targetY = 0;
          wake();
        });
      });
    }

    // -- The pointer itself becomes part of the page: a dot that stays on
    //    the pointer and a ring that chases it, stretching along its own
    //    direction of travel and swelling over anything clickable. Magnetic
    //    pull and the split nav labels belong to the same fine-pointer world.
    pointerLayer(signal);
    magnetise(animate, signal);
    splitNavLabels();
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
