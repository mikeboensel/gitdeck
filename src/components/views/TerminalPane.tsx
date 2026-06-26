import { FitAddon } from "@xterm/addon-fit";
import { WebLinksAddon } from "@xterm/addon-web-links";
import { Terminal } from "@xterm/xterm";
import "@xterm/xterm/css/xterm.css";
import { useEffect, useRef, useState } from "react";

type Status = "connecting" | "open" | "closed";

interface TerminalPaneProps {
  /** True when this is the focused pane of the visible group. */
  active: boolean;
  /** The shell process exited — the manager should drop this pane. */
  onExit: () => void;
  /** User interacted with this pane — the manager should make it active. */
  onFocus: () => void;
  /** The shell/program set the terminal title (OSC 0/2) — e.g. cwd, running
   *  command, or a Claude Code activity hook. The manager names the tab from it. */
  onTitle: (title: string) => void;
}

/**
 * A single interactive shell: one xterm.js instance bound to one
 * `/api/terminal` WebSocket (one server-side PTY). Mounts once and stays
 * mounted for its whole life — the manager hides inactive panes with CSS rather
 * than unmounting, so the shell and its scrollback survive tab/group switches.
 */
export function TerminalPane({ active, onExit, onFocus, onTitle }: TerminalPaneProps) {
  const hostRef = useRef<HTMLDivElement>(null);
  const fitRef = useRef<FitAddon | null>(null);
  const termRef = useRef<Terminal | null>(null);
  const [status, setStatus] = useState<Status>("connecting");

  // `onExit` is read from inside the mount-once effect; route it through a ref so
  // the effect needn't depend on its (per-render) identity and re-create the shell.
  const onExitRef = useRef(onExit);
  onExitRef.current = onExit;
  const onFocusRef = useRef(onFocus);
  onFocusRef.current = onFocus;
  const onTitleRef = useRef(onTitle);
  onTitleRef.current = onTitle;

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;

    const term = new Terminal({
      cursorBlink: true,
      // Nerd Font so Powerline/P10k prompt glyphs render (see font note in repo).
      fontFamily:
        '"MesloLGS Nerd Font Mono", "MesloLGS NF", "Hack Nerd Font Mono", ui-monospace, Menlo, Monaco, monospace',
      fontSize: 13,
      theme: { background: "#1e1e1e" },
      scrollback: 5000,
    });
    const fit = new FitAddon();
    term.loadAddon(fit);
    term.loadAddon(new WebLinksAddon());
    term.open(host);
    fit.fit();
    termRef.current = term;
    fitRef.current = fit;

    const proto = location.protocol === "https:" ? "wss" : "ws";
    const ws = new WebSocket(`${proto}://${location.host}/api/terminal`);

    const sendResize = () => {
      if (ws.readyState !== WebSocket.OPEN) return;
      ws.send(JSON.stringify({ type: "resize", cols: term.cols, rows: term.rows }));
    };

    ws.onopen = () => {
      setStatus("open");
      sendResize();
    };
    ws.onclose = () => setStatus("closed");
    ws.onmessage = (evt) => {
      const data = typeof evt.data === "string" ? evt.data : "";
      if (data.startsWith('{"type":')) {
        try {
          const msg = JSON.parse(data) as { type: string; code?: number; message?: string };
          if (msg.type === "exit") {
            onExitRef.current();
            return;
          }
          if (msg.type === "error") {
            term.write(`\r\n\x1b[31m[error: ${msg.message ?? "unknown"}]\x1b[0m\r\n`);
            return;
          }
        } catch {
          // not a control frame — render literally
        }
      }
      term.write(data);
    };

    const onData = term.onData((data) => {
      if (ws.readyState === WebSocket.OPEN) {
        ws.send(JSON.stringify({ type: "input", data }));
      }
    });

    // OSC 0/2 title sequences (set by the shell, running command, or a Claude
    // Code hook) bubble up so the manager can name the tab from activity.
    const onTitle = term.onTitleChange((title) => onTitleRef.current(title));

    const resizeObserver = new ResizeObserver(() => {
      try {
        fit.fit();
      } catch {
        // host detached/zero-size mid-resize — ignore
      }
      sendResize();
    });
    resizeObserver.observe(host);

    // Mark this pane active when its terminal gains focus (click or keyboard
    // tab-in); `focusin` bubbles up from xterm's helper textarea.
    const onFocusIn = () => onFocusRef.current();
    host.addEventListener("focusin", onFocusIn);

    return () => {
      host.removeEventListener("focusin", onFocusIn);
      resizeObserver.disconnect();
      onData.dispose();
      onTitle.dispose();
      ws.close();
      term.dispose();
      termRef.current = null;
      fitRef.current = null;
    };
    // Mount-once: the manager controls lifecycle via mount/unmount, not prop
    // changes. Callbacks are read through refs, so there are no missing deps.
  }, []);

  // A hidden pane (display:none) can't be measured, so it needs a refit + focus
  // when it becomes active again.
  useEffect(() => {
    if (!active) return;
    const term = termRef.current;
    const fit = fitRef.current;
    if (!term || !fit) return;
    try {
      fit.fit();
    } catch {
      // ignore zero-size
    }
    term.focus();
  }, [active]);

  return (
    <div className={`terminal-pane${active ? " active" : ""}`}>
      <div className={`terminal-pane-status terminal-pane-status-${status}`}>
        {status === "open" ? "●" : status === "connecting" ? "…" : "○"}
      </div>
      <div className="terminal-host" ref={hostRef} />
    </div>
  );
}
