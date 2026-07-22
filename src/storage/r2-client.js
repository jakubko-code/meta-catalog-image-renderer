import {
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

const IMMUTABLE_CACHE_CONTROL = "public, max-age=31536000, immutable";

function requiredEnvironment(environment, key) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`Missing ${key}. Add it to .env locally and to GitHub Secrets for automation.`);
  return value;
}

function isNotFound(error) {
  return error?.name === "NoSuchKey" || error?.$metadata?.httpStatusCode === 404;
}

function isPreconditionFailure(error) {
  return error?.name === "PreconditionFailed" || error?.$metadata?.httpStatusCode === 412;
}

function objectKey(...parts) {
  return parts.map((part) => part.replace(/^\/+|\/+$/g, "")).filter(Boolean).join("/");
}

export class R2Store {
  constructor(config, environment = process.env) {
    const accountId = requiredEnvironment(environment, "R2_ACCOUNT_ID");
    const accessKeyId = requiredEnvironment(environment, "R2_ACCESS_KEY_ID");
    const secretAccessKey = requiredEnvironment(environment, "R2_SECRET_ACCESS_KEY");
    const jurisdiction = environment.R2_JURISDICTION?.trim();
    const endpoint = jurisdiction && jurisdiction !== "default"
      ? `https://${accountId}.${jurisdiction}.r2.cloudflarestorage.com`
      : `https://${accountId}.r2.cloudflarestorage.com`;

    this.bucket = config.storage.bucket;
    this.prefix = config.storage.prefix;
    this.client = new S3Client({
      region: "auto",
      endpoint,
      credentials: { accessKeyId, secretAccessKey },
      maxAttempts: 4,
    });
  }

  key(...parts) {
    return objectKey(this.prefix, ...parts);
  }

  async loadState(config) {
    const key = this.key(config.storage.stateKey);
    let response;
    try {
      response = await this.client.send(new GetObjectCommand({ Bucket: this.bucket, Key: key }));
    } catch (error) {
      if (isNotFound(error)) return { version: 1, clientId: config.clientId, products: {} };
      throw new Error(`Unable to read R2 state ${key}: ${error.message}`);
    }

    let state;
    try {
      state = JSON.parse(await response.Body.transformToString());
    } catch (error) {
      throw new Error(`R2 state ${key} contains invalid JSON: ${error.message}`);
    }
    if (state.version !== 1 || state.clientId !== config.clientId || !state.products || typeof state.products !== "object") {
      throw new Error(`R2 state ${key} has an unsupported structure.`);
    }
    return state;
  }

  async uploadImage(config, entry, body) {
    const key = this.key(config.storage.imageKeyPrefix, entry.fileName);
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: key,
        Body: body,
        ContentType: "image/jpeg",
        CacheControl: IMMUTABLE_CACHE_CONTROL,
        Metadata: { "content-hash": entry.hash },
        IfNoneMatch: "*",
      }));
      return { key, uploaded: true };
    } catch (error) {
      if (isPreconditionFailure(error)) return { key, uploaded: false };
      throw new Error(`Unable to upload R2 image ${key}: ${error.message}`);
    }
  }

  async uploadMutable(key, body, contentType) {
    try {
      await this.client.send(new PutObjectCommand({
        Bucket: this.bucket,
        Key: this.key(key),
        Body: body,
        ContentType: contentType,
        CacheControl: "no-cache, max-age=0",
      }));
    } catch (error) {
      throw new Error(`Unable to upload R2 object ${this.key(key)}: ${error.message}`);
    }
  }

  async uploadCatalogMetadata(config, state, supplementaryFeed) {
    await this.uploadMutable(
      config.storage.supplementaryFeedKey,
      supplementaryFeed,
      "text/csv; charset=utf-8",
    );
    await this.uploadMutable(
      config.storage.stateKey,
      `${JSON.stringify(state, null, 2)}\n`,
      "application/json; charset=utf-8",
    );
  }
}

export async function verifyPublicImage(imageUrl) {
  let response;
  try {
    response = await fetch(imageUrl, {
      headers: { "user-agent": "MetaCatalogImageRenderer/0.1 public-check" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`Public image check failed for ${imageUrl}: ${error.message}`);
  }
  if (!response.ok) throw new Error(`Public image returned HTTP ${response.status}: ${imageUrl}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`Public image has unexpected Content-Type ${JSON.stringify(contentType)}: ${imageUrl}`);
  }
  const cacheControl = response.headers.get("cache-control") ?? "";
  if (!cacheControl.includes("immutable") || !cacheControl.includes("max-age=31536000")) {
    throw new Error(`Public image is missing immutable one-year Cache-Control: ${imageUrl}`);
  }
  await response.arrayBuffer();
  return { imageUrl, contentType, cacheControl };
}

export async function verifyPublicSupplementaryFeed(feedUrl) {
  let response;
  try {
    response = await fetch(feedUrl, {
      headers: { "user-agent": "MetaCatalogImageRenderer/0.1 public-check" },
      signal: AbortSignal.timeout(30_000),
    });
  } catch (error) {
    throw new Error(`Public supplementary feed check failed for ${feedUrl}: ${error.message}`);
  }
  if (!response.ok) throw new Error(`Public supplementary feed returned HTTP ${response.status}: ${feedUrl}`);
  const content = await response.text();
  if (!content.startsWith("id,image_link\r\n")) {
    throw new Error(`Public supplementary feed has an invalid header: ${feedUrl}`);
  }
  return { feedUrl, contentType: response.headers.get("content-type") ?? "" };
}
