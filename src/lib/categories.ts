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
  Pieczywo: "🍞",
  Nabiał: "🥛",
  Mięso: "🥩",
  "Warzywa i owoce": "🥦",
  Napoje: "🥤",
  Chemia: "🧴",
  Dziecko: "🍼",
  Dom: "🏠",
  Zwierzęta: "🐾",
  "Auto/Garaż": "🚗",
  Inne: "📦",
};

export const UNITS = ["szt.", "kg", "g", "l", "ml", "opak.", "pęczek", "x"] as const;

const CATEGORY_KEYWORDS: Record<Category, string[]> = {
  Pieczywo: ["chleb", "bułka", "bułki", "bagietka", "kajzerka", "tostowy", "pieczywo"],
  Nabiał: [
    "mleko",
    "jogurt",
    "kefir",
    "maślanka",
    "ser",
    "serek",
    "twaróg",
    "masło",
    "śmietana",
    "mozzarella",
    "feta",
  ],
  Mięso: [
    "kurczak",
    "indyk",
    "schab",
    "karkówka",
    "boczek",
    "kiełbasa",
    "szynka",
    "mięso",
    "wołowina",
    "wieprzowina",
  ],
  "Warzywa i owoce": [
    "banan",
    "banany",
    "jabłko",
    "jabłka",
    "ziemniaki",
    "pomidor",
    "pomidory",
    "ogórek",
    "marchew",
    "cebula",
    "czosnek",
    "sałata",
    "cytryna",
    "pomarańcza",
  ],
  Napoje: ["woda", "cola", "sok", "napój", "herbata", "kawa", "energetyk"],
  Chemia: [
    "płyn do naczyń",
    "proszek",
    "kapsułki",
    "tabletki do zmywarki",
    "papier toaletowy",
    "ręcznik papierowy",
    "mydło",
    "szampon",
    "żel pod prysznic",
    "pasta do zębów",
    "dezodorant",
  ],
  Dziecko: ["pieluchy", "chusteczki", "mleko modyfikowane", "kaszka"],
  Dom: [
    "worki na śmieci",
    "żarówka",
    "baterie",
    "świeczki",
    "folia aluminiowa",
    "papier do pieczenia",
  ],
  Zwierzęta: ["karma", "żwirek", "przysmaki dla psa", "przysmaki dla kota"],
  "Auto/Garaż": [
    "olej",
    "płyn do spryskiwaczy",
    "odmrażacz",
    "zapach samochodowy",
    "rękawiczki robocze",
  ],
  Inne: [],
};

export function categorizeProduct(name: string): Category {
  const normalized = name.trim().toLocaleLowerCase("pl-PL");
  if (!normalized) return "Inne";

  for (const category of CATEGORIES) {
    if (category === "Inne") continue;
    if (CATEGORY_KEYWORDS[category].some((keyword) => normalized.includes(keyword))) {
      return category;
    }
  }
  return "Inne";
}

export interface ParsedProduct {
  name: string;
  quantity: number | null;
  unit: string;
  category: Category;
  categoryRecognized: boolean;
}

const UNIT_ALIASES: Record<string, string> = {
  szt: "szt.",
  "szt.": "szt.",
  kg: "kg",
  g: "g",
  l: "l",
  ml: "ml",
  opak: "opak.",
  "opak.": "opak.",
  x: "x",
};

export function parseProductLine(line: string): ParsedProduct | null {
  const trimmed = line.trim();
  if (!trimmed) return null;

  const match = trimmed.match(/^(.*?)(?:\s+|^)(\d+(?:[.,]\d+)?)\s*(szt\.?|kg|g|l|ml|opak\.?|x)?$/i);
  const rawName = match?.[1]?.trim() || trimmed;
  const quantity = match ? Number(match[2].replace(",", ".")) : null;
  const rawUnit = match?.[3]?.toLocaleLowerCase("pl-PL") ?? "";
  const unit = rawUnit ? (UNIT_ALIASES[rawUnit] ?? rawUnit) : "";
  const category = categorizeProduct(rawName);

  return {
    name: rawName,
    quantity: Number.isFinite(quantity) ? quantity : null,
    unit,
    category,
    categoryRecognized: category !== "Inne",
  };
}

export function parseQuickList(text: string): ParsedProduct[] {
  return text
    .split(/\r?\n/)
    .map(parseProductLine)
    .filter((item): item is ParsedProduct => item !== null);
}
