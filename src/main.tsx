import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import { App } from "./App";
import { TooltipLayer } from "./components/common/TooltipLayer";
import { AccountProvider } from "./contexts/AccountContext";
import { RightClickMenuProvider } from "./contexts/RightClickMenuProvider";
import { I18nProvider } from "./i18n/I18nProvider";
import "./styles.css";

createRoot(document.getElementById("root")!).render(
  <I18nProvider>
    <AccountProvider>
      <BrowserRouter>
        <RightClickMenuProvider>
          <App />
          {/* Delegated tooltip layer: listens for [data-tip] hover/focus and
              self-portals to document.body, so it escapes card overflow clipping. */}
          <TooltipLayer />
        </RightClickMenuProvider>
      </BrowserRouter>
    </AccountProvider>
  </I18nProvider>,
);
