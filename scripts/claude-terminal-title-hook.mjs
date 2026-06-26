#!/usr/bin/env node
// PoC: Claude Code `Stop` hook → rename the gitdeck terminal tab to the first
// word of Claude's latest response.
//
// How it reaches the tab: the hook runs as a child of `claude`, which runs
// inside gitdeck's PTY. Writing an OSC 2 title sequence (ESC ] 2 ; <text> BEL)
// to /dev/tty emits it into that PTY; xterm.js fires `onTitleChange`, and the
// TerminalView manager names the tab from it.
//
// Stop-hook stdin payload: { transcript_path, session_id, cwd, ... }.
import { appendFileSync, readFileSync } from "node:fs";

function readStdin() {
  try {
    return readFileSync(0, "utf8"); // fd 0 = stdin
  } catch {
    return "";
  }
}

function lastAssistantText(transcriptPath) {
  const lines = readFileSync(transcriptPath, "utf8").trim().split("\n");
  for (let i = lines.length - 1; i >= 0; i--) {
    let entry;
    try {
      entry = JSON.parse(lines[i]);
    } catch {
      continue;
    }
    if (entry?.type !== "assistant") continue;
    const content = entry.message?.content;
    if (!Array.isArray(content)) continue;
    const textPart = content.find((c) => c?.type === "text" && c.text?.trim());
    if (textPart) return textPart.text;
  }
  return "";
}

try {
  const payload = JSON.parse(readStdin() || "{}");
  if (!payload.transcript_path) process.exit(0);

  const text = lastAssistantText(payload.transcript_path);
  const firstWord = (text.trim().split(/\s+/)[0] || "claude").replace(/[^\w.-]/g, "").slice(0, 24);
  const title = firstWord || "claude";

  // OSC 2 = set window title. BEL (\x07) terminates. Write to the controlling
  // tty (overridable via env for testing).
  const out = process.env.CLAUDE_TITLE_HOOK_OUT || "/dev/tty";
  appendFileSync(out, `\x1b]2;${title}\x07`);
} catch {
  // Never let a title hook break the Claude session.
}
process.exit(0);
