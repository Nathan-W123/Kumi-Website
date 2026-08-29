/*
 * The replay for /demo.
 *
 * The page is already the finished conversation. This module's only job is to
 * take it back to the start and let it happen again, at the pace it happened
 * at — so a visitor sees the thing the product does rather than a screenshot
 * of it having been done.
 *
 * Two rules it inherits from the rest of the site. It never arms the class
 * that hides content: site.js is the only module allowed to do that, because
 * the file that hides is the file that reveals and a missing file must cost
 * the animation and never the page. And motion is an enhancement — asked for
 * reduced motion, this returns before touching anything, leaving every row
 * exactly where the markup put it.
 */

const reduce = window.matchMedia("(prefers-reduced-motion: reduce)");

/** The acts, in the order the caption announces them. */
const ACTS = [
  { at: 1, hold: 900 },
  { at: 4, hold: 900 },
  // The two the whole thing exists to show. A coordinator line is a sentence
  // nobody has read before, and the one after it is the same sentence about a
  // single function rather than a file — they get the time to land.
  { at: 10, hold: 2600 },
  { at: 11, hold: 2900 },
  { at: 13, hold: 1200 },
];

/*
 * The clock. Fifteen rows at BEAT, plus the acts' holds and four caption
 * turns, comes to a minute — which is the length this was asked for and also
 * about the longest anyone watches a loop without deciding.
 *
 * A beat is not a reading speed. It is the pause between one person finishing
 * and the next starting, which is what makes a room read as a room rather than
 * a transcript being pasted in.
 */
const BEAT = 3400;
/** A caption change wants a moment of its own before the room moves again. */
const TURN = 700;
/** After the last row, before the room resets and does it again. */
const LOOP = 3600;

const timers = [];
let stopped = false;

function wait(ms) {
  return new Promise((resolve) => {
    timers.push(setTimeout(resolve, ms));
  });
}

function clear() {
  for (const timer of timers.splice(0)) {
    clearTimeout(timer);
  }
}

function main() {
  const shot = document.querySelector(".demo-shot");
  const cap = document.querySelector(".scene-cap");
  if (shot === null || cap === null) {
    return;
  }
  const feed = shot.querySelector(".shot-feed");
  const rows = [...shot.querySelectorAll("[data-step]")].sort(
    (a, b) => Number(a.dataset.step) - Number(b.dataset.step),
  );
  if (feed === null || rows.length === 0) {
    return;
  }

  const captions = (cap.dataset.caps ?? "").split("|").filter(Boolean);
  const capText = cap.querySelector("span");

  // Every chip that runs through phases while its agent works, and the settled
  // label to put back when it finishes.
  const chips = new Map();
  for (const el of shot.querySelectorAll(".a-status[data-agent][data-busy]")) {
    chips.set(el.dataset.agent, {
      el,
      done: el.textContent,
      phases: (el.dataset.phases ?? "").split("|").filter(Boolean),
    });
  }

  const face = (row) => row.closest(".m")?.querySelector(".agent-face.running");

  function reset() {
    for (const row of rows) {
      row.classList.add("pending");
    }
    for (const { el, done } of chips.values()) {
      el.textContent = done;
      el.classList.remove("busy");
    }
    feed.scrollTop = 0;
    if (capText !== null && captions.length > 0) {
      capText.textContent = captions[0];
    }
  }

  async function turn(index) {
    if (capText === null || captions[index] === undefined) {
      return;
    }
    cap.classList.add("turning");
    await wait(TURN / 2);
    capText.textContent = captions[index];
    cap.classList.remove("turning");
    await wait(TURN / 2);
  }

  /** Walks a chip's phases for as long as its agent is working. */
  function work(agent) {
    const chip = chips.get(agent);
    if (chip === undefined || chip.phases.length === 0) {
      return () => undefined;
    }
    chip.el.classList.add("busy");
    let at = 0;
    chip.el.textContent = chip.phases[0];
    const tick = setInterval(() => {
      at = (at + 1) % chip.phases.length;
      chip.el.textContent = chip.phases[at];
    }, 900);
    timers.push(tick);
    return () => {
      clearInterval(tick);
      chip.el.classList.remove("busy");
      chip.el.textContent = chip.done;
    };
  }

  async function play() {
    reset();
    await wait(900);
    const settle = [];
    let act = 0;

    for (const row of rows) {
      if (stopped) {
        return;
      }
      const step = Number(row.dataset.step);
      const next = ACTS[act];
      if (next !== undefined && step === next.at) {
        if (act > 0) {
          await turn(act);
        }
        act += 1;
      }

      row.classList.remove("pending");
      feed.scrollTop = feed.scrollHeight;

      // A thread link is an agent picking the ask up: its chip starts running
      // here and settles when that agent posts its result.
      const chip = row.querySelector?.(".a-status[data-agent]");
      if (chip !== null && chip !== undefined) {
        settle.push(work(chip.dataset.agent));
      }
      // An agent's own message is that agent finishing.
      if (row.classList.contains("m") && row.querySelector(".agent-name")) {
        const done = settle.shift();
        if (done !== undefined) {
          done();
        }
      }

      const hold = ACTS.find((a) => a.at === step)?.hold ?? 0;
      await wait(BEAT + hold);
    }

    for (const done of settle) {
      done();
    }
    await wait(LOOP);
    if (!stopped) {
      void play();
    }
  }

  function arm() {
    stopped = false;
    void play();
  }

  function disarm() {
    stopped = true;
    clear();
    for (const row of rows) {
      row.classList.remove("pending");
    }
    for (const { el, done } of chips.values()) {
      el.textContent = done;
      el.classList.remove("busy");
    }
  }

  if (reduce.matches) {
    return;
  }
  arm();
  reduce.addEventListener("change", (event) => {
    if (event.matches) {
      disarm();
    } else {
      arm();
    }
  });
}

main();
