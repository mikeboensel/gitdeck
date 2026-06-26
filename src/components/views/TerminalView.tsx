import { useCallback, useRef, useState } from "react";
import { LuPlus, LuSquareSplitHorizontal, LuTrash2 } from "react-icons/lu";
import { TerminalPane } from "./TerminalPane";

interface Pane {
  id: string;
}
interface Group {
  id: string;
  name: string;
  /** Live title from an OSC sequence (cwd, running command, Claude hook…). */
  title?: string;
  panes: Pane[];
}

let seq = 0;
const nextId = (prefix: string) => `${prefix}-${++seq}`;

function makeGroup(n: number): Group {
  return { id: nextId("g"), name: `Terminal ${n}`, panes: [{ id: nextId("p") }] };
}

/**
 * Multi-terminal manager, modeled on VS Code: terminals are organized into
 * groups, and a group is one or more side-by-side split panes. The active
 * group fills the panel; the rest stay mounted but hidden (CSS), so their
 * shells and scrollback persist. Each pane is one PTY over one WebSocket.
 *
 * Still deferred: reconnect/replay across page reload, drag-to-reorder,
 * adjustable split sashes (splits share width evenly for now).
 */
export function TerminalView() {
  const groupCount = useRef(1);
  const [groups, setGroups] = useState<Group[]>(() => [makeGroup(1)]);
  const [activeGroupId, setActiveGroupId] = useState(() => groups[0]?.id ?? "");
  const [activePaneId, setActivePaneId] = useState(() => groups[0]?.panes[0]?.id ?? "");

  const activateGroup = useCallback((group: Group) => {
    setActiveGroupId(group.id);
    setActivePaneId((prev) =>
      group.panes.some((p) => p.id === prev) ? prev : (group.panes[0]?.id ?? ""),
    );
  }, []);

  const newTerminal = useCallback(() => {
    groupCount.current += 1;
    const group = makeGroup(groupCount.current);
    setGroups((gs) => [...gs, group]);
    setActiveGroupId(group.id);
    setActivePaneId(group.panes[0]?.id ?? "");
  }, []);

  const setGroupTitle = useCallback((groupId: string, title: string) => {
    const clean = title.trim().slice(0, 40);
    setGroups((gs) => gs.map((g) => (g.id === groupId ? { ...g, title: clean || undefined } : g)));
  }, []);

  const splitActive = useCallback(() => {
    const pane: Pane = { id: nextId("p") };
    setGroups((gs) =>
      gs.map((g) => (g.id === activeGroupId ? { ...g, panes: [...g.panes, pane] } : g)),
    );
    setActivePaneId(pane.id);
  }, [activeGroupId]);

  const killPane = useCallback((paneId: string) => {
    setGroups((gs) => {
      const next: Group[] = [];
      for (const g of gs) {
        const panes = g.panes.filter((p) => p.id !== paneId);
        if (panes.length > 0) next.push(panes === g.panes ? g : { ...g, panes });
      }
      // Recompute active group/pane if the removal orphaned the selection.
      setActiveGroupId((prevG) => {
        const stillThere = next.find((g) => g.id === prevG && g.panes.length > 0);
        const fallback = stillThere ?? next[next.length - 1];
        const targetGroup = fallback ?? null;
        setActivePaneId((prevP) => {
          if (targetGroup?.panes.some((p) => p.id === prevP)) return prevP;
          return targetGroup?.panes[targetGroup.panes.length - 1]?.id ?? "";
        });
        return targetGroup?.id ?? "";
      });
      return next;
    });
  }, []);

  return (
    <div className="terminal-view">
      <div className="terminal-toolbar">
        <div className="terminal-tabs" role="tablist">
          {groups.map((g) => (
            <button
              key={g.id}
              type="button"
              role="tab"
              className={`terminal-tab${g.id === activeGroupId ? " active" : ""}`}
              onClick={() => activateGroup(g)}
              title={g.title ? `${g.name} — ${g.title}` : g.name}
            >
              {g.title || g.name}
              {g.panes.length > 1 ? (
                <span className="terminal-tab-split">⊞{g.panes.length}</span>
              ) : null}
            </button>
          ))}
        </div>
        <div className="terminal-actions">
          <button
            type="button"
            className="terminal-action"
            onClick={splitActive}
            title="Split terminal"
            aria-label="Split terminal"
            disabled={!activeGroupId}
          >
            <LuSquareSplitHorizontal size={15} />
          </button>
          <button
            type="button"
            className="terminal-action"
            onClick={() => activePaneId && killPane(activePaneId)}
            title="Kill active pane"
            aria-label="Kill active pane"
            disabled={!activePaneId}
          >
            <LuTrash2 size={15} />
          </button>
          <button
            type="button"
            className="terminal-action"
            onClick={newTerminal}
            title="New terminal"
            aria-label="New terminal"
          >
            <LuPlus size={16} />
          </button>
        </div>
      </div>

      <div className="terminal-stage">
        {groups.length === 0 ? (
          <button type="button" className="terminal-empty" onClick={newTerminal}>
            <LuPlus size={18} /> New terminal
          </button>
        ) : (
          // Every group stays mounted; only the active one is shown, so hidden
          // shells keep running with their scrollback intact.
          groups.map((g) => (
            <div key={g.id} className={`terminal-group${g.id === activeGroupId ? " active" : ""}`}>
              {g.panes.map((p) => (
                <TerminalPane
                  key={p.id}
                  active={g.id === activeGroupId && p.id === activePaneId}
                  onExit={() => killPane(p.id)}
                  onFocus={() => {
                    setActiveGroupId(g.id);
                    setActivePaneId(p.id);
                  }}
                  onTitle={(title) => setGroupTitle(g.id, title)}
                />
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  );
}
