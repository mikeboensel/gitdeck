import { homedir } from "node:os";
import type { HttpBindings } from "@hono/node-server";
import type { createNodeWebSocket } from "@hono/node-ws";
import type { OpenAPIHono } from "@hono/zod-openapi";
import type { IPty } from "node-pty";
import { spawn } from "node-pty";
import { logger } from "../logger";

type App = OpenAPIHono<{ Bindings: HttpBindings }>;
type UpgradeWebSocket = ReturnType<typeof createNodeWebSocket>["upgradeWebSocket"];

/**
 * Spike: a single interactive PTY over one WebSocket.
 *
 * The browser (xterm.js) opens `ws://…/api/terminal`; we spawn the user's login
 * shell and pipe it both ways. This is the gitdeck-local trust model — same
 * boundary as the existing "open in Terminal" action — so spawning a host shell
 * is acceptable here and would NOT be on a remotely-hosted deployment.
 *
 * Control protocol (JSON text frames):
 *   { type: "input",  data: string }            keystrokes → pty
 *   { type: "resize", cols: number, rows: number }
 * Output is sent as raw text frames (pty stdout/stderr) straight to xterm.
 *
 * Not yet handled (deferred past the spike): reconnect/scrollback replay,
 * multiple sessions, flow-control/backpressure under heavy output.
 */
export function registerTerminal(app: App, upgradeWebSocket: UpgradeWebSocket): void {
  app.get(
    "/api/terminal",
    upgradeWebSocket(() => {
      let pty: IPty | null = null;

      return {
        onOpen(_evt, ws) {
          const shell = process.env.SHELL || "/bin/zsh";
          try {
            pty = spawn(shell, [], {
              name: "xterm-256color",
              cols: 80,
              rows: 24,
              cwd: process.env.HOME || homedir(),
              env: process.env as Record<string, string>,
            });
          } catch (err) {
            logger.error({ err }, "terminal: pty spawn failed");
            ws.send(JSON.stringify({ type: "error", message: "failed to start shell" }));
            ws.close();
            return;
          }
          pty.onData((data) => ws.send(data));
          pty.onExit(({ exitCode }) => {
            ws.send(JSON.stringify({ type: "exit", code: exitCode }));
            ws.close();
          });
        },

        onMessage(evt, ws) {
          if (!pty) return;
          const raw = typeof evt.data === "string" ? evt.data : "";
          let msg: { type?: string; data?: string; cols?: number; rows?: number };
          try {
            msg = JSON.parse(raw);
          } catch {
            return; // ignore non-JSON frames
          }
          if (msg.type === "input" && typeof msg.data === "string") {
            pty.write(msg.data);
          } else if (msg.type === "resize" && msg.cols && msg.rows) {
            try {
              pty.resize(msg.cols, msg.rows);
            } catch (err) {
              logger.warn({ err }, "terminal: resize failed");
            }
          }
          void ws;
        },

        onClose() {
          pty?.kill();
          pty = null;
        },
      };
    }),
  );
}
