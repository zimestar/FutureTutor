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

    const seen = new WeakSet<Element>();
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

    const track = (root: ParentNode) => {
      for (const el of Array.from(root.querySelectorAll<HTMLElement>(".reveal, .reveal-stagger > *"))) {
        if (seen.has(el)) continue;
        seen.add(el);
        // Anything already on screen is shown immediately, without a flash.
        const box = el.getBoundingClientRect();
        if (box.top < window.innerHeight && box.bottom > 0) {
          el.classList.add("is-in");
          finish(el);
        } else {
          observer.observe(el);
        }
      }
    };

    track(document);
    // Content streamed in later (Suspense, client navigation) is picked up too,
    // so a `.reveal` block can never be left hidden.
    const mutations = new MutationObserver((records) => {
      for (const record of records) {
        for (const node of Array.from(record.addedNodes)) {
          if (node instanceof HTMLElement) track(node.parentElement ?? node);
        }
      }
    });
    mutations.observe(document.body, { childList: true, subtree: true });

    document.documentElement.classList.add("motion-ready");
    return () => {
      observer.disconnect();
      mutations.disconnect();
    };
  }, [pathname]);

  return null;
}
