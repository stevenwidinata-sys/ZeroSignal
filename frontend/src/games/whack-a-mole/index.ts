import type { GameModule } from "../../platform/types";

// Coming soon: meta only. Add a lazy `Play` component and flip status to
// "live" once the game and its server-side scorer exist.
const whackAMole: GameModule = {
  meta: {
    id: "whack-a-mole",
    title: "Whack-a-Mole",
    tagline: "Fast hands win. Bonk every mole before it hides.",
    tags: ["Reflex", "Solo"],
    accent: "yellow",
    icon: "🔨",
    status: "soon",
    scoreLabel: "Best score",
  },
};

export default whackAMole;
