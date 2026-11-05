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
    tutorial: [
      {
        icon: "⬇️",
        title: "Drop a chip",
        text: "Click a column (or use Tab and Enter) to drop your chip. It falls to the lowest free spot.",
      },
      {
        icon: "🔗",
        title: "Connect four",
        text: "Line up 4 of your chips in a row: across, up and down, or diagonally. Block your rival's lines too.",
      },
      {
        icon: "🏆",
        title: "Win the series",
        text: "Play best of 3 or 5 against a friend or the AI. Beat the AI to earn coins, points and a skin spin.",
      },
      {
        icon: "↩️",
        title: "Undo (AI only)",
        text: "You get 3 undos per game against the AI, but none on Impossible. Using an undo cancels that series' skin spin.",
      },
    ],
  },
  Play: lazy(() => import("./Play")),
};

export default connectFour;
