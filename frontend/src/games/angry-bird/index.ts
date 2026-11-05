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
    tutorial: [
      {
        icon: "🎯",
        title: "Aim",
        text: "Drag anywhere on the game to pull the slingshot. The dotted path and power bar show where your bird will fly.",
      },
      {
        icon: "🚀",
        title: "Launch",
        text: "Let go to fire. Press Esc while dragging to cancel the shot.",
      },
      {
        icon: "✨",
        title: "Use abilities",
        text: "Tap while a bird is flying to use its power: Chuck dashes, Bomb explodes, Matilda drops an egg, Blues splits in three.",
      },
      {
        icon: "🐷",
        title: "Score big",
        text: "Pop every pig and smash blocks with as few birds as you can. Bigger scores unlock new birds and pay more coins.",
      },
    ],
  },
  Play: lazy(() => import("./Play")),
};

export default angryBird;
