import { createContext, type ReactNode, useCallback, useContext, useState } from "react";
import {
  ContextMenu,
  type ContextMenuItem,
  type ContextMenuPosition,
} from "../components/common/ContextMenu";

interface OpenArgs {
  items: ContextMenuItem[];
  /** Accessible label for the menu (e.g. the subject's name). */
  ariaLabel?: string;
}

interface RightClickMenuContextValue {
  /** Open the right-click menu at the event's cursor position. */
  open: (event: React.MouseEvent, args: OpenArgs) => void;
  close: () => void;
}

const RightClickMenuContext = createContext<RightClickMenuContextValue | null>(null);

/**
 * App-level right-click menu host. Renders a single shared {@link ContextMenu}
 * instance; any component calls `useRightClickMenu().open(event, { items })`
 * from an `onContextMenu` handler. The provider is subject-agnostic — it only
 * knows about menu items, never about repos/issues/etc. Build the items with a
 * per-subject builder (see `src/menus/`).
 */
export function RightClickMenuProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<({ position: ContextMenuPosition } & OpenArgs) | null>(null);

  const open = useCallback((event: React.MouseEvent, args: OpenArgs) => {
    event.preventDefault();
    setState({ position: { x: event.clientX, y: event.clientY }, ...args });
  }, []);

  const close = useCallback(() => setState(null), []);

  return (
    <RightClickMenuContext.Provider value={{ open, close }}>
      {children}
      {state ? (
        <ContextMenu
          position={state.position}
          items={state.items}
          ariaLabel={state.ariaLabel}
          onClose={close}
        />
      ) : null}
    </RightClickMenuContext.Provider>
  );
}

export function useRightClickMenu(): RightClickMenuContextValue {
  const value = useContext(RightClickMenuContext);
  if (!value) throw new Error("useRightClickMenu must be used inside RightClickMenuProvider");
  return value;
}
