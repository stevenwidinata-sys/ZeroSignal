import type { GameModule } from "../../platform/types";

// Coming soon: meta only. Add a lazy `Play` component and flip status to
// "live" once the game and its server-side scorer exist.
const ticTacToe: GameModule = {
  meta: {
    id: "tic-tac-toe",
    title: "Tic-Tac-Toe",
    tagline: "Three in a row. Simple to learn, hard to master.",
    tags: ["Classic", "1v1"],
    accent: "green",
    icon: "❌",
    status: "soon",
    scoreLabel: "Wins",
  },
};

export default ticTacToe;
