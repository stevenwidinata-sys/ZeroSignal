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
    tutorial: [
      {
        icon: "❌",
        title: "Take turns",
        text: "Click an empty square to place your piece. Player 1 always goes first.",
      },
      {
        icon: "📏",
        title: "Three in a row",
        text: "Get 3 of your pieces in a line: across, up and down, or diagonally. A full board with no line is a draw.",
      },
      {
        icon: "🤖",
        title: "Pick your rival",
        text: "Play a friend on this device or the AI. Hard never loses, so a drawn series against it still pays coins and a spin.",
      },
      {
        icon: "🎨",
        title: "Make it yours",
        text: "Unlock boards and faces with coins or reward spins, or use your character or a photo as your piece.",
      },
    ],
  },
  Play: lazy(() => import("./Play")),
};

export default ticTacToe;
