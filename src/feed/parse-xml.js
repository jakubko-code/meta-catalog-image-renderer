import { XMLParser, XMLValidator } from "fast-xml-parser";

function readPath(value, path) {
  return path.split(".").reduce((current, segment) => current?.[segment], value);
}

export function parseXmlFeed(source, productPath) {
  const validation = XMLValidator.validate(source);
  if (validation !== true) {
    const { line, col, msg } = validation.err;
    throw new Error(`Invalid XML at line ${line}, column ${col}: ${msg}`);
  }

  const parser = new XMLParser({
    ignoreAttributes: false,
    parseAttributeValue: false,
    parseTagValue: false,
    trimValues: true,
  });
  const parsed = parser.parse(source);
  const products = readPath(parsed, productPath);

  if (products === undefined) {
    throw new Error(`XML product path ${JSON.stringify(productPath)} was not found.`);
  }

  const list = Array.isArray(products) ? products : [products];
  if (!list.every((product) => product && typeof product === "object" && !Array.isArray(product))) {
    throw new Error(`XML product path ${JSON.stringify(productPath)} does not contain product objects.`);
  }
  return list;
}
