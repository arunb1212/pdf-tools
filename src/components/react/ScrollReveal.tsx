import { useEffect } from "react";

/**
 * Island that observes .reveal elements and adds .reveal--visible when in viewport.
 * Lightweight — no dependencies, uses native Intersection Observer.
 */
export default function ScrollReveal() {
  useEffect(() => {
    // Mark JS as enabled so CSS can apply reveal animations
    document.documentElement.classList.add("js");

    const elements = document.querySelectorAll(".reveal:not(.reveal--visible)");
    if (!elements.length) return;

    // Respect reduced motion preference
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) {
      elements.forEach((el) => el.classList.add("reveal--visible"));
      return;
    }

    const observer = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("reveal--visible");
            observer.unobserve(entry.target);
          }
        });
      },
      {
        threshold: 0.1,
        rootMargin: "0px 0px -50px 0px",
      }
    );

    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, []);

  return null;
}
