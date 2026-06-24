import type { WidgetManifest } from "../types";
import { HealthMatrix } from "./HealthMatrix";

export const healthMatrixWidget: WidgetManifest = {
  id: "health-matrix",
  title: "Health matrix",
  description:
    "Repositories × health dimensions. A red column reveals a gap the single health score hides.",
  enabledByDefault: true,
  component: HealthMatrix,
};
