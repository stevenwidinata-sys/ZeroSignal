import { lazy } from "react";
import type { GameModule } from "../../platform/types";

const ticTacToe: GameModule = {
  meta: {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    tagline: "Three in a row. Simple to learn, hard to master.",
    tags: ["Classic", "vs AI", "1v1", "Photo face"],
    accent: "green",
    icon: "❌",
    status: "live",
    scoreLabel: "Points",
  },
  Play: lazy(() => import("./Play")),
};

export default ticTacToe;
