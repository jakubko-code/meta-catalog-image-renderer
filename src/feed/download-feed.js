const DEFAULT_TIMEOUT_MS = 60_000;

export async function downloadFeed(url, { timeoutMs = DEFAULT_TIMEOUT_MS } = {}) {
  let response;

  try {
    response = await fetch(url, {
      headers: {
        accept: "application/xml, text/xml, text/csv, text/plain;q=0.9, */*;q=0.1",
        "user-agent": "MetaCatalogImageRenderer/0.1",
      },
      redirect: "follow",
      signal: AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    if (error.name === "TimeoutError") {
      throw new Error(`Feed download timed out after ${timeoutMs / 1000} seconds.`);
    }
    throw new Error(`Feed download failed: ${error.message}`);
  }

  if (!response.ok) {
    throw new Error(`Feed download failed with HTTP ${response.status} ${response.statusText}.`);
  }

  const content = await response.text();
  if (content.trim() === "") throw new Error("Downloaded feed is empty.");
  return content;
}
