import { lazy } from "react";
import type { GameModule } from "../../platform/types";

const connectFour: GameModule = {
  meta: {
    id: "connect-four",
    title: "Connect Four",
    tagline: "Drop chips, line up four, outsmart your rival.",
    tags: ["Strategy", "vs AI", "1v1", "10 skins"],
    accent: "blue",
    icon: "🔴",
    status: "live",
    scoreLabel: "Points",
  },
  Play: lazy(() => import("./Play")),
};

export default connectFour;
