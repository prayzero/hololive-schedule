import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import test from "node:test";
import { pathToFileURL } from "node:url";

const compileDirectory = mkdtempSync(join(tmpdir(), "holo-date-strip-"));
let scrolling;
try {
  execFileSync(process.execPath, [
    resolve("node_modules/typescript/bin/tsc"), resolve("src/dateStripScroll.ts"),
    "--ignoreConfig", "--target", "ES2022", "--module", "ESNext",
    "--moduleResolution", "Bundler", "--skipLibCheck", "--outDir", compileDirectory,
  ], { stdio: "pipe" });
  scrolling = await import(pathToFileURL(join(compileDirectory, "dateStripScroll.js")).href);
} finally {
  assert.equal(dirname(resolve(compileDirectory)), resolve(tmpdir()));
  rmSync(compileDirectory, { recursive: true, force: true });
}
const { enableDateStripDrag, centerSelectedDate } = scrolling;

class DateStrip extends EventTarget {
  scrollLeft = 300;
  scrollWidth = 1500;
  clientWidth = 300;
  clientLeft = 0;
  dataset = {};
  captured = new Set();
  scrollTo({ left }) { this.scrollLeft = left; }
  setPointerCapture(id) { this.captured.add(id); }
  hasPointerCapture(id) { return this.captured.has(id); }
  releasePointerCapture(id) { this.captured.delete(id); }
  getBoundingClientRect() { return { left: 250, width: this.clientWidth }; }
}

function send(strip, type, overrides = {}) {
  const event = new Event(type, { cancelable: true, bubbles: true });
  Object.assign(event, {
    pointerId: 1, pointerType: "mouse", isPrimary: true,
    button: 0, buttons: 1, clientX: 200, clientY: 20, detail: 1,
    ...overrides,
  });
  strip.dispatchEvent(event);
  return event;
}

test("dragging moves dates both ways and does not select the released date", () => {
  const strip = new DateStrip();
  const dispose = enableDateStripDrag(strip);
  send(strip, "pointerdown");
  const move = send(strip, "pointermove", { clientX: 100 });
  assert.equal(strip.scrollLeft, 400);
  assert.equal(move.defaultPrevented, true);
  assert.equal(strip.hasPointerCapture(1), true);
  send(strip, "pointermove", { clientX: 280 });
  assert.equal(strip.scrollLeft, 220);
  send(strip, "pointerup");
  assert.equal(strip.hasPointerCapture(1), false);
  assert.equal(strip.dataset.dragging, undefined);
  assert.equal(send(strip, "click").defaultPrevented, true);

  // A fresh ordinary click after dragging still selects a date.
  send(strip, "pointerdown");
  send(strip, "pointerup");
  assert.equal(send(strip, "click").defaultPrevented, false);
  dispose();
});

test("small movements remain clicks and keyboard activation works after dragging", () => {
  const strip = new DateStrip();
  const dispose = enableDateStripDrag(strip);
  send(strip, "pointerdown");
  send(strip, "pointermove", { clientX: 203 });
  send(strip, "pointerup");
  assert.equal(strip.scrollLeft, 300);
  assert.equal(send(strip, "click").defaultPrevented, false);
  send(strip, "pointerdown");
  send(strip, "pointermove", { clientX: 100 });
  send(strip, "pointerup");
  assert.equal(send(strip, "click", { detail: 0 }).defaultPrevented, false);
  dispose();
});

test("touch, pen, right click and secondary pointers retain their native behavior", () => {
  for (const pointer of [
    { pointerType: "touch" }, { pointerType: "pen" }, { button: 2 }, { isPrimary: false },
  ]) {
    const strip = new DateStrip();
    const dispose = enableDateStripDrag(strip);
    send(strip, "pointerdown", pointer);
    const move = send(strip, "pointermove", { ...pointer, clientX: 80 });
    assert.equal(move.defaultPrevented, false);
    assert.equal(strip.scrollLeft, 300);
    assert.equal(strip.captured.size, 0);
    dispose();
  }
});

test("vertical movement does not start a horizontal drag", () => {
  const strip = new DateStrip();
  const dispose = enableDateStripDrag(strip);
  send(strip, "pointerdown");
  const move = send(strip, "pointermove", { clientX: 210, clientY: 100 });
  assert.equal(move.defaultPrevented, false);
  assert.equal(strip.scrollLeft, 300);
  dispose();
});

test("cancel, lost capture and released buttons end the drag", () => {
  for (const end of ["pointercancel", "lostpointercapture", "pointermove"]) {
    const strip = new DateStrip();
    const dispose = enableDateStripDrag(strip);
    send(strip, "pointerdown");
    send(strip, "pointermove", { clientX: 100 });
    send(strip, end, { buttons: 0 });
    send(strip, "pointermove", { clientX: 50 });
    assert.equal(strip.scrollLeft, 400);
    assert.equal(strip.captured.size, 0);
    assert.equal(strip.dataset.dragging, undefined);
    dispose();
  }
});

test("scrolling stops at both ends and short lists do not capture input", () => {
  const strip = new DateStrip();
  const dispose = enableDateStripDrag(strip);
  send(strip, "pointerdown");
  send(strip, "pointermove", { clientX: 2000 });
  assert.equal(strip.scrollLeft, 0);
  send(strip, "pointermove", { clientX: -2000 });
  assert.equal(strip.scrollLeft, 1200);
  send(strip, "pointerup");
  strip.scrollWidth = strip.clientWidth;
  send(strip, "pointerdown");
  const move = send(strip, "pointermove", { clientX: 100 });
  assert.equal(move.defaultPrevented, false);
  assert.equal(strip.captured.size, 0);
  dispose();
});

test("unmount releases capture and removes the input handlers", () => {
  const strip = new DateStrip();
  const dispose = enableDateStripDrag(strip);
  send(strip, "pointerdown");
  send(strip, "pointermove", { clientX: 100 });
  dispose();
  assert.equal(strip.captured.size, 0);
  assert.equal(strip.dataset.dragging, undefined);
  send(strip, "pointerdown");
  send(strip, "pointermove", { clientX: 0 });
  assert.equal(strip.scrollLeft, 400);
  assert.equal(send(strip, "click").defaultPrevented, false);
});

test("selected date is centered relative to its strip, including its page offset", () => {
  const strip = new DateStrip();
  centerSelectedDate(strip, { getBoundingClientRect: () => ({ left: 600, width: 100 }) });
  assert.equal(strip.scrollLeft, 550);
  centerSelectedDate(strip, { getBoundingClientRect: () => ({ left: -1000, width: 100 }) });
  assert.equal(strip.scrollLeft, 0);
  centerSelectedDate(strip, { getBoundingClientRect: () => ({ left: 2000, width: 100 }) });
  assert.equal(strip.scrollLeft, 1200);
});
