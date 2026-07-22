import assert from "node:assert/strict";
import test from "node:test";

import { buildClientConfig } from "../src/config/create-client.js";
import { validateClientConfig } from "../src/config/validate-config.js";

const fields = {
  id: "g:id",
  title: "title",
  imageUrl: "g:image_link",
  price: "g:price",
  salePrice: "g:sale_price",
  availability: "g:availability",
};

test("new clients get isolated paths and a valid reusable config", () => {
  const config = buildClientConfig({
    clientId: "novy-klient",
    name: "Nový klient",
    feed: { url: "https://example.com/products.xml", format: "xml", productPath: "rss.channel.item", fields },
    brand: { primaryColor: "#123456", accentColor: "#abcdef", logo: {} },
    storage: { bucket: "meta-catalog-images", publicBaseUrl: "https://assets.example.com" },
  });

  assert.deepEqual(validateClientConfig(config, "novy-klient"), []);
  assert.equal(config.storage.prefix, "novy-klient");
  assert.equal(config.brand.logoPath, "assets/clients/novy-klient/logo.png");
  assert.equal(config.template.logo.show, true);
  assert.equal(config.templateVersion, 1);
});

test("availability filter can be disabled for feeds with custom values", () => {
  const config = buildClientConfig({
    clientId: "csv-klient",
    name: "CSV klient",
    feed: { url: "https://example.com/products.csv", format: "csv", delimiter: ";", fields },
    availabilityFilter: false,
    storage: { bucket: "meta-catalog-images", publicBaseUrl: "https://assets.example.com" },
  });

  assert.deepEqual(validateClientConfig(config, "csv-klient"), []);
  assert.deepEqual(config.filters.rules, []);
  assert.equal(config.template.logo.show, false);
});
