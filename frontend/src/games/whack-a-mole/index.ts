import { lazy } from "react";
import type { GameModule } from "../../platform/types";

const whackAMole: GameModule = {
  meta: {
    id: "whack-a-mole",
    title: "Whack-a-Mole",
    tagline: "Fast hands win. Bonk every mole before it hides.",
    tags: ["Reflex", "Solo", "4 modes"],
    accent: "yellow",
    icon: "🔨",
    status: "live",
    isNew: true,
    scoreLabel: "Best score",
    boards: [
      { level: 1, label: "⏱️ Classic" },
      { level: 2, label: "⚡ Frenzy" },
      { level: 3, label: "♥ Survival" },
      { level: 4, label: "📅 Today's Daily", period: "today" },
    ],
    tutorial: [
      {
        icon: "🔨",
        title: "Bonk!",
        text: "Click or tap a mole before it hides. On a keyboard, each hole has its own key.",
      },
      {
        icon: "⭐",
        title: "Know your moles",
        text: "Ninjas are quick, helmets need 2 hits, golden moles pay 500. Power-up moles give ×2 points, a combo shield or slow-mo. Bosses take 8 hits. Never hit the bomb!",
      },
      {
        icon: "🔥",
        title: "Build a combo",
        text: "5 hits in a row pay ×1.5 and 10 in a row start FEVER ×3. A missed tap or an escaped mole ends it.",
      },
      {
        icon: "🏆",
        title: "Pick a mode",
        text: "Classic 60s, Frenzy 30s, Survival with 3 lives, or today's Daily Challenge. The server checks every tap.",
      },
    ],
  },
  Play: lazy(() => import("./Play")),
};

export default whackAMole;
