import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import {
  clientHandler,
  errorResponse,
  listClientsHandler,
  previewHandler,
  productsHandler,
  r2UsageHandler,
  renderStatusHandler,
  runsHandler,
  saveTemplateHandler,
  startRenderHandler,
} from "./handlers.js";

const HOST = "127.0.0.1";
const port = Number(process.env.UI_PORT ?? 4173);
const htmlPath = fileURLToPath(new URL("./index.html", import.meta.url));
const clientPath = /^\/api\/client\/([a-z0-9][a-z0-9-]*)$/;
const runsPath = /^\/api\/client\/([a-z0-9][a-z0-9-]*)\/runs$/;
const productsPath = /^\/api\/client\/([a-z0-9][a-z0-9-]*)\/products$/;
const previewPath = /^\/api\/client\/([a-z0-9][a-z0-9-]*)\/preview$/;
const templatePath = /^\/api\/client\/([a-z0-9][a-z0-9-]*)\/template$/;
const renderPath = /^\/api\/client\/([a-z0-9][a-z0-9-]*)\/render$/;
const renderStatusPath = /^\/api\/client\/([a-z0-9][a-z0-9-]*)\/render\/status$/;
const MAX_JSON_BYTES = 1024 * 1024;

function send(response, result) {
  response.writeHead(result.status, {
    "cache-control": "no-store",
    "x-content-type-options": "nosniff",
    ...result.headers,
  });
  response.end(result.body);
}

async function readJson(request) {
  if (!/^application\/json(?:;|$)/i.test(request.headers["content-type"] ?? "")) {
    const error = new Error("Content-Type must be application/json.");
    error.statusCode = 415;
    throw error;
  }
  const chunks = [];
  let size = 0;
  for await (const chunk of request) {
    size += chunk.length;
    if (size > MAX_JSON_BYTES) {
      const error = new Error("JSON body exceeds the 1 MB limit.");
      error.statusCode = 413;
      throw error;
    }
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString("utf8"));
  } catch {
    const error = new Error("Request body contains invalid JSON.");
    error.statusCode = 400;
    throw error;
  }
}

async function route(request, response) {
  const url = new URL(request.url, `http://${HOST}:${port}`);

  if (request.method === "GET" && url.pathname === "/") {
    send(response, {
      status: 200,
      headers: { "content-type": "text/html; charset=utf-8" },
      body: await readFile(htmlPath),
    });
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/clients") {
    send(response, await listClientsHandler({ url }));
    return;
  }

  if (request.method === "GET" && url.pathname === "/api/r2/usage") {
    send(response, await r2UsageHandler({ url }));
    return;
  }

  const runsMatch = url.pathname.match(runsPath);
  if (request.method === "GET" && runsMatch) {
    send(response, await runsHandler({ url, params: { id: runsMatch[1] } }));
    return;
  }

  const productsMatch = url.pathname.match(productsPath);
  if (request.method === "GET" && productsMatch) {
    send(response, await productsHandler({ url, params: { id: productsMatch[1] } }));
    return;
  }

  const previewMatch = url.pathname.match(previewPath);
  if (request.method === "POST" && previewMatch) {
    send(response, await previewHandler({
      url,
      params: { id: previewMatch[1] },
      body: await readJson(request),
    }));
    return;
  }

  const templateMatch = url.pathname.match(templatePath);
  if (request.method === "PUT" && templateMatch) {
    send(response, await saveTemplateHandler({
      url,
      params: { id: templateMatch[1] },
      body: await readJson(request),
    }));
    return;
  }

  const renderStatusMatch = url.pathname.match(renderStatusPath);
  if (request.method === "GET" && renderStatusMatch) {
    send(response, await renderStatusHandler({ url, params: { id: renderStatusMatch[1] } }));
    return;
  }

  const renderMatch = url.pathname.match(renderPath);
  if (request.method === "POST" && renderMatch) {
    send(response, await startRenderHandler({
      url,
      params: { id: renderMatch[1] },
      body: await readJson(request),
    }));
    return;
  }

  const clientMatch = url.pathname.match(clientPath);
  if (request.method === "GET" && clientMatch) {
    send(response, await clientHandler({ url, params: { id: clientMatch[1] } }));
    return;
  }

  send(response, {
    status: 404,
    headers: { "content-type": "application/json; charset=utf-8" },
    body: JSON.stringify({ error: "Route not found." }),
  });
}

const server = createServer((request, response) => {
  route(request, response).catch((error) => send(response, errorResponse(error)));
});

server.on("error", (error) => {
  if (error.code === "EADDRINUSE") {
    console.error(`Port ${port} is already in use. Stop the existing UI server and run npm run ui again.`);
    process.exitCode = 1;
    return;
  }
  throw error;
});

server.listen(port, HOST, () => {
  console.log(`Feed Renderer UI: http://${HOST}:${port}`);
  console.log("Local development server only — do not expose it to the internet.");
});
