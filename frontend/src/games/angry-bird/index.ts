import { lazy } from "react";
import type { GameModule } from "../../platform/types";
import { LEVELS, findWorld } from "./levels";

const angryBird: GameModule = {
  meta: {
    id: "angry-bird",
    title: "Angry Bird",
    tagline: "Fling birds, smash forts, pop every pig.",
    tags: ["Physics", "Solo", "12 levels"],
    accent: "yellow",
    icon: "🐦",
    status: "live",
    scoreLabel: "Best score",
    boards: [
      { label: "🏆 All levels" },
      ...LEVELS.map((l) => ({ level: l.id, label: `${findWorld(l.world).icon} ${l.id}. ${l.name}` })),
    ],
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
        text: "Pop every pig to clear a level (1 ★) and unlock the next of 12. Smash blocks for 2 ★ and 3 ★. Your campaign score unlocks new birds.",
      },
    ],
  },
  Play: lazy(() => import("./Play")),
};

export default angryBird;
