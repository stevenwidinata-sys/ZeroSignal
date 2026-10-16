import { lazy } from "react";
import type { GameModule } from "../../platform/types";

const angryBird: GameModule = {
  meta: {
    id: "angry-bird",
    title: "Angry Bird",
    tagline: "Fling birds, smash forts, pop every pig.",
    tags: ["Physics", "Solo", "6 birds"],
    accent: "yellow",
    icon: "🐦",
    status: "live",
    scoreLabel: "Best score",
  },
  Play: lazy(() => import("./Play")),
};

export default angryBird;
