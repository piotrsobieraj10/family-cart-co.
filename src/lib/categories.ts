export const CATEGORIES = [
  "Pieczywo",
  "Nabiał",
  "Mięso",
  "Warzywa i owoce",
  "Napoje",
  "Chemia",
  "Dziecko",
  "Dom",
  "Zwierzęta",
  "Auto/Garaż",
  "Inne",
] as const;

export type Category = (typeof CATEGORIES)[number];

export const CATEGORY_EMOJI: Record<string, string> = {
  "Pieczywo": "🍞",
  "Nabiał": "🥛",
  "Mięso": "🥩",
  "Warzywa i owoce": "🥦",
  "Napoje": "🥤",
  "Chemia": "🧴",
  "Dziecko": "🍼",
  "Dom": "🏠",
  "Zwierzęta": "🐾",
  "Auto/Garaż": "🚗",
  "Inne": "📦",
};

export const UNITS = ["szt.", "kg", "g", "l", "ml", "opak.", "pęczek"] as const;