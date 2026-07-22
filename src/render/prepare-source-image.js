import sharp from "sharp";

const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

export async function prepareSourceImage(url) {
  let response;
  try {
    response = await fetch(url, {
      headers: { "user-agent": "MetaCatalogImageRenderer/0.1" },
      redirect: "follow",
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`Product image download failed: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Product image download failed with HTTP ${response.status} ${response.statusText}.`);
  }

  const declaredSize = Number(response.headers.get("content-length"));
  if (declaredSize > MAX_SOURCE_BYTES) {
    throw new Error(`Product image exceeds the ${MAX_SOURCE_BYTES / 1024 / 1024} MB limit.`);
  }

  const source = Buffer.from(await response.arrayBuffer());
  if (source.length > MAX_SOURCE_BYTES) {
    throw new Error(`Product image exceeds the ${MAX_SOURCE_BYTES / 1024 / 1024} MB limit.`);
  }

  const prepared = await sharp(source, { failOn: "error", limitInputPixels: 100_000_000 })
    .rotate()
    .resize({ width: 1200, height: 1200, fit: "inside", withoutEnlargement: true })
    .flatten({ background: "#ffffff" })
    .jpeg({ quality: 90, mozjpeg: true })
    .toBuffer();

  return `data:image/jpeg;base64,${prepared.toString("base64")}`;
}
