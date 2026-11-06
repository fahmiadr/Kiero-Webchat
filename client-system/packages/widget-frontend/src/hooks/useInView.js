import { useEffect, useRef, useState } from 'react';

/**
 * Custom hook to detect if an element is in the viewport using IntersectionObserver.
 * @param {Object} options - IntersectionObserver options
 * @param {boolean} options.triggerOnce - If true, disconnects observer after first intersection
 * @param {Element} options.root - The element that is used as the viewport for checking visibility of the target
 * @param {string} options.rootMargin - Margin around the root
 * @param {number|number[]} options.threshold - Either a single number or an array of numbers which indicate at what percentage of the target's visibility the observer's callback should be executed
 * @returns {Object} - { ref, isInView }
 */
export function useInView({
  triggerOnce = true,
  root = null,
  rootMargin = '0px',
  threshold = 0,
} = {}) {
  const [isInView, setIsInView] = useState(false);
  const ref = useRef(null);

  useEffect(() => {
    const element = ref.current;
    if (!element) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          setIsInView(true);
          if (triggerOnce) {
            observer.disconnect();
          }
        } else if (!triggerOnce) {
          setIsInView(false);
        }
      },
      { root, rootMargin, threshold },
    );

    observer.observe(element);

    return () => {
      observer.disconnect();
    };
  }, [triggerOnce, root, rootMargin, threshold]);

  return { ref, isInView };
}
