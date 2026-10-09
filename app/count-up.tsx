"use client";

import { useEffect, useRef, useState } from "react";

type Props = { value: number; from?: number; decimals?: number; duration?: number };

const reducedMotion = () => window.matchMedia("(prefers-reduced-motion: reduce)").matches;

// Cuenta hacia el valor nuevo desde lo que se esté mostrando. Con "reducir movimiento" salta directo.
export default function CountUp({ value, from, decimals = 0, duration = 1100 }: Props) {
  const [shown, setShown] = useState(from ?? value);
  const current = useRef(shown);

  useEffect(() => {
    const start = current.current;
    if (start === value) return;
    const total = reducedMotion() ? 0 : duration;
    const t0 = performance.now();
    let frame = 0;
    const tick = (now: number) => {
      const progress = total === 0 ? 1 : Math.min(1, (now - t0) / total);
      const next = progress === 1 ? value : start + (value - start) * (1 - (1 - progress) ** 3);
      current.current = next;
      setShown(next);
      if (progress < 1) frame = requestAnimationFrame(tick);
    };
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, [value, duration]);

  const text = (n: number) => n.toLocaleString("es-PA", { minimumFractionDigits: decimals, maximumFractionDigits: decimals });
  return (
    <>
      <span aria-hidden="true">{text(shown)}</span>
      <span className="sr-only">{text(value)}</span>
    </>
  );
}
