const API_BASE_URL = "https://api.cloudflare.com/client/v4";
const CACHE_TTL_MS = 5 * 60 * 1000;
const FREE_LIMITS = {
  standardStorageBytes: 10 * 1000 * 1000 * 1000,
  classAOperations: 1_000_000,
  classBOperations: 10_000_000,
};

const CLASS_A_ACTIONS = new Set([
  "ListBuckets",
  "PutBucket",
  "ListObjects",
  "ListObjectsV2",
  "PutObject",
  "CopyObject",
  "CompleteMultipartUpload",
  "CreateMultipartUpload",
  "LifecycleStorageTierTransition",
  "ListMultipartUploads",
  "UploadPart",
  "UploadPartCopy",
  "ListParts",
  "PutBucketEncryption",
  "PutBucketCors",
  "PutBucketLifecycleConfiguration",
]);

const CLASS_B_ACTIONS = new Set([
  "HeadBucket",
  "HeadObject",
  "GetObject",
  "UsageSummary",
  "GetBucketEncryption",
  "GetBucketLocation",
  "GetBucketCors",
  "GetBucketLifecycleConfiguration",
]);

let cachedUsage;

function requiredEnvironment(environment, key) {
  const value = environment[key]?.trim();
  if (!value) throw new Error(`Missing ${key}. Add it to .env to display R2 usage.`);
  return value;
}

async function cloudflareJson(url, options, label) {
  let response;
  try {
    response = await fetch(url, { ...options, signal: AbortSignal.timeout(20_000) });
  } catch (error) {
    throw new Error(`${label} request failed: ${error.message}`);
  }
  const body = await response.json().catch(() => null);
  if (!response.ok || body?.success === false || body?.errors?.length) {
    const detail = body?.errors?.map((error) => error.message).filter(Boolean).join("; ");
    throw new Error(`${label} returned HTTP ${response.status}${detail ? `: ${detail}` : ""}.`);
  }
  return body;
}

function metricTotal(storageClass) {
  const states = [storageClass?.published, storageClass?.uploaded].filter(Boolean);
  return states.reduce((total, state) => ({
    objects: total.objects + (state.objects ?? 0),
    payloadSize: total.payloadSize + (state.payloadSize ?? 0),
    metadataSize: total.metadataSize + (state.metadataSize ?? 0),
  }), { objects: 0, payloadSize: 0, metadataSize: 0 });
}

function operationTotals(groups) {
  const totals = { classA: 0, classB: 0, free: 0, unknown: 0 };
  for (const group of groups) {
    const action = group.dimensions?.actionType;
    const requests = group.sum?.requests ?? 0;
    if (CLASS_A_ACTIONS.has(action)) totals.classA += requests;
    else if (CLASS_B_ACTIONS.has(action)) totals.classB += requests;
    else if (["DeleteObject", "DeleteBucket", "AbortMultipartUpload"].includes(action)) totals.free += requests;
    else totals.unknown += requests;
  }
  return totals;
}

async function fetchUsage(environment) {
  const accountId = requiredEnvironment(environment, "R2_ACCOUNT_ID");
  const token = requiredEnvironment(environment, "CLOUDFLARE_API_TOKEN");
  const now = new Date();
  const monthStart = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
  const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
  const query = `
    query R2Usage($accountTag: String!, $startDate: Time!, $endDate: Time!) {
      viewer {
        accounts(filter: { accountTag: $accountTag }) {
          r2OperationsAdaptiveGroups(
            limit: 10000
            filter: { datetime_geq: $startDate, datetime_leq: $endDate }
          ) {
            sum { requests }
            dimensions { actionType bucketName }
          }
        }
      }
    }
  `;

  const [storageResponse, analyticsResponse] = await Promise.all([
    cloudflareJson(`${API_BASE_URL}/accounts/${accountId}/r2/metrics`, { headers }, "R2 storage metrics"),
    cloudflareJson(`${API_BASE_URL}/graphql`, {
      method: "POST",
      headers,
      body: JSON.stringify({
        query,
        variables: { accountTag: accountId, startDate: monthStart.toISOString(), endDate: now.toISOString() },
      }),
    }, "R2 analytics"),
  ]);
  if (analyticsResponse.errors?.length) {
    throw new Error(`R2 analytics returned errors: ${analyticsResponse.errors.map((error) => error.message).join("; ")}.`);
  }

  const account = analyticsResponse.data?.viewer?.accounts?.[0];
  if (!account) throw new Error("R2 analytics did not return the configured account.");
  const standard = metricTotal(storageResponse.result?.standard);
  const infrequentAccess = metricTotal(storageResponse.result?.infrequentAccess);
  const operations = operationTotals(account.r2OperationsAdaptiveGroups ?? []);

  return {
    fetchedAt: now.toISOString(),
    periodStart: monthStart.toISOString(),
    limits: FREE_LIMITS,
    standardStorage: {
      objectCount: standard.objects,
      payloadBytes: standard.payloadSize,
      metadataBytes: standard.metadataSize,
      usedBytes: standard.payloadSize + standard.metadataSize,
    },
    infrequentAccessStorage: {
      objectCount: infrequentAccess.objects,
      usedBytes: infrequentAccess.payloadSize + infrequentAccess.metadataSize,
    },
    operations,
    note: "Storage is a current snapshot; Cloudflare bills storage as GB-month. Operation counts cover the current UTC month.",
  };
}

export async function loadR2Usage({ force = false, environment = process.env } = {}) {
  const now = Date.now();
  if (!force && cachedUsage && now - cachedUsage.loadedAt < CACHE_TTL_MS) return cachedUsage.value;
  const value = await fetchUsage(environment);
  cachedUsage = { loadedAt: now, value };
  return value;
}
