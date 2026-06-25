import { useCallback, useEffect, useMemo, useState } from "react";
import { fetchNotifications, markAllNotificationsRead, markNotificationRead } from "../api/github";
import { useI18n } from "../i18n/I18nProvider";
import type { GhIssue, GhNotification, GhPullRequest } from "../types/github";
import {
  buildInboxItems,
  INBOX_MAILBOXES,
  type InboxMailbox,
  matchesInboxMailbox,
  mergeNotifications,
} from "../utils/inbox";

interface UseInboxOptions {
  /** Only fetch/poll while authenticated. */
  authenticated: boolean;
  /** Active account id — an intentional re-fetch trigger when it changes. */
  accountId: string | null;
  issues: GhIssue[];
  pullRequests: GhPullRequest[];
  userLogin: string;
  /** Currently-selected mailbox; drives the `mailboxItems` filter. */
  mailbox: InboxMailbox;
}

/**
 * Builds the Inbox view-model. Fetches and polls GitHub notifications (interval
 * is server-advised), merges them with the issue/PR-derived inbox items, and
 * exposes per-mailbox counts plus mark-read handlers. The raw notifications/poll
 * state stays private — callers only need the merged items and handlers below.
 */
export function useInbox({
  authenticated,
  accountId,
  issues,
  pullRequests,
  userLogin,
  mailbox,
}: UseInboxOptions) {
  const { t } = useI18n();
  const [notifications, setNotifications] = useState<GhNotification[]>([]);
  const [pollInterval, setPollInterval] = useState(60);

  const refreshNotifications = useCallback(async (fresh = false) => {
    try {
      const data = await fetchNotifications(fresh);
      setNotifications(data.notifications);
      if (data.pollInterval) setPollInterval(data.pollInterval);
    } catch {
      // silent — Inbox still works without notifications
    }
  }, []);

  // biome-ignore lint/correctness/useExhaustiveDependencies: accountId is an intentional re-run trigger so notifications are refetched when the active account changes
  useEffect(() => {
    if (!authenticated) return;
    void refreshNotifications(true);
  }, [authenticated, accountId, refreshNotifications]);

  useEffect(() => {
    if (!authenticated || !pollInterval) return;
    const id = window.setInterval(() => {
      void refreshNotifications();
    }, Math.max(30, pollInterval) * 1000);
    return () => window.clearInterval(id);
  }, [authenticated, pollInterval, refreshNotifications]);

  /** Drop cached notifications immediately (e.g. on account switch, before refetch). */
  const clearNotifications = useCallback(() => setNotifications([]), []);

  const handleMarkRead = useCallback(
    async (threadId: string) => {
      setNotifications((prev) =>
        prev.map((entry) => (entry.id === threadId ? { ...entry, unread: false } : entry)),
      );
      try {
        await markNotificationRead(threadId);
      } catch {
        void refreshNotifications(true);
      }
    },
    [refreshNotifications],
  );

  const inboxItems = useMemo(() => {
    const base = buildInboxItems({ issues, pullRequests, userLogin });
    return mergeNotifications(base, notifications);
  }, [issues, pullRequests, userLogin, notifications]);
  const mailboxItems = useMemo(
    () => inboxItems.filter((item) => matchesInboxMailbox(item, mailbox)),
    [inboxItems, mailbox],
  );
  const inboxCounts = useMemo(() => {
    const counts: Record<InboxMailbox, number> = {} as Record<InboxMailbox, number>;
    for (const entry of INBOX_MAILBOXES) {
      counts[entry.key] = inboxItems.filter((item) => matchesInboxMailbox(item, entry.key)).length;
    }
    return counts;
  }, [inboxItems]);
  const inboxUnreadCount = useMemo(
    () => inboxItems.filter((item) => item.unread).length,
    [inboxItems],
  );

  const handleMarkAllRead = useCallback(async () => {
    if (!inboxUnreadCount) return;
    if (
      !window.confirm(
        t("confirm.markAllRead", {
          count: inboxUnreadCount,
          plural: inboxUnreadCount === 1 ? "" : "s",
        }),
      )
    )
      return;
    const previous = notifications;
    setNotifications((prev) => prev.map((entry) => ({ ...entry, unread: false })));
    try {
      await markAllNotificationsRead();
    } catch {
      setNotifications(previous);
    }
  }, [inboxUnreadCount, notifications, t]);

  return {
    refreshNotifications,
    clearNotifications,
    handleMarkRead,
    handleMarkAllRead,
    inboxItems,
    mailboxItems,
    inboxCounts,
    inboxUnreadCount,
  };
}
