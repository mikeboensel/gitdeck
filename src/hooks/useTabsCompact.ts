import { useEffect, useRef, useState } from "react";

/**
 * Collapse the tab bar to icon-only when the full labels would overflow.
 * Overflow-driven (not a fixed breakpoint) so it adapts to label lengths,
 * locale, font, and zoom. We measure available space from the full-width
 * parent (`.tabs-bar`) — the `.tabs` pill itself shrinks to its content, so it
 * can't be measured once collapsed — and remember the natural full-label width
 * so we know when there's room to expand again. The +24px headroom on re-expand
 * prevents flicker right at the boundary.
 *
 * Returns the ref to attach to the `.tabs` pill plus whether it's compact now.
 */
export function useTabsCompact() {
  const tabsRef = useRef<HTMLDivElement>(null);
  const tabsCompactRef = useRef(false);
  const [tabsCompact, setTabsCompact] = useState(false);

  useEffect(() => {
    const tabs = tabsRef.current;
    const bar = tabs?.parentElement;
    if (!tabs || !bar) return;
    let naturalWidth = 0;
    const measure = () => {
      const style = getComputedStyle(bar);
      const available =
        bar.clientWidth -
        Number.parseFloat(style.paddingLeft) -
        Number.parseFloat(style.paddingRight);
      // While expanded, the pill's scrollWidth is the true full-label width.
      if (!tabsCompactRef.current) naturalWidth = tabs.scrollWidth;
      const shouldCompact = tabsCompactRef.current
        ? available < naturalWidth + 24
        : naturalWidth > available;
      if (shouldCompact !== tabsCompactRef.current) {
        tabsCompactRef.current = shouldCompact;
        setTabsCompact(shouldCompact);
      }
    };
    const observer = new ResizeObserver(measure);
    observer.observe(bar);
    measure();
    return () => observer.disconnect();
  }, []);

  return { tabsRef, tabsCompact };
}
