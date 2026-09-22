import type { JsonSchema } from "../contracts";
import { COMPONENT_SCHEMAS, ROUTES } from "../contracts";
import { DEFAULT_VERSION } from "./rest";

/**
 * Generates the OpenAPI 3.1 document from the route table in `src/contracts.ts`.
 * The document is served at `/docs/openapi.json`, with Swagger UI at `/docs`.
 * No external libraries are required: the JSON schema is serialized directly.
 */

export type OpenApiDocument = Record<string, unknown>;

function serializeSchema(schema: JsonSchema): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(schema)) {
    if (value === undefined) continue;
    if (key === "properties" && value)
      out[key] = Object.fromEntries(Object.entries(value).map(([name, child]) => [name, serializeSchema(child)]));
    else if (key === "items" && value) out[key] = serializeSchema(value);
    else if (key === "oneOf" && value) out[key] = (value as JsonSchema[]).map((child) => serializeSchema(child));
    else if (key === "$ref") out[key] = String(value);
    else if (key === "enum" && value) out[key] = value;
    else if (key === "required" && value) out[key] = value;
    else if (key === "additionalProperties" && typeof value === "boolean") out[key] = value;
    else out[key] = value;
  }
  return out;
}

export function buildOpenApiDocument(basePath = "/"): OpenApiDocument {
  const paths: Record<string, Record<string, unknown>> = {};
  for (const route of ROUTES) {
    const openApiPath = route.path.replaceAll("{id}", "{sessionId}");
    const operation: Record<string, unknown> = {
      summary: route.summary,
      description: route.description,
      tags: route.tags,
      operationId: route.id,
    };
    const pathParams: unknown[] = [];
    if (route.pathParams) {
      pathParams.push(
        ...route.pathParams.map((param) => ({
          name: param.name === "id" ? "sessionId" : param.name,
          in: "path",
          required: true,
          description: param.description,
          schema: { type: "string" },
        })),
      );
    }
    if (pathParams.length) operation.parameters = [...((operation.parameters as unknown[]) ?? []), ...pathParams];
    if (route.queryParams) {
      operation.parameters = [
        ...((operation.parameters as unknown[]) ?? []),
        ...route.queryParams.map((param) => ({
          name: param.name,
          in: "query",
          required: param.required ?? false,
          description: param.description,
          schema: serializeSchema(param.schema),
        })),
      ];
    }
    if (route.requestBody)
      operation.requestBody = {
        required: true,
        content: { "application/json": { schema: serializeSchema(route.requestBody) } },
      };
    const responses: Record<string, Record<string, unknown>> = {};
    for (const response of route.responses) {
      const entry: Record<string, unknown> = { description: response.description };
      if (response.schema) entry.content = { "application/json": { schema: serializeSchema(response.schema) } };
      else if (response.contentType) entry.content = { [response.contentType]: { schema: { type: "string" } } };
      responses[String(response.status)] = entry;
    }
    if (route.streaming)
      responses["200"] = {
        description: "SSE stream",
        content: { "text/event-stream": { schema: { type: "string" } } },
      };
    operation.responses = responses;
    if (!paths[openApiPath]) paths[openApiPath] = {};
    paths[openApiPath][route.method.toLowerCase()] = operation;
  }

  return {
    openapi: "3.1.0",
    info: {
      title: "use-terminal REST API",
      version: DEFAULT_VERSION,
      description:
        "use-terminal localhost REST API: PTY sessions, snapshots (text/raw/semantic), low-level input (bytes), high-level operations (type/key/mouse/wait), viewport/scrollback, clipboard, signals, resize, SSE stream, screenshots, and viewer. Binds to 127.0.0.1, without authentication, with CORS disabled. Equivalent contracts are available through MCP stdio (tools with the same names and schemas).",
    },
    servers: [{ url: `${basePath}` }],
    tags: [
      { name: "system", description: "Health, documentation, and versioning" },
      {
        name: "sessions",
        description:
          "PTY sessions: creation, metadata, input, mouse, snapshots, viewport, events, signals, clipboard, and streaming",
      },
    ],
    paths,
    components: {
      schemas: Object.fromEntries(
        Object.entries(COMPONENT_SCHEMAS).map(([name, schema]) => [name, serializeSchema(schema)]),
      ),
    },
  };
}

export function swaggerHtml(): string {
  return `<!doctype html>
<html lang="en">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width">
  <title>use-terminal — OpenAPI (Swagger UI)</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
  <style>body{margin:0}</style>
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>
    window.onload = function () {
      window.ui = SwaggerUIBundle({
        url: "\${location.origin}/docs/openapi.json",
        dom_id: "#swagger-ui",
        deepLinking: true,
        presets: [SwaggerUIBundle.presets.apis, SwaggerUIBundle.plugins.DocExpansion],
      });
    };
  </script>
</body>
</html>`;
}

export const SWAGGER_HTML = swaggerHtml();
