import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import { buildClientConfig, prepareClientFonts } from "../src/config/create-client.js";
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
    brand: {
      primaryColor: "#123456",
      accentColor: "#abcdef",
      logo: {},
      fontRegularPath: "assets/clients/novy-klient/font-regular.ttf",
      fontBoldPath: "assets/clients/novy-klient/font-bold.ttf",
    },
    storage: { bucket: "meta-catalog-images", publicBaseUrl: "https://assets.example.com" },
  });

  assert.deepEqual(validateClientConfig(config, "novy-klient"), []);
  assert.equal(config.storage.prefix, "novy-klient");
  assert.equal(config.brand.logoPath, "assets/clients/novy-klient/logo.png");
  assert.equal(config.brand.fontRegularPath, "assets/clients/novy-klient/font-regular.ttf");
  assert.equal(config.brand.fontBoldPath, "assets/clients/novy-klient/font-bold.ttf");
  assert.equal(config.template.logo.show, true);
  assert.equal(config.templateVersion, 1);
});

test("availability filter can be disabled for feeds with custom values", () => {
  const config = buildClientConfig({
    clientId: "csv-klient",
    name: "CSV klient",
    feed: { url: "https://example.com/products.tsv", format: "csv", delimiter: "\t", fields },
    availabilityFilter: false,
    storage: { bucket: "meta-catalog-images", publicBaseUrl: "https://assets.example.com" },
  });

  assert.deepEqual(validateClientConfig(config, "csv-klient"), []);
  assert.deepEqual(config.filters.rules, []);
  assert.equal(config.template.logo.show, false);
});

test("client fonts are validated by the production renderer", async () => {
  const [regular, bold] = await Promise.all([
    readFile(new URL("../assets/fonts/Poppins-Regular.ttf", import.meta.url)),
    readFile(new URL("../assets/fonts/Poppins-Bold.ttf", import.meta.url)),
  ]);
  const fonts = await prepareClientFonts({
    fontRegular: { data: regular.toString("base64") },
    fontBold: { data: bold.toString("base64") },
  });
  assert.equal(fonts.regular.extension, ".ttf");
  assert.equal(fonts.bold.extension, ".ttf");
});
