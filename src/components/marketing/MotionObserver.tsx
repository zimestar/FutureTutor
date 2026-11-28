"use client";

import { useEffect } from "react";
import { usePathname } from "@/i18n/navigation";

/**
 * HOME-MOTION — reveals `.reveal` blocks and `.reveal-stagger` children as
 * they scroll into view (children of a stagger group arrive one after the
 * other). It only hides anything once it is running (it adds `motion-ready`
 * to <html>), so without JS, or with reduced motion, every element simply
 * stays visible.
 */
export function MotionObserver() {
  const pathname = usePathname();

  useEffect(() => {
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
    if (!("IntersectionObserver" in window)) return;

    const finish = (el: HTMLElement) => {
      el.classList.add("motion-done");
      el.style.transitionDelay = "";
    };

    const reveal = (el: HTMLElement) => {
      const parent = el.parentElement;
      if (parent?.classList.contains("reveal-stagger")) {
        const index = Array.prototype.indexOf.call(parent.children, el);
        el.style.transitionDelay = `${Math.min(index, 4) * 120}ms`;
      }
      el.classList.add("is-in");
      // Hand transitions back to the element's own styles once revealed.
      window.setTimeout(() => finish(el), 1500);
    };

    const targets = Array.from(document.querySelectorAll<HTMLElement>(".reveal, .reveal-stagger > *"));
    const observer = new IntersectionObserver(
      (entries) => {
        for (const entry of entries) {
          if (entry.isIntersecting) {
            reveal(entry.target as HTMLElement);
            observer.unobserve(entry.target);
          }
        }
      },
      { rootMargin: "0px 0px -10% 0px", threshold: 0.1 }
    );
    // Anything already on screen is shown immediately, without a flash.
    for (const el of targets) {
      const box = el.getBoundingClientRect();
      if (box.top < window.innerHeight && box.bottom > 0) {
        el.classList.add("is-in");
        finish(el);
      } else {
        observer.observe(el);
      }
    }
    document.documentElement.classList.add("motion-ready");
    return () => observer.disconnect();
  }, [pathname]);

  return null;
}
