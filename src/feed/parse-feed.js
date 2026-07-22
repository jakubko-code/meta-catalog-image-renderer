import { parseCsvFeed } from "./parse-csv.js";
import { parseXmlFeed } from "./parse-xml.js";

export function parseFeed(source, feedConfig) {
  if (feedConfig.format === "xml") return parseXmlFeed(source, feedConfig.productPath);
  if (feedConfig.format === "csv") return parseCsvFeed(source, feedConfig.delimiter);
  throw new Error(`Unsupported feed format ${JSON.stringify(feedConfig.format)}.`);
}
