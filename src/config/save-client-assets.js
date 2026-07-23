import { randomUUID } from "node:crypto";
import { mkdir, rename, unlink, writeFile } from "node:fs/promises";
import path from "node:path";

import { resolveProjectPath } from "../project-root.js";
import { prepareClientBackground, prepareClientFonts, prepareClientLogo } from "./create-client.js";
import { loadClientConfig } from "./load-config.js";
import { validateClientConfig } from "./validate-config.js";

function badRequest(message) {
  const error = new Error(message);
  error.statusCode = 400;
  return error;
}

export async function saveClientAssets(clientId, input) {
  const hasLogo = Boolean(input.logo);
  const hasBackground = Boolean(input.background);
  const hasFonts = Boolean(input.fontRegular || input.fontBold);
  if (!hasLogo && !hasBackground && !hasFonts) {
    throw badRequest("Upload a logo, a 1080 × 1080 px background, a Regular/Bold font pair, or a combination of them.");
  }

  const current = await loadClientConfig(clientId);
  const [logo, background, fonts] = await Promise.all([
    hasLogo ? prepareClientLogo(input.logo, current.name) : null,
    hasBackground ? prepareClientBackground(input.background) : null,
    hasFonts ? prepareClientFonts(input) : null,
  ]);
  const regularName = fonts ? `font-regular${fonts.regular.extension}` : null;
  const boldName = fonts ? `font-bold${fonts.bold.extension}` : null;
  const next = {
    ...current,
    templateVersion: current.templateVersion + 1,
    brand: {
      ...current.brand,
      ...(logo ? { logoPath: `assets/clients/${clientId}/logo.png` } : {}),
      ...(background ? { backgroundImagePath: `assets/clients/${clientId}/background.png` } : {}),
      ...(fonts ? {
        fontRegularPath: `assets/clients/${clientId}/${regularName}`,
        fontBoldPath: `assets/clients/${clientId}/${boldName}`,
      } : {}),
    },
    template: {
      ...current.template,
      logo: { ...current.template.logo, show: logo ? true : current.template.logo.show },
    },
  };
  const errors = validateClientConfig(next, clientId);
  if (errors.length) throw badRequest(errors.join("; "));

  const clientDirectory = resolveProjectPath(`assets/clients/${clientId}`);
  const configPath = resolveProjectPath(`clients/${clientId}.json`);
  const suffix = `.tmp-${process.pid}-${randomUUID()}`;
  const files = [
    ...(logo ? [{ name: "logo.png", data: logo }] : []),
    ...(background ? [{ name: "background.png", data: background }] : []),
    ...(fonts ? [
      { name: regularName, data: fonts.regular.data },
      { name: boldName, data: fonts.bold.data },
    ] : []),
  ].map((file) => ({
    ...file,
    finalPath: path.join(clientDirectory, file.name),
    temporaryPath: path.join(clientDirectory, `${file.name}${suffix}`),
  }));
  const temporaryConfigPath = `${configPath}${suffix}`;
  await mkdir(clientDirectory, { recursive: true });
  try {
    await Promise.all(files.map((file) => writeFile(file.temporaryPath, file.data, { flag: "wx" })));
    await writeFile(temporaryConfigPath, `${JSON.stringify(next, null, 2)}\n`, { flag: "wx" });
    await Promise.all(files.map((file) => rename(file.temporaryPath, file.finalPath)));
    await rename(temporaryConfigPath, configPath);
  } catch (error) {
    await Promise.allSettled([
      unlink(temporaryConfigPath),
      ...files.map((file) => unlink(file.temporaryPath)),
    ]);
    throw error;
  }
  return next;
}
