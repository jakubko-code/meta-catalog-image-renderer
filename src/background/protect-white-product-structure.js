import sharp from "sharp";

function isWhiteCandidate(data, offset, threshold, maximumSpread) {
  if (data[offset + 3] < 240) return true;
  const red = data[offset];
  const green = data[offset + 1];
  const blue = data[offset + 2];
  return Math.min(red, green, blue) >= threshold
    && Math.max(red, green, blue) - Math.min(red, green, blue) <= maximumSpread;
}

function edgeAlpha(data, offset, threshold) {
  const darkest = Math.min(data[offset], data[offset + 1], data[offset + 2]);
  return Math.max(0, Math.min(255, Math.round((255 - darkest) * 255 / (255 - threshold))));
}

export async function protectWhiteProductStructure(source, cutout, {
  whiteThreshold = 240,
  maximumSpread = 24,
  minimumBorderWhiteRatio = 0.85,
  minimumEnclosedRatio = 0.015,
  maximumRetainedRatio = 0.4,
} = {}) {
  const cutoutImage = sharp(cutout, { failOn: "error" }).ensureAlpha();
  const metadata = await cutoutImage.metadata();
  const width = metadata.width;
  const height = metadata.height;
  const [sourceData, cutoutData] = await Promise.all([
    sharp(source, { failOn: "error" })
      .rotate()
      .resize(width, height, { fit: "fill" })
      .ensureAlpha()
      .raw()
      .toBuffer(),
    cutoutImage.raw().toBuffer(),
  ]);

  const pixelCount = width * height;
  const white = new Uint8Array(pixelCount);
  const connectedBackground = new Uint8Array(pixelCount);
  const queue = new Int32Array(pixelCount);
  let borderWhiteCount = 0;
  let borderPixelCount = 0;

  for (let index = 0; index < pixelCount; index += 1) {
    white[index] = isWhiteCandidate(sourceData, index * 4, whiteThreshold, maximumSpread) ? 1 : 0;
  }

  const addBorder = (index) => {
    borderPixelCount += 1;
    if (!white[index]) return;
    borderWhiteCount += 1;
    connectedBackground[index] = 1;
  };
  for (let x = 0; x < width; x += 1) {
    addBorder(x);
    addBorder((height - 1) * width + x);
  }
  for (let y = 1; y < height - 1; y += 1) {
    addBorder(y * width);
    addBorder(y * width + width - 1);
  }

  if (borderWhiteCount / borderPixelCount < minimumBorderWhiteRatio) {
    return { image: cutout, applied: false, reason: "non-white-background" };
  }

  let queueStart = 0;
  let queueEnd = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (connectedBackground[index]) queue[queueEnd++] = index;
  }
  while (queueStart < queueEnd) {
    const index = queue[queueStart++];
    const x = index % width;
    const neighbours = [
      x > 0 ? index - 1 : -1,
      x < width - 1 ? index + 1 : -1,
      index >= width ? index - width : -1,
      index < pixelCount - width ? index + width : -1,
    ];
    for (const neighbour of neighbours) {
      if (neighbour < 0 || connectedBackground[neighbour] || !white[neighbour]) continue;
      connectedBackground[neighbour] = 1;
      queue[queueEnd++] = neighbour;
    }
  }

  const visited = new Uint8Array(pixelCount);
  const protectedStructure = new Uint8Array(pixelCount);
  let deterministicArea = 0;
  let enclosedArea = 0;

  for (let start = 0; start < pixelCount; start += 1) {
    if (connectedBackground[start] || visited[start]) continue;
    queueStart = 0;
    queueEnd = 1;
    queue[0] = start;
    visited[start] = 1;
    let overlapsModel = false;
    let componentEnclosedArea = 0;

    while (queueStart < queueEnd) {
      const index = queue[queueStart++];
      if (cutoutData[index * 4 + 3] >= 32) overlapsModel = true;
      if (white[index]) componentEnclosedArea += 1;
      const x = index % width;
      const neighbours = [
        x > 0 ? index - 1 : -1,
        x < width - 1 ? index + 1 : -1,
        index >= width ? index - width : -1,
        index < pixelCount - width ? index + width : -1,
      ];
      for (const neighbour of neighbours) {
        if (neighbour < 0 || connectedBackground[neighbour] || visited[neighbour]) continue;
        visited[neighbour] = 1;
        queue[queueEnd++] = neighbour;
      }
    }

    if (!overlapsModel) continue;
    enclosedArea += componentEnclosedArea;
    deterministicArea += queueEnd;
    for (let offset = 0; offset < queueEnd; offset += 1) {
      protectedStructure[queue[offset]] = 1;
    }
  }

  let retainedArea = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (!protectedStructure[index]) continue;
    retainedArea += cutoutData[index * 4 + 3] / 255;
  }
  const retainedRatio = deterministicArea > 0 ? retainedArea / deterministicArea : 1;
  const enclosedRatio = enclosedArea / pixelCount;
  if (enclosedRatio < minimumEnclosedRatio || retainedRatio > maximumRetainedRatio) {
    return {
      image: cutout,
      applied: false,
      reason: enclosedRatio < minimumEnclosedRatio ? "no-large-enclosed-area" : "model-mask-is-complete",
      retainedRatio,
      enclosedRatio,
    };
  }

  const output = Buffer.from(sourceData);
  for (let index = 0; index < pixelCount; index += 1) {
    const offset = index * 4;
    let alpha = cutoutData[offset + 3];
    if (protectedStructure[index]) {
      const protectedAlpha = white[index] && !connectedBackground[index]
        ? 255
        : edgeAlpha(sourceData, offset, whiteThreshold);
      alpha = Math.max(alpha, protectedAlpha);
    }
    output[offset + 3] = alpha;
  }

  return {
    image: await sharp(output, { raw: { width, height, channels: 4 } })
      .png({ compressionLevel: 9 })
      .toBuffer(),
    applied: true,
    retainedRatio,
    enclosedRatio,
  };
}
