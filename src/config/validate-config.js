import path from "node:path";
import { EDITOR_FIELD_OPTIONS } from "./editor-schema.js";

const ROOT_KEYS = [
  "clientId",
  "name",
  "templateVersion",
  "feed",
  "filters",
  "output",
  "brand",
  "template",
  "templateVariants",
  "templateRules",
  "processing",
  "storage",
];

const FILTER_OPERATORS = ["eq", "neq", "in", "notIn", "exists", "contains", "categoryIn"];
const HEX_COLOR = /^#[0-9a-f]{6}$/i;

function isObject(value) {
  return value !== null && typeof value === "object" && !Array.isArray(value);
}

function valueType(value) {
  if (Array.isArray(value)) return "array";
  if (value === null) return "null";
  return typeof value;
}

function createChecks(errors) {
  function object(value, field) {
    if (!isObject(value)) {
      errors.push(`${field}: expected object, received ${valueType(value)}`);
      return false;
    }
    return true;
  }

  function knownKeys(value, field, allowedKeys) {
    if (!isObject(value)) return;

    for (const key of Object.keys(value)) {
      if (!allowedKeys.includes(key)) {
        errors.push(`${field}.${key}: unknown field`);
      }
    }
  }

  function string(value, field, { pattern, allowed } = {}) {
    if (typeof value !== "string" || value.trim() === "") {
      errors.push(`${field}: expected a non-empty string`);
      return;
    }
    if (pattern && !pattern.test(value)) {
      errors.push(`${field}: has an invalid format`);
    }
    if (allowed && !allowed.includes(value)) {
      errors.push(`${field}: expected one of ${allowed.join(", ")}; received ${JSON.stringify(value)}`);
    }
  }

  function boolean(value, field) {
    if (typeof value !== "boolean") {
      errors.push(`${field}: expected boolean, received ${valueType(value)}`);
    }
  }

  function integer(value, field, minimum, maximum) {
    if (!Number.isInteger(value) || value < minimum || value > maximum) {
      errors.push(`${field}: expected an integer from ${minimum} to ${maximum}; received ${JSON.stringify(value)}`);
    }
  }

  function url(value, field) {
    string(value, field);
    if (typeof value !== "string" || value.trim() === "") return;

    try {
      const parsed = new URL(value);
      if (parsed.protocol !== "https:") {
        errors.push(`${field}: expected an HTTPS URL`);
      }
    } catch {
      errors.push(`${field}: expected a valid URL`);
    }
  }

  function relativePath(value, field, extensions) {
    string(value, field);
    if (typeof value !== "string" || value.trim() === "") return;

    const segments = value.split(/[\\/]/);
    if (path.isAbsolute(value) || segments.includes("..")) {
      errors.push(`${field}: expected a safe path relative to the repository root`);
    }
    if (extensions && !extensions.some((extension) => value.toLowerCase().endsWith(extension))) {
      errors.push(`${field}: expected file extension ${extensions.join(" or ")}`);
    }
  }

  return { boolean, integer, knownKeys, object, relativePath, string, url };
}

function validateFeed(feed, checks, errors) {
  if (!checks.object(feed, "feed")) return;
  checks.knownKeys(feed, "feed", ["url", "format", "productPath", "delimiter", "fields"]);
  checks.url(feed.url, "feed.url");
  checks.string(feed.format, "feed.format", { allowed: ["xml", "csv"] });

  if (feed.format === "xml") {
    checks.string(feed.productPath, "feed.productPath");
    if ("delimiter" in feed) errors.push("feed.delimiter: only allowed for CSV feeds");
  }

  if (feed.format === "csv") {
    if (typeof feed.delimiter !== "string" || [...feed.delimiter].length !== 1) {
      errors.push("feed.delimiter: expected exactly one character");
    }
    if ("productPath" in feed) errors.push("feed.productPath: only allowed for XML feeds");
  }

  if (!checks.object(feed.fields, "feed.fields")) return;
  const fields = ["id", "title", "imageUrl", "price", "salePrice", "availability"];
  checks.knownKeys(feed.fields, "feed.fields", fields);
  for (const field of fields) checks.string(feed.fields[field], `feed.fields.${field}`);
}

function validateFilters(filters, checks, errors) {
  if (!checks.object(filters, "filters")) return;
  checks.knownKeys(filters, "filters", ["requireId", "requireImage", "rules"]);
  checks.boolean(filters.requireId, "filters.requireId");
  checks.boolean(filters.requireImage, "filters.requireImage");

  if (!Array.isArray(filters.rules)) {
    errors.push(`filters.rules: expected array, received ${valueType(filters.rules)}`);
    return;
  }

  filters.rules.forEach((rule, index) => {
    const field = `filters.rules[${index}]`;
    if (!checks.object(rule, field)) return;
    checks.knownKeys(rule, field, ["field", "operator", "value"]);
    checks.string(rule.field, `${field}.field`);
    checks.string(rule.operator, `${field}.operator`, { allowed: FILTER_OPERATORS });

    if (!("value" in rule)) {
      errors.push(`${field}.value: field is required`);
    } else if (["in", "notIn", "categoryIn"].includes(rule.operator) && (!Array.isArray(rule.value) || rule.value.length === 0)) {
      errors.push(`${field}.value: expected a non-empty array for operator ${rule.operator}`);
    } else if (rule.operator === "exists" && typeof rule.value !== "boolean") {
      errors.push(`${field}.value: expected boolean for operator exists`);
    }
  });
}

function validateOutput(output, checks) {
  if (!checks.object(output, "output")) return;
  checks.knownKeys(output, "output", ["width", "height", "format", "quality"]);
  checks.integer(output.width, "output.width", 100, 4000);
  checks.integer(output.height, "output.height", 100, 4000);
  checks.string(output.format, "output.format", { allowed: ["jpeg"] });
  checks.integer(output.quality, "output.quality", 1, 100);
}

function validateBrand(brand, checks) {
  if (!checks.object(brand, "brand")) return;
  checks.knownKeys(brand, "brand", [
    "logoPath",
    "backgroundImagePath",
    "primaryColor",
    "accentColor",
    "textColor",
    "fontRegularPath",
    "fontBoldPath",
  ]);
  checks.relativePath(brand.logoPath, "brand.logoPath", [".svg", ".png", ".webp"]);
  if (brand.backgroundImagePath !== undefined) {
    checks.relativePath(brand.backgroundImagePath, "brand.backgroundImagePath", [".png", ".webp"]);
  }
  checks.string(brand.primaryColor, "brand.primaryColor", { pattern: HEX_COLOR });
  checks.string(brand.accentColor, "brand.accentColor", { pattern: HEX_COLOR });
  checks.string(brand.textColor, "brand.textColor", { pattern: HEX_COLOR });
  checks.relativePath(brand.fontRegularPath, "brand.fontRegularPath", [".ttf", ".otf", ".woff"]);
  checks.relativePath(brand.fontBoldPath, "brand.fontBoldPath", [".ttf", ".otf", ".woff"]);
}

function validateTemplate(template, checks, errors) {
  if (!checks.object(template, "template")) return;
  checks.knownKeys(template, "template", [
    "layout",
    "theme",
    "backgroundColor",
    "backgroundImage",
    "padding",
    "productImage",
    "logo",
    "price",
    "discountBadge",
    "title",
  ]);
  checks.string(template.layout, "template.layout", { allowed: EDITOR_FIELD_OPTIONS["template.layout"].options });
  if (checks.object(template.theme, "template.theme")) {
    checks.knownKeys(template.theme, "template.theme", ["primaryColor"]);
    checks.string(template.theme.primaryColor, "template.theme.primaryColor", { pattern: HEX_COLOR });
  }
  checks.string(template.backgroundColor, "template.backgroundColor", { pattern: HEX_COLOR });
  if (template.backgroundImage !== undefined
    && checks.object(template.backgroundImage, "template.backgroundImage")) {
    checks.knownKeys(template.backgroundImage, "template.backgroundImage", ["show"]);
    checks.boolean(template.backgroundImage.show, "template.backgroundImage.show");
  }
  checks.integer(
    template.padding,
    "template.padding",
    EDITOR_FIELD_OPTIONS["template.padding"].minimum,
    EDITOR_FIELD_OPTIONS["template.padding"].maximum,
  );

  if (checks.object(template.productImage, "template.productImage")) {
    checks.knownKeys(template.productImage, "template.productImage", ["fit", "heightPercent", "backgroundRemoval"]);
    checks.string(template.productImage.fit, "template.productImage.fit", { allowed: EDITOR_FIELD_OPTIONS["template.productImage.fit"].options });
    checks.integer(
      template.productImage.heightPercent,
      "template.productImage.heightPercent",
      EDITOR_FIELD_OPTIONS["template.productImage.heightPercent"].minimum,
      EDITOR_FIELD_OPTIONS["template.productImage.heightPercent"].maximum,
    );
    if (template.productImage.backgroundRemoval !== undefined
      && checks.object(template.productImage.backgroundRemoval, "template.productImage.backgroundRemoval")) {
      checks.knownKeys(template.productImage.backgroundRemoval, "template.productImage.backgroundRemoval", ["enabled", "provider", "paddingPercent"]);
      checks.boolean(template.productImage.backgroundRemoval.enabled, "template.productImage.backgroundRemoval.enabled");
      checks.string(template.productImage.backgroundRemoval.provider, "template.productImage.backgroundRemoval.provider", {
        allowed: EDITOR_FIELD_OPTIONS["template.productImage.backgroundRemoval.provider"].options,
      });
      checks.integer(
        template.productImage.backgroundRemoval.paddingPercent,
        "template.productImage.backgroundRemoval.paddingPercent",
        EDITOR_FIELD_OPTIONS["template.productImage.backgroundRemoval.paddingPercent"].minimum,
        EDITOR_FIELD_OPTIONS["template.productImage.backgroundRemoval.paddingPercent"].maximum,
      );
    }
  }

  if (checks.object(template.logo, "template.logo")) {
    checks.knownKeys(template.logo, "template.logo", ["show", "position", "maxWidth"]);
    checks.boolean(template.logo.show, "template.logo.show");
    checks.string(template.logo.position, "template.logo.position", { allowed: EDITOR_FIELD_OPTIONS["template.logo.position"].options });
    checks.integer(
      template.logo.maxWidth,
      "template.logo.maxWidth",
      EDITOR_FIELD_OPTIONS["template.logo.maxWidth"].minimum,
      EDITOR_FIELD_OPTIONS["template.logo.maxWidth"].maximum,
    );
  }

  if (checks.object(template.price, "template.price")) {
    checks.knownKeys(template.price, "template.price", [
      "show",
      "position",
      "fontSize",
      "showOriginalPrice",
      "saleLabel",
      "regularLabel",
      "backgroundColor",
      "textColor",
      "originalPriceColor",
    ]);
    checks.boolean(template.price.show, "template.price.show");
    checks.string(template.price.position, "template.price.position", { allowed: EDITOR_FIELD_OPTIONS["template.price.position"].options });
    checks.integer(
      template.price.fontSize,
      "template.price.fontSize",
      EDITOR_FIELD_OPTIONS["template.price.fontSize"].minimum,
      EDITOR_FIELD_OPTIONS["template.price.fontSize"].maximum,
    );
    checks.boolean(template.price.showOriginalPrice, "template.price.showOriginalPrice");
    if (template.layout === "cleanBackdrop") {
      if (typeof template.price.saleLabel !== "string") {
        errors.push(`template.price.saleLabel: expected string, received ${valueType(template.price.saleLabel)}`);
      }
      if (typeof template.price.regularLabel !== "string") {
        errors.push(`template.price.regularLabel: expected string, received ${valueType(template.price.regularLabel)}`);
      }
    } else {
      checks.string(template.price.saleLabel, "template.price.saleLabel");
      checks.string(template.price.regularLabel, "template.price.regularLabel");
    }
    checks.string(template.price.backgroundColor, "template.price.backgroundColor", { pattern: HEX_COLOR });
    checks.string(template.price.textColor, "template.price.textColor", { pattern: HEX_COLOR });
    checks.string(template.price.originalPriceColor, "template.price.originalPriceColor", { pattern: HEX_COLOR });
  }

  if (checks.object(template.discountBadge, "template.discountBadge")) {
    checks.knownKeys(template.discountBadge, "template.discountBadge", [
      "show",
      "minimumPercent",
      "position",
      "text",
      "backgroundColor",
      "textColor",
    ]);
    checks.boolean(template.discountBadge.show, "template.discountBadge.show");
    checks.integer(
      template.discountBadge.minimumPercent,
      "template.discountBadge.minimumPercent",
      EDITOR_FIELD_OPTIONS["template.discountBadge.minimumPercent"].minimum,
      EDITOR_FIELD_OPTIONS["template.discountBadge.minimumPercent"].maximum,
    );
    checks.string(template.discountBadge.position, "template.discountBadge.position", { allowed: EDITOR_FIELD_OPTIONS["template.discountBadge.position"].options });
    checks.string(template.discountBadge.text, "template.discountBadge.text");
    if (typeof template.discountBadge.text === "string" && !template.discountBadge.text.includes("{percent}")) {
      errors.push("template.discountBadge.text: must contain the {percent} placeholder");
    }
    checks.string(template.discountBadge.backgroundColor, "template.discountBadge.backgroundColor", { pattern: HEX_COLOR });
    checks.string(template.discountBadge.textColor, "template.discountBadge.textColor", { pattern: HEX_COLOR });
  }

  if (checks.object(template.title, "template.title")) {
    checks.knownKeys(template.title, "template.title", ["show", "fontSize", "maxCharacters", "textColor"]);
    checks.boolean(template.title.show, "template.title.show");
    checks.integer(
      template.title.fontSize,
      "template.title.fontSize",
      EDITOR_FIELD_OPTIONS["template.title.fontSize"].minimum,
      EDITOR_FIELD_OPTIONS["template.title.fontSize"].maximum,
    );
    checks.integer(
      template.title.maxCharacters,
      "template.title.maxCharacters",
      EDITOR_FIELD_OPTIONS["template.title.maxCharacters"].minimum,
      EDITOR_FIELD_OPTIONS["template.title.maxCharacters"].maximum,
    );
    checks.string(template.title.textColor, "template.title.textColor", { pattern: HEX_COLOR });
  }
}

function validateTemplateCollection(config, checks, errors) {
  const variants = config.templateVariants ?? [];
  const rules = config.templateRules ?? [];
  if (!Array.isArray(variants)) {
    errors.push(`templateVariants: expected array, received ${valueType(variants)}`);
    return;
  }
  if (!Array.isArray(rules)) {
    errors.push(`templateRules: expected array, received ${valueType(rules)}`);
    return;
  }

  const variantIds = new Set();
  variants.forEach((variant, index) => {
    const field = `templateVariants[${index}]`;
    if (!checks.object(variant, field)) return;
    checks.knownKeys(variant, field, ["id", "name", "template"]);
    checks.string(variant.id, `${field}.id`, { pattern: /^[a-z0-9][a-z0-9-]*$/ });
    checks.string(variant.name, `${field}.name`);
    if (variant.id === "default") errors.push(`${field}.id: default is reserved`);
    if (variantIds.has(variant.id)) errors.push(`${field}.id: duplicate template ID`);
    variantIds.add(variant.id);
    validateTemplate(variant.template, checks, errors);
  });

  const ruleIds = new Set();
  rules.forEach((rule, index) => {
    const field = `templateRules[${index}]`;
    if (!checks.object(rule, field)) return;
    checks.knownKeys(rule, field, ["id", "name", "templateId", "conditions"]);
    checks.string(rule.id, `${field}.id`, { pattern: /^[a-z0-9][a-z0-9-]*$/ });
    checks.string(rule.name, `${field}.name`);
    checks.string(rule.templateId, `${field}.templateId`);
    if (ruleIds.has(rule.id)) errors.push(`${field}.id: duplicate rule ID`);
    ruleIds.add(rule.id);
    if (!variantIds.has(rule.templateId)) errors.push(`${field}.templateId: unknown template ${JSON.stringify(rule.templateId)}`);
    if (!Array.isArray(rule.conditions) || rule.conditions.length === 0) {
      errors.push(`${field}.conditions: expected a non-empty array`);
      return;
    }
    rule.conditions.forEach((condition, conditionIndex) => {
      const conditionField = `${field}.conditions[${conditionIndex}]`;
      if (!checks.object(condition, conditionField)) return;
      checks.knownKeys(condition, conditionField, ["field", "operator", "value"]);
      checks.string(condition.field, `${conditionField}.field`);
      checks.string(condition.operator, `${conditionField}.operator`, { allowed: ["eq", "neq", "gte", "lte", "contains", "categoryIn"] });
      if (!("value" in condition)) errors.push(`${conditionField}.value: field is required`);
      if (condition.operator === "categoryIn" && (!Array.isArray(condition.value) || condition.value.length === 0)) {
        errors.push(`${conditionField}.value: expected a non-empty array`);
      }
    });
  });
}

function validateStorage(storage, checks, errors) {
  if (!checks.object(storage, "storage")) return;
  checks.knownKeys(storage, "storage", [
    "bucket",
    "publicBaseUrl",
    "prefix",
    "imageKeyPrefix",
    "stateKey",
    "supplementaryFeedKey",
  ]);
  checks.string(storage.bucket, "storage.bucket", { pattern: /^[a-z0-9][a-z0-9.-]*[a-z0-9]$/ });
  checks.url(storage.publicBaseUrl, "storage.publicBaseUrl");
  checks.string(storage.prefix, "storage.prefix", { pattern: /^[a-z0-9][a-z0-9/_-]*[a-z0-9]$/ });
  checks.string(storage.imageKeyPrefix, "storage.imageKeyPrefix", { pattern: /^[a-z0-9][a-z0-9/_-]*[a-z0-9]$/ });
  checks.relativePath(storage.stateKey, "storage.stateKey", [".json"]);
  checks.relativePath(storage.supplementaryFeedKey, "storage.supplementaryFeedKey", [".csv"]);

  if (typeof storage.publicBaseUrl === "string" && storage.publicBaseUrl.endsWith("/")) {
    errors.push("storage.publicBaseUrl: must not end with a slash");
  }
}

function validateProcessing(processing, checks) {
  if (!checks.object(processing, "processing")) return;
  checks.knownKeys(processing, "processing", ["concurrency"]);
  checks.integer(processing.concurrency, "processing.concurrency", 1, 32);
}

export function validateClientConfig(config, expectedClientId) {
  const errors = [];
  const checks = createChecks(errors);

  if (!checks.object(config, "config")) return ["config: expected object"];
  checks.knownKeys(config, "config", ROOT_KEYS);
  checks.string(config.clientId, "clientId", { pattern: /^[a-z0-9][a-z0-9-]*$/ });
  checks.string(config.name, "name");
  checks.integer(config.templateVersion, "templateVersion", 1, Number.MAX_SAFE_INTEGER);

  if (expectedClientId && config.clientId !== expectedClientId) {
    errors.push(`clientId: expected ${JSON.stringify(expectedClientId)} to match the config filename; received ${JSON.stringify(config.clientId)}`);
  }

  validateFeed(config.feed, checks, errors);
  validateFilters(config.filters, checks, errors);
  validateOutput(config.output, checks);
  validateBrand(config.brand, checks);
  validateTemplate(config.template, checks, errors);
  validateTemplateCollection(config, checks, errors);
  validateProcessing(config.processing, checks);
  validateStorage(config.storage, checks, errors);

  return errors;
}
