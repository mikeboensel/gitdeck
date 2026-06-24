import { healthMatrixWidget } from "./health-matrix/manifest";
import { starOverlayWidget } from "./star-overlay/manifest";
import type { WidgetManifest } from "./types";

/**
 * The widget registry — the ONLY shared file a widget must touch.
 *
 * - Add a widget:    create a folder under `widgets/`, then append its manifest here.
 * - Remove a widget: delete its folder and its line below. Nothing else references it
 *                    (a stale entry in localStorage visibility is harmless).
 */
export const WIDGETS: WidgetManifest[] = [healthMatrixWidget, starOverlayWidget];
