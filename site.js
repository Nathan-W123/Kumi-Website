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
 */

const reduceMotion = window.matchMedia("(prefers-reduced-motion: reduce)");
const motion = window.Motion;
const EASE = [0.32, 0.72, 0, 1];

function disarm() {
  document.documentElement.classList.remove("anim");
}

if (reduceMotion.matches || motion === undefined) {
  disarm();
} else {
  // A preference flipped mid-visit is honoured immediately: the CSS block in
  // site.css stops the continuous animations, and dropping the class shows
  // anything still waiting on a scroll reveal.
  reduceMotion.addEventListener("change", () => {
    if (reduceMotion.matches) {
      disarm();
    }
  });
  wire();
}

function wire() {
  const { animate, inView, stagger, hover, press, scroll } = motion;
  const fine =
    window.matchMedia("(hover: hover) and (pointer: fine)").matches;

  // -- Hero: words rise out of their clipped line boxes, then the subhead,
  //    CTAs, and the channel mock follow. The starting offsets came from the
  //    stylesheet (armed by `html.anim`), so the first frame never flashes.
  const words = document.querySelectorAll(".hero h1 .w > span");
  if (words.length > 0) {
    animate(
      words,
      { transform: ["translateY(110%)", "translateY(0%)"] },
      { delay: stagger(0.06), type: "spring", stiffness: 120, damping: 18 },
    );
  }
  const follow = (selector, delay) => {
    const el = document.querySelector(selector);
    if (el === null) {
      return null;
    }
    return animate(
      el,
      { opacity: [0, 1], transform: ["translateY(16px)", "translateY(0px)"] },
      { duration: 0.6, delay, ease: EASE },
    );
  };
  follow(".hero .sub", 0.4);
  follow(".hero-cta", 0.5);
  // Kept: the tilt below must wait for this entrance to finish, because the
  // two would otherwise fight over the same transform.
  const shotEntrance = follow(".hero-shot", 0.65);

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
  //    in place even if scrubbing fails. Both are driven by the visitor's
  //    own scrolling rather than a clock. The reading line fills with page
  //    progress; the aurora drifts down slower than the content (depth, not
  //    attachment) and thins to nothing by the time the hero is gone, so the
  //    sections below sit on clean ground.
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
}
