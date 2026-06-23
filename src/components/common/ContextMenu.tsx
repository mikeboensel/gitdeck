import { useEffect, useLayoutEffect, useRef, useState } from "react";

/** A position in viewport (clientX/clientY) coordinates. */
export interface ContextMenuPosition {
  x: number;
  y: number;
}

export interface ContextMenuItem {
  /** Stable identifier for the item (used as React key). */
  key: string;
  /** Visible content. */
  label: React.ReactNode;
  onSelect: () => void;
  disabled?: boolean;
  danger?: boolean;
}

interface ContextMenuProps {
  position: ContextMenuPosition;
  items: ContextMenuItem[];
  onClose: () => void;
  /** Accessible label for the menu. */
  ariaLabel?: string;
}

/**
 * Generic right-click context menu. Renders a fixed-position menu whose
 * upper-left corner sits at `position`, and dismisses itself on outside
 * click, Escape, scroll, or resize.
 */
export function ContextMenu({ position, items, onClose, ariaLabel }: ContextMenuProps) {
  const ref = useRef<HTMLDivElement | null>(null);
  const [coords, setCoords] = useState<ContextMenuPosition>(position);

  // Clamp into the viewport so a menu opened near the right/bottom edge stays
  // fully on-screen. Runs before paint to avoid a flash at the raw position.
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const margin = 8;
    const rect = el.getBoundingClientRect();
    const x =
      position.x + rect.width > window.innerWidth - margin
        ? Math.max(margin, window.innerWidth - rect.width - margin)
        : position.x;
    const y =
      position.y + rect.height > window.innerHeight - margin
        ? Math.max(margin, window.innerHeight - rect.height - margin)
        : position.y;
    setCoords({ x, y });
  }, [position.x, position.y]);

  useEffect(() => {
    function handlePointerDown(event: PointerEvent) {
      if (!ref.current?.contains(event.target as Node)) onClose();
    }
    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") onClose();
    }
    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    window.addEventListener("scroll", onClose, true);
    window.addEventListener("resize", onClose);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
      window.removeEventListener("scroll", onClose, true);
      window.removeEventListener("resize", onClose);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      className="context-menu"
      role="menu"
      aria-label={ariaLabel}
      style={{ top: coords.y, left: coords.x }}
      onContextMenu={(event) => event.preventDefault()}
    >
      {items.map((item) => (
        <button
          key={item.key}
          type="button"
          role="menuitem"
          className={`context-menu-item${item.danger ? " danger" : ""}`}
          disabled={item.disabled}
          onClick={() => {
            item.onSelect();
            onClose();
          }}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
