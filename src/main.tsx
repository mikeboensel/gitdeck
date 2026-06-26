import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { DEFAULT_TTL_MS } from "./api/cache";
import { ToastLayer } from "./components/common/ToastLayer";
import { TooltipLayer } from "./components/common/TooltipLayer";
import { AccountProvider } from "./contexts/AccountContext";
import { ChangesViewerProvider } from "./contexts/ChangesViewerProvider";
import { CloneRepoProvider } from "./contexts/CloneRepoProvider";
import { CommitHistoryProvider } from "./contexts/CommitHistoryProvider";
import { RightClickMenuProvider } from "./contexts/RightClickMenuProvider";
import { StashViewerProvider } from "./contexts/StashViewerProvider";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles.css";

// Reuse the legacy in-memory cache TTL so a revisited tab serves cached data
// without refetching, matching prior behavior — one source of truth for both layers.
const queryClient = new QueryClient({
  defaultOptions: { queries: { staleTime: DEFAULT_TTL_MS } },
});

createRoot(document.getElementById("root")!).render(
  <QueryClientProvider client={queryClient}>
    <I18nProvider>
      <AccountProvider>
        <BrowserRouter>
          <RightClickMenuProvider>
            <CloneRepoProvider>
              <CommitHistoryProvider>
                <StashViewerProvider>
                  <ChangesViewerProvider>
                    <App />
                    {/* Delegated tooltip layer: listens for [data-tip] hover/focus and
                      self-portals to document.body, so it escapes card overflow clipping. */}
                    <TooltipLayer />
                    {/* Delegated toast layer: subscribes to the toast bus and
                      self-portals to document.body for copy/action feedback. */}
                    <ToastLayer />
                  </ChangesViewerProvider>
                </StashViewerProvider>
              </CommitHistoryProvider>
            </CloneRepoProvider>
          </RightClickMenuProvider>
        </BrowserRouter>
      </AccountProvider>
    </I18nProvider>
  </QueryClientProvider>,
);
