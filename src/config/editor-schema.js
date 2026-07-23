import { TEMPLATE_DESIGN_IDS } from "../template-designs/catalog.js";

const POSITION_OPTIONS = ["topLeft", "topRight", "bottomLeft", "bottomRight"];
const POSITION_LABELS = {
  topLeft: "Hore vľavo",
  topRight: "Hore vpravo",
  bottomLeft: "Dole vľavo",
  bottomRight: "Dole vpravo",
};

export const EDITOR_FIELD_OPTIONS = {
  "template.layout": { options: TEMPLATE_DESIGN_IDS },
  "template.padding": { minimum: 0, maximum: 500, step: 1 },
  "template.productImage.fit": {
    options: ["contain", "cover"],
    optionLabels: {
      contain: "Zobraziť celý obrázok",
      cover: "Vyplniť celú plochu",
    },
  },
  "template.productImage.heightPercent": { minimum: 1, maximum: 100, step: 1, suffix: "%" },
  "template.productImage.backgroundRemoval.provider": {
    options: ["birefnet"],
    optionLabels: { birefnet: "BiRefNet" },
  },
  "template.productImage.backgroundRemoval.paddingPercent": { minimum: 0, maximum: 30, step: 1, suffix: "%" },
  "template.logo.position": { options: POSITION_OPTIONS, optionLabels: POSITION_LABELS },
  "template.logo.maxWidth": { minimum: 1, maximum: 2000, step: 1, suffix: "px" },
  "template.price.position": { options: POSITION_OPTIONS, optionLabels: POSITION_LABELS },
  "template.price.fontSize": { minimum: 1, maximum: 500, step: 1, suffix: "px" },
  "template.discountBadge.minimumPercent": { minimum: 1, maximum: 99, step: 1, suffix: "%" },
  "template.discountBadge.position": { options: POSITION_OPTIONS, optionLabels: POSITION_LABELS },
  "template.title.fontSize": { minimum: 1, maximum: 200, step: 1, suffix: "px" },
  "template.title.maxCharacters": { minimum: 1, maximum: 500, step: 1 },
};

function labelFor(key) {
  const labels = {
    theme: "Farby značky",
    primaryColor: "Hlavná farba",
    accentColor: "Akcentová farba",
    textColor: "Farba textu",
    backgroundColor: "Farba pozadia",
    padding: "Vnútorný okraj",
    productImage: "Produktový obrázok",
    fit: "Prispôsobenie obrázka",
    heightPercent: "Výška produktovej plochy",
    backgroundRemoval: "Odstránenie pozadia",
    enabled: "Použiť produkt bez pozadia",
    provider: "Lokálny model",
    paddingPercent: "Okraj okolo výrezu",
    show: "Zobraziť",
    position: "Pozícia",
    maxWidth: "Maximálna šírka",
    fontSize: "Veľkosť písma",
    showOriginalPrice: "Zobraziť pôvodnú cenu",
    saleLabel: "Text pri akciovej cene",
    regularLabel: "Text pri bežnej cene",
    originalPriceColor: "Farba pôvodnej ceny",
    minimumPercent: "Minimálna zľava",
    text: "Text odznaku",
    maxCharacters: "Maximálny počet znakov",
  };
  if (labels[key]) return labels[key];
  return key
    .replace(/([a-z0-9])([A-Z])/g, "$1 $2")
    .replace(/^./, (character) => character.toUpperCase());
}

function fieldType(key, value, metadata) {
  if (metadata.options) return "select";
  if (typeof value === "boolean") return "boolean";
  if (typeof value === "number") return "number";
  if (/color$/i.test(key) && /^#[0-9a-f]{6}$/i.test(value)) return "color";
  return "text";
}

function describeObject(value, path) {
  return Object.entries(value).map(([key, child]) => {
    const fieldPath = `${path}.${key}`;
    if (child && typeof child === "object" && !Array.isArray(child)) {
      return { kind: "group", key, label: labelFor(key), path: fieldPath, fields: describeObject(child, fieldPath) };
    }

    const metadata = EDITOR_FIELD_OPTIONS[fieldPath] ?? (
      typeof child === "number"
        ? { minimum: 0, maximum: Math.max(100, child * 2), step: 1 }
        : {}
    );
    return {
      kind: "field",
      key,
      label: labelFor(key),
      path: fieldPath,
      type: fieldType(key, child, metadata),
      ...metadata,
    };
  });
}

export function createEditorSchema(config) {
  const template = config.template;
  const sections = [];

  const appearanceFields = [
    ...(template.theme ? describeObject(template.theme, "template.theme") : []),
    ...(["backgroundColor", "padding"]
      .filter((key) => key in template)
      .flatMap((key) => describeObject({ [key]: template[key] }, "template"))),
  ];
  if (appearanceFields.length) {
    sections.push({
      kind: "section",
      key: "appearance",
      label: "Vzhľad",
      description: "Farby a odsadenie celej šablóny",
      openByDefault: true,
      fields: appearanceFields,
    });
  }

  const sectionDefinitions = [
    ["productImage", "Produktový obrázok", "Veľkosť, umiestnenie a odstránenie pozadia", true],
    ["price", "Cena", "Cenový blok, texty a farby", true],
    ["logo", "Logo", "Viditeľnosť, pozícia a maximálna šírka", false],
    ["discountBadge", "Zľavový odznak", "Zobrazenie zľavy a vzhľad odznaku", false],
    ["title", "Názov produktu", "Viditeľnosť a typografia názvu", false],
  ];
  for (const [key, label, description, openByDefault] of sectionDefinitions) {
    if (!template[key] || typeof template[key] !== "object") continue;
    sections.push({
      kind: "section",
      key,
      label,
      description,
      openByDefault,
      fields: describeObject(template[key], `template.${key}`),
    });
  }

  const knownKeys = new Set([
    "layout",
    "theme",
    "backgroundColor",
    "backgroundImage",
    "padding",
    ...sectionDefinitions.map(([key]) => key),
  ]);
  const additionalSettings = Object.fromEntries(
    Object.entries(template).filter(([key]) => !knownKeys.has(key)),
  );
  if (Object.keys(additionalSettings).length) {
    sections.push({
      kind: "section",
      key: "additional",
      label: "Ďalšie nastavenia",
      description: "Doplnkové možnosti vybraného dizajnu",
      openByDefault: false,
      fields: describeObject(additionalSettings, "template"),
    });
  }

  return sections;
}
