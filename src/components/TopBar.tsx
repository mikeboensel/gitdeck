import { useEffect, useRef, useState } from "react";
import { useAccounts } from "../contexts/AccountContext";
import { useI18n } from "../i18n/I18nProvider";
import type { Language } from "../utils/i18n";
import { AddAccountModal } from "./AddAccountModal";
import { Avatar } from "./common/Avatar";

type Theme = "dark" | "light" | "auto";
type TextSize = "small" | "normal" | "large";

interface TopBarProps {
  subtitle: string;
  lastUpdated: string;
  loading: boolean;
  theme: Theme;
  textSize: TextSize;
  authLogin: string | null;
  owners: string[];
  onThemeChange: (theme: Theme) => void;
  onTextSizeChange: (textSize: TextSize) => void;
  onRefresh: () => void;
  onOpenFilters: () => void;
  onOpenPalette: () => void;
  onLogout: () => void;
  canLogout?: boolean;
}

export function TopBar({
  lastUpdated,
  loading,
  theme,
  textSize,
  authLogin,
  owners,
  onThemeChange,
  onTextSizeChange,
  onRefresh,
  onOpenFilters,
  onOpenPalette,
  onLogout,
  canLogout = true,
}: TopBarProps) {
  const { language, languages, setLanguage, t } = useI18n();
  const { accounts, active, switchAccount, removeAccount } = useAccounts();
  const [profileOpen, setProfileOpen] = useState(false);
  const [prefsOpen, setPrefsOpen] = useState(false);
  const [addAccountOpen, setAddAccountOpen] = useState(false);
  const profileRef = useRef<HTMLDivElement | null>(null);
  // All owners (the user's own namespace + orgs) shown as avatars top-left.
  const MAX_ORG_ICONS = 5;
  const visibleOrgs = owners.slice(0, MAX_ORG_ICONS);
  const overflowOrgs = owners.length - visibleOrgs.length;

  async function handleSwitchAccount(id: string) {
    setProfileOpen(false);
    try {
      await switchAccount(id);
    } catch {
      // refresh effect surfaces the error
    }
  }

  async function handleRemoveAccount(event: React.MouseEvent, id: string, label: string) {
    event.stopPropagation();
    if (!window.confirm(t("accounts.removeConfirm").replace("{name}", label))) return;
    try {
      await removeAccount(id);
    } catch {
      // refresh effect surfaces the error
    }
  }

  useEffect(() => {
    if (!profileOpen) return;

    function handlePointerDown(event: PointerEvent) {
      if (!profileRef.current?.contains(event.target as Node)) setProfileOpen(false);
    }

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setProfileOpen(false);
    }

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [profileOpen]);

  return (
    <div className="topbar">
      <div className="topbar-orgs">
        {visibleOrgs.map((org) => (
          <a
            className="topbar-org"
            data-tip={org}
            key={org}
            href={`https://github.com/${org}`}
            target="_blank"
            rel="noreferrer"
            aria-label={org}
          >
            <img className="topbar-org-icon" src={`https://github.com/${org}.png?size=80`} alt="" />
          </a>
        ))}
        {overflowOrgs > 0 ? (
          <span className="topbar-org" data-tip={owners.slice(MAX_ORG_ICONS).join(", ")}>
            <span className="topbar-org-icon topbar-org-overflow">+{overflowOrgs}</span>
          </span>
        ) : null}
      </div>
      <div className="topbar-search">
        <button
          className="btn search-btn"
          type="button"
          aria-label={t("common.searchShortcut")}
          title={t("common.searchShortcut")}
          onClick={onOpenPalette}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="11" cy="11" r="7" />
            <line x1="21" y1="21" x2="16.65" y2="16.65" />
          </svg>
          <span className="label">{t("common.search")}</span>
          <kbd className="kbd kbd--sm">⌘K</kbd>
        </button>
      </div>
      <div className="topbar-actions">
        <span className="meta">{lastUpdated}</span>
        <button
          className="btn filters-toggle"
          type="button"
          aria-label={t("common.openFilters")}
          title={t("common.openFilters")}
          onClick={onOpenFilters}
        >
          <svg
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polygon points="22 3 2 3 10 12.46 10 19 14 21 14 12.46 22 3" />
          </svg>
          <span className="label">{t("common.filters")}</span>
        </button>
        <button
          className="btn"
          type="button"
          aria-label={t("common.refresh")}
          title={t("common.refresh")}
          disabled={loading}
          onClick={onRefresh}
        >
          <svg
            className={loading ? "spin" : ""}
            width={14}
            height={14}
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </button>
        <span className="topbar-divider" aria-hidden="true" />
        <div className="profile-menu" ref={profileRef}>
          <button
            className={`btn profile-btn ${profileOpen ? "active" : ""}`}
            type="button"
            aria-label={
              authLogin ? `${t("common.signedIn")} ${authLogin}` : t("common.authenticated")
            }
            aria-haspopup="menu"
            aria-expanded={profileOpen}
            title={authLogin ? `${t("common.signedIn")} ${authLogin}` : t("common.authenticated")}
            onClick={() => setProfileOpen((open) => !open)}
          >
            <Avatar login={authLogin ?? undefined} size={22} className="profile-avatar" />
            <span className="label">{authLogin || t("common.authenticated")}</span>
            <svg
              className="profile-caret"
              width={12}
              height={12}
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.4"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <polyline points="6 9 12 15 18 9" />
            </svg>
          </button>
          {profileOpen ? (
            <div className="profile-popover" role="menu" aria-label={t("common.account")}>
              {accounts.length > 0 ? (
                // biome-ignore lint/a11y/useSemanticElements: role="group" is the correct ARIA grouping inside role="menu"; a fieldset is semantically wrong here and would break the flex layout.
                <div className="profile-accounts" role="group" aria-label={t("accounts.switch")}>
                  {accounts.map((account) => {
                    const isActive = account.id === active?.id;
                    const labelText = account.login ?? account.label;
                    return (
                      <div
                        key={account.id}
                        role="menuitemradio"
                        aria-checked={isActive}
                        tabIndex={0}
                        className={`profile-account-item ${isActive ? "active" : ""}`}
                        onClick={() => void handleSwitchAccount(account.id)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            void handleSwitchAccount(account.id);
                          }
                        }}
                      >
                        <Avatar
                          login={account.login ?? undefined}
                          size={28}
                          className="profile-account-avatar"
                        />
                        <div className="profile-account-text">
                          <span className="profile-account-name">{labelText}</span>
                          <span className="profile-account-meta">{account.providerConfigId}</span>
                        </div>
                        {isActive ? (
                          <svg
                            className="profile-account-check"
                            width={14}
                            height={14}
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.4"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                            aria-hidden="true"
                          >
                            <path d="M20 6 9 17l-5-5" />
                          </svg>
                        ) : !account.ephemeral ? (
                          <button
                            type="button"
                            className="profile-account-remove"
                            aria-label={t("accounts.remove").replace("{name}", labelText)}
                            title={t("accounts.remove").replace("{name}", labelText)}
                            onClick={(event) =>
                              void handleRemoveAccount(event, account.id, labelText)
                            }
                          >
                            ×
                          </button>
                        ) : null}
                      </div>
                    );
                  })}
                  <button
                    type="button"
                    className="profile-menu-item profile-add-account"
                    role="menuitem"
                    onClick={() => {
                      setProfileOpen(false);
                      setAddAccountOpen(true);
                    }}
                  >
                    <svg
                      width={14}
                      height={14}
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2.2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      aria-hidden="true"
                    >
                      <line x1="12" y1="5" x2="12" y2="19" />
                      <line x1="5" y1="12" x2="19" y2="12" />
                    </svg>
                    <span>{t("accounts.add")}</span>
                  </button>
                </div>
              ) : null}
              {accounts.length > 0 ? <div className="profile-divider" aria-hidden="true" /> : null}
              <button
                type="button"
                className="profile-menu-item profile-prefs-toggle"
                aria-expanded={prefsOpen}
                onClick={() => setPrefsOpen((open) => !open)}
              >
                <svg
                  width={14}
                  height={14}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <path d="M12 15.5A3.5 3.5 0 1 0 12 8a3.5 3.5 0 0 0 0 7.5Z" />
                  <path d="M19.4 15a1.8 1.8 0 0 0 .36 2l.05.05a2.1 2.1 0 1 1-2.97 2.97l-.05-.05a1.8 1.8 0 0 0-2-.36 1.8 1.8 0 0 0-1.09 1.65V21a2.1 2.1 0 1 1-4.2 0v-.08a1.8 1.8 0 0 0-1.12-1.65 1.8 1.8 0 0 0-2 .36l-.05.05a2.1 2.1 0 1 1-2.97-2.97l.05-.05a1.8 1.8 0 0 0 .36-2A1.8 1.8 0 0 0 2.1 13H2a2.1 2.1 0 1 1 0-4.2h.08a1.8 1.8 0 0 0 1.65-1.12 1.8 1.8 0 0 0-.36-2l-.05-.05a2.1 2.1 0 1 1 2.97-2.97l.05.05a1.8 1.8 0 0 0 2 .36A1.8 1.8 0 0 0 9.5 1.9V2a2.1 2.1 0 1 1 4.2 0v.08a1.8 1.8 0 0 0 1.09 1.65 1.8 1.8 0 0 0 2-.36l.05-.05a2.1 2.1 0 1 1 2.97 2.97l-.05.05a1.8 1.8 0 0 0-.36 2c.28.69.94 1.13 1.67 1.13h.03a2.1 2.1 0 1 1 0 4.2h-.08A1.8 1.8 0 0 0 19.4 15Z" />
                </svg>
                <span>{t("preferences.title")}</span>
                <svg
                  className={`profile-prefs-caret ${prefsOpen ? "open" : ""}`}
                  width={12}
                  height={12}
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.4"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <polyline points="6 9 12 15 18 9" />
                </svg>
              </button>
              {prefsOpen ? (
                <div className="profile-prefs">
                  <label className="preferences-field">
                    <span>{t("preferences.language")}</span>
                    <select
                      value={language}
                      onChange={(event) => setLanguage(event.target.value as Language)}
                    >
                      {languages.map((entry) => (
                        <option key={entry} value={entry}>
                          {t(`language.${entry}`)}
                        </option>
                      ))}
                    </select>
                  </label>
                  <div className="preferences-field">
                    <span>{t("preferences.theme")}</span>
                    <div className="preferences-segmented">
                      {(["dark", "light", "auto"] as const).map((entry) => (
                        <button
                          className={theme === entry ? "active" : ""}
                          type="button"
                          key={entry}
                          onClick={() => onThemeChange(entry)}
                        >
                          <span
                            className={`preferences-option-icon theme-icon-${entry}`}
                            aria-hidden="true"
                          >
                            {entry === "dark" ? "☾" : entry === "light" ? "☀" : "◐"}
                          </span>
                          <span>
                            {entry === "dark"
                              ? t("theme.dark")
                              : entry === "light"
                                ? t("theme.light")
                                : t("theme.auto")}
                          </span>
                        </button>
                      ))}
                    </div>
                  </div>
                  <div className="preferences-field">
                    <span>{t("preferences.textSize")}</span>
                    <div className="preferences-segmented">
                      {(["small", "normal", "large"] as const).map((entry) => (
                        <button
                          className={`text-size-option text-size-option-${entry} ${textSize === entry ? "active" : ""}`}
                          type="button"
                          key={entry}
                          onClick={() => onTextSizeChange(entry)}
                        >
                          {entry === "small"
                            ? t("textSize.small")
                            : entry === "normal"
                              ? t("textSize.normal")
                              : t("textSize.large")}
                        </button>
                      ))}
                    </div>
                  </div>
                </div>
              ) : null}
              <div className="profile-divider" aria-hidden="true" />
              {canLogout ? (
                <button
                  className="profile-menu-item profile-logout"
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    setProfileOpen(false);
                    onLogout();
                  }}
                >
                  <svg
                    width={14}
                    height={14}
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2.2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
                    <polyline points="16 17 21 12 16 7" />
                    <line x1="21" y1="12" x2="9" y2="12" />
                  </svg>
                  <span>{t("common.signOut")}</span>
                </button>
              ) : (
                <div className="profile-external-note">{t("common.authenticatedExternally")}</div>
              )}
            </div>
          ) : null}
        </div>
      </div>
      <AddAccountModal open={addAccountOpen} onClose={() => setAddAccountOpen(false)} />
    </div>
  );
}
