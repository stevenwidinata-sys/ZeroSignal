import { lazy } from "react";
import type { GameModule } from "../../platform/types";

const game2048: GameModule = {
  meta: {
    id: "2048",
    title: "2048",
    tagline: "Slide, merge, reach 2048. Then keep going.",
    tags: ["Puzzle", "Solo", "Daily"],
    accent: "blue",
    icon: "🔢",
    status: "live",
    isNew: true,
    scoreLabel: "Best score",
    detailLabel: "Best tile",
    boards: [
      { level: 1, label: "🔢 Classic" },
      { level: 2, label: "🟦 Big 5×5" },
      { level: 3, label: "🔸 Tiny 3×3" },
      { level: 4, label: "📅 Today's Daily", period: "today" },
    ],
    tutorial: [
      {
        icon: "👉",
        title: "Slide",
        text: "Use the arrow keys, WASD or swipe. Every tile slides as far as it can in that direction.",
      },
      {
        icon: "➕",
        title: "Merge",
        text: "Two equal tiles that touch become one: 2 + 2 = 4, 4 + 4 = 8. Every merge adds its new value to your score.",
      },
      {
        icon: "🏆",
        title: "Reach 2048",
        text: "A new 2 or 4 appears after every move. Make a 2048 tile for bonus coins, then keep going. The game ends when no move is left.",
      },
      {
        icon: "↶",
        title: "Modes and undo",
        text: "Classic 4×4, Big 5×5, Tiny 3×3, or today's Daily. Up to 3 undos (none in the Daily). Your game is saved as you play.",
      },
    ],
  },
  Play: lazy(() => import("./Play")),
};

export default game2048;
