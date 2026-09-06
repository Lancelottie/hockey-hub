"use client";

import { useLayoutEffect, useRef, type ReactNode } from "react";
import { createPortal } from "react-dom";

/** Keep the picker attached to its shirt without clipping it inside the pitch. */
export default function PositionPicker({ slotId, onClose, children }: {
  slotId: string;
  onClose: () => void;
  children: ReactNode;
}) {
  const popup = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const element = popup.current;
    const anchor = document.querySelector<HTMLButtonElement>(`[data-slot="${slotId}"]`);
    if (!element || !anchor) return;
    const position = () => {
      const rect = anchor.getBoundingClientRect();
      const gap = 8;
      const below = window.innerHeight - rect.bottom - gap * 2;
      const above = rect.top - gap * 2;
      const opensAbove = below < 220 && above > below;
      const room = Math.max(120, opensAbove ? above : below);
      element.style.maxHeight = `${Math.min(440, window.innerHeight - 16, room)}px`;
      const left = Math.min(window.innerWidth - element.offsetWidth - gap, Math.max(gap, rect.left + rect.width / 2 - element.offsetWidth / 2));
      const top = opensAbove ? rect.top - element.offsetHeight - gap : rect.bottom + gap;
      element.style.left = `${left}px`;
      element.style.top = `${Math.max(gap, Math.min(window.innerHeight - element.offsetHeight - gap, top))}px`;
    };
    const outside = (event: PointerEvent) => {
      const target = event.target;
      if (target instanceof Element && !element.contains(target) && !target.closest("[data-slot]")) onClose();
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onClose();
        anchor.focus({ preventScroll: true });
      }
    };
    position();
    const observer = new ResizeObserver(position);
    observer.observe(element);
    observer.observe(anchor);
    window.addEventListener("resize", position);
    window.addEventListener("scroll", position, true);
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", position);
      window.removeEventListener("scroll", position, true);
      document.removeEventListener("pointerdown", outside);
      document.removeEventListener("keydown", escape);
    };
  }, [slotId, onClose]);

  return createPortal(<div ref={popup} id="position-player-picker" role="dialog" aria-label="Choose player for position" className="position-player-picker space-y-3">
    <button type="button" className="float-right rounded border px-2 py-1 text-sm" aria-label="Close player picker" onClick={() => {
      onClose();
      document.querySelector<HTMLButtonElement>(`[data-slot="${slotId}"]`)?.focus({ preventScroll: true });
    }}>Close</button>
    {children}
  </div>, document.body);
}
