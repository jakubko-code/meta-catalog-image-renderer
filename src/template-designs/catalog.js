export const TEMPLATE_DESIGN_CATEGORIES = [
  { id: "all", name: "Všetky" },
  { id: "universal", name: "Univerzálne" },
  { id: "product", name: "Produktové" },
  { id: "minimal", name: "Minimalistické" },
];

export const TEMPLATE_DESIGNS = [
  {
    id: "classic",
    version: 1,
    name: "Klasická",
    category: "universal",
    description: "Univerzálne rozloženie s produktovou kartou a cenou v päte.",
  },
  {
    id: "split",
    version: 2,
    name: "Rozdelená",
    category: "product",
    description: "Produkt vľavo, názov a cenová komunikácia vpravo.",
  },
  {
    id: "bottomBanner",
    version: 1,
    name: "Spodný pás",
    category: "product",
    description: "Veľký produkt a výrazný cenový pás v spodnej časti.",
  },
  {
    id: "minimal",
    version: 1,
    name: "Minimalistická",
    category: "minimal",
    description: "Čistá kompozícia bez rámu okolo produktového obrázka.",
  },
];

export const TEMPLATE_DESIGN_IDS = TEMPLATE_DESIGNS.map((design) => design.id);

export function getTemplateDesign(designId) {
  return TEMPLATE_DESIGNS.find((design) => design.id === designId) ?? null;
}

export function templateDesignLibrary() {
  return {
    categories: TEMPLATE_DESIGN_CATEGORIES,
    designs: TEMPLATE_DESIGNS,
  };
}
