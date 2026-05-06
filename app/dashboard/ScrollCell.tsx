"use client";

import { useRef } from "react";

export default function ScrollCell({
  text,
  className,
}: {
  text: string | null;
  className?: string;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);
  const tdRef = useRef<HTMLTableCellElement>(null);

  function handleMouseEnter() {
    const span = spanRef.current;
    const td = tdRef.current;
    if (!span || !td) return;
    const overflow = span.scrollWidth - td.clientWidth;
    if (overflow <= 0) return; // no hay texto cortado
    const dur = Math.max(1.5, overflow / 80); // px/s aprox
    span.style.setProperty("--marquee-end", `-${overflow + 8}px`);
    span.style.setProperty("--marquee-dur", `${dur}s`);
    span.style.animation = "none";
    // force reflow
    void span.offsetWidth;
    span.style.animation = `marquee-scroll ${dur}s linear 0.4s 1 forwards`;
  }

  function handleMouseLeave() {
    const span = spanRef.current;
    if (!span) return;
    span.style.animation = "none";
    span.style.transform = "translateX(0)";
  }

  return (
    <td
      ref={tdRef}
      className={`px-4 py-3 scroll-cell ${className ?? ""}`}
      onMouseEnter={handleMouseEnter}
      onMouseLeave={handleMouseLeave}
    >
      <span ref={spanRef}>{text}</span>
    </td>
  );
}
