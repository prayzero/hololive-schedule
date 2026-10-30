import { useEffect, useLayoutEffect, useRef } from "react";
import { centerSelectedDate, enableDateStripDrag } from "./dateStripScroll";

type DateOption = { value: string; label: string; count: number };

export function ScheduleDateTabs({ options, selectedDate, onSelect }: {
  options: DateOption[];
  selectedDate: string;
  onSelect: (date: string) => void;
}) {
  const stripRef = useRef<HTMLDivElement>(null);
  const activeButtonRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const strip = stripRef.current;
    if (strip) return enableDateStripDrag(strip);
  }, []);

  // Run on mount too, including when returning from another page.
  useLayoutEffect(() => {
    const strip = stripRef.current;
    const button = activeButtonRef.current;
    if (strip && button) centerSelectedDate(strip, button);
  }, [selectedDate, options]);

  return (
    <div
      ref={stripRef}
      className="date-tabs"
      role="group"
      aria-label="방송 날짜 선택"
      title="좌우로 밀어서 날짜를 찾아보세요"
    >
      {options.map((option) => {
        const isActive = selectedDate === option.value;
        return (
          <button
            type="button"
            key={option.value}
            ref={isActive ? activeButtonRef : undefined}
            className={isActive ? "is-active" : ""}
            aria-current={isActive ? "date" : undefined}
            onClick={() => onSelect(option.value)}
          >
            <span>{option.label}</span>
            <strong>{option.count}</strong>
          </button>
        );
      })}
    </div>
  );
}
