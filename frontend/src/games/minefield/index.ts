import { lazy } from "react";
import type { GameModule } from "../../platform/types";

const minefield: GameModule = {
  meta: {
    id: "minefield",
    title: "Minefield",
    tagline: "Clear the field by logic. Never a 50/50 guess.",
    tags: ["Logic", "Solo", "Daily"],
    accent: "green",
    icon: "💣",
    status: "live",
    isNew: true,
    scoreLabel: "Best score",
    boards: [
      { level: 1, label: "🌱 Beginner" },
      { level: 2, label: "💣 Intermediate" },
      { level: 3, label: "💀 Expert" },
      { level: 4, label: "📅 Today's Daily", period: "today" },
    ],
    tutorial: [
      {
        icon: "👆",
        title: "Open cells",
        text: "Click a cell to open it. Your first click is always safe and opens an area.",
      },
      {
        icon: "🔢",
        title: "Read the numbers",
        text: "A number tells how many mines touch that cell, including diagonals.",
      },
      {
        icon: "🚩",
        title: "Flag the mines",
        text: "Right-click, long-press, or use Flag mode. Click a number whose flags are all placed to open everything around it.",
      },
      {
        icon: "⏱️",
        title: "Be quick",
        text: "Every board can be solved by logic. Clear it fast for a higher score. Hints help, but add 20 seconds.",
      },
    ],
  },
  Play: lazy(() => import("./Play")),
};

export default minefield;
