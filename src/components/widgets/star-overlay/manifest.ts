import type { WidgetManifest } from "../types";
import { StarOverlay } from "./StarOverlay";

export const starOverlayWidget: WidgetManifest = {
  id: "star-overlay",
  title: "Star history overlay",
  description:
    "Compare several repos' star growth on one shared axis, with a log-scale toggle for mixed sizes.",
  enabledByDefault: true,
  component: StarOverlay,
};
