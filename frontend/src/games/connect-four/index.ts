import type { GameModule } from "../../platform/types";

// Coming soon: meta only. Add a lazy `Play` component and flip status to
// "live" once the game and its server-side scorer exist.
const connectFour: GameModule = {
  meta: {
    id: "connect-four",
    title: "Connect Four",
    tagline: "Drop discs, line up four, outsmart your rival.",
    tags: ["Strategy", "1v1"],
    accent: "blue",
    icon: "🔵",
    status: "soon",
    scoreLabel: "Wins",
  },
};

export default connectFour;
