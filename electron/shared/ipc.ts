// Single source of truth for IPC channel names, imported by both main and
// preload so a typo can't create a dead channel.
export const IPC = {
  ping: "app:ping",
} as const;

export type IpcChannel = (typeof IPC)[keyof typeof IPC];
