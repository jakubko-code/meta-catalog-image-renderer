import {
  R2Store,
  verifyPublicImage,
  verifyPublicSupplementaryFeed,
} from "../storage/r2-client.js";
import { renderCatalog } from "./render-catalog.js";
import { createSupplementaryFeed } from "./supplementary-feed.js";

export async function publishCatalog(config, options = {}) {
  if (config.storage.publicBaseUrl.includes("example.")) {
    throw new Error("storage.publicBaseUrl is still a placeholder. Set the public R2 URL in the client config first.");
  }

  const reportProgress = (progress) => {
    try {
      options.onProgress?.(progress);
    } catch {
      // Stav UI nesmie zhodiť publikovanie katalógu.
    }
  };
  reportProgress({ stage: "loadingRemoteState", completedCount: 0, totalCount: 0 });
  const store = new R2Store(config);
  const remoteState = await store.loadState(config);
  let newlyUploadedCount = 0;
  let existingImageCount = 0;

  const result = await renderCatalog(config, {
    ...options,
    initialState: remoteState,
    trustStateImages: true,
    onImageRendered: async ({ entry, image }) => {
      const upload = await store.uploadImage(config, entry, image);
      if (upload.uploaded) newlyUploadedCount += 1;
      else existingImageCount += 1;
    },
  });
  const supplementaryFeed = createSupplementaryFeed(result.supplementaryRows);
  reportProgress({
    stage: "publishingMetadata",
    completedCount: result.selectedCount,
    totalCount: result.selectedCount,
    renderedCount: result.renderedCount,
    reusedLocalCount: result.reusedLocalCount,
    skippedCount: result.skippedCount,
    failedCount: result.errors.length,
  });
  await store.uploadCatalogMetadata(config, result.state, supplementaryFeed);

  const firstImage = result.supplementaryRows[0];
  if (!firstImage) throw new Error("Nothing was published because the supplementary feed is empty.");
  const publicCheck = await verifyPublicImage(firstImage.imageLink);
  const publicSupplementaryUrl = [
    config.storage.publicBaseUrl.replace(/\/$/, ""),
    config.storage.prefix.replace(/^\/+|\/+$/g, ""),
    config.storage.supplementaryFeedKey.replace(/^\/+/, ""),
  ].join("/");
  const supplementaryCheck = await verifyPublicSupplementaryFeed(publicSupplementaryUrl);
  reportProgress({
    stage: "completed",
    completedCount: result.selectedCount,
    totalCount: result.selectedCount,
    renderedCount: result.renderedCount,
    reusedLocalCount: result.reusedLocalCount,
    skippedCount: result.skippedCount,
    failedCount: result.errors.length,
    uploadedImageCount: newlyUploadedCount,
  });

  return {
    ...result,
    uploadedImageCount: newlyUploadedCount,
    existingImageCount,
    publicCheck,
    supplementaryCheck,
  };
}
