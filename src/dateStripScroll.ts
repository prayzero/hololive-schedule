/** Add mouse dragging without taking touch scrolling or button clicks away. */
export function enableDateStripDrag(strip: HTMLElement): () => void {
  let drag: { pointerId: number; x: number; y: number; left: number } | null = null;
  let suppressClick = false;

  const finish = () => {
    const pointerId = drag?.pointerId;
    drag = null;
    delete strip.dataset.dragging;
    if (pointerId !== undefined && strip.hasPointerCapture(pointerId)) {
      strip.releasePointerCapture(pointerId);
    }
  };

  const down = (event: PointerEvent) => {
    suppressClick = false;
    if (event.pointerType !== "mouse" || event.button !== 0 || !event.isPrimary) return;
    if (strip.scrollWidth <= strip.clientWidth) return;
    strip.scrollTo({ left: strip.scrollLeft, behavior: "instant" });
    drag = { pointerId: event.pointerId, x: event.clientX, y: event.clientY, left: strip.scrollLeft };
  };

  const move = (event: PointerEvent) => {
    if (!drag || event.pointerId !== drag.pointerId) return;
    if (!(event.buttons & 1)) {
      finish();
      return;
    }
    const dx = event.clientX - drag.x;
    if (!suppressClick) {
      if (Math.abs(dx) < 6) return;
      if (Math.abs(event.clientY - drag.y) > Math.abs(dx)) {
        finish();
        return;
      }
      suppressClick = true;
      strip.dataset.dragging = "true";
      strip.setPointerCapture(event.pointerId);
    }
    event.preventDefault();
    strip.scrollLeft = Math.max(0, Math.min(strip.scrollWidth - strip.clientWidth, drag.left - dx));
  };

  const end = (event: PointerEvent) => {
    if (event.pointerId === drag?.pointerId) finish();
  };

  const click = (event: MouseEvent) => {
    // Keyboard/assistive activation has detail=0 and must still select a date.
    if (suppressClick && event.detail > 0) {
      event.preventDefault();
      event.stopPropagation();
    }
    suppressClick = false;
  };

  strip.addEventListener("pointerdown", down);
  strip.addEventListener("pointermove", move);
  strip.addEventListener("pointerup", end);
  strip.addEventListener("pointercancel", end);
  strip.addEventListener("lostpointercapture", end);
  strip.addEventListener("click", click, { capture: true });
  return () => {
    finish();
    strip.removeEventListener("pointerdown", down);
    strip.removeEventListener("pointermove", move);
    strip.removeEventListener("pointerup", end);
    strip.removeEventListener("pointercancel", end);
    strip.removeEventListener("lostpointercapture", end);
    strip.removeEventListener("click", click, { capture: true });
  };
}

export function centerSelectedDate(strip: HTMLElement, button: HTMLElement): void {
  const stripRect = strip.getBoundingClientRect();
  const buttonRect = button.getBoundingClientRect();
  strip.scrollTo({
    left: Math.max(0, Math.min(
      strip.scrollWidth - strip.clientWidth,
      strip.scrollLeft + buttonRect.left - stripRect.left - strip.clientLeft
        - (strip.clientWidth - buttonRect.width) / 2,
    )),
    behavior: "instant",
  });
}
