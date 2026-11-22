#!/usr/bin/env node

// src/plugin/server.ts
import { createInterface } from "node:readline";

// src/plugin/backend.ts
function backendFromEnv(env = process.env) {
  const url = (env.NOSTA_BACKEND_URL ?? "http://127.0.0.1:18086").replace(/\/$/, "");
  const token = env.NOSTA_PLUGIN_TOKEN ?? "";
  return {
    async request(path, init = {}) {
      const headers = new Headers(init.headers);
      headers.set("authorization", `Bearer ${token}`);
      const response = await fetch(`${url}${path}`, {
        ...init,
        headers,
        signal: AbortSignal.timeout(30000)
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`backend answered ${response.status}: ${text.slice(0, 300)}`);
      }
      return text;
    }
  };
}

// src/plugin/flow.ts
import { createHash, randomUUID } from "node:crypto";
import { readFile as readFile2 } from "node:fs/promises";

// src/plugin/packet.ts
import { readFile, stat } from "node:fs/promises";
import { basename } from "node:path";

// src/shared/packet.ts
var MAX_FILES = 32;
var MAX_PACKET_BYTES = 256 * 1024;
var MAX_SERIALIZED_BYTES = 384 * 1024;
var MAX_NAME_CHARS = 200;
var MAX_TITLE_CHARS = 200;
var encoder = new TextEncoder;
function byteLength(text) {
  return encoder.encode(text).length;
}
function isValidFileName(name) {
  return typeof name === "string" && name.length > 0 && name.length <= MAX_NAME_CHARS && !name.includes("..") && /^[A-Za-z0-9._/-]+$/.test(name);
}
function failure(error) {
  return { ok: false, error };
}
function readTitle(input) {
  if (input.title === undefined)
    return "review";
  if (typeof input.title !== "string")
    return null;
  const title = input.title.trim();
  if (!title || title.length > MAX_TITLE_CHARS)
    return null;
  return title;
}
function readFiles(input) {
  if (!Array.isArray(input.files) || input.files.length === 0 || input.files.length > MAX_FILES) {
    return `files must list 1..${MAX_FILES} entries`;
  }
  const files = [];
  const seen = new Set;
  for (const entry of input.files) {
    if (!entry || typeof entry !== "object")
      return "invalid file entry";
    const file = entry;
    if (!isValidFileName(file.name)) {
      return `invalid file name: ${String(file.name)}`;
    }
    if (typeof file.content !== "string") {
      return `invalid file content: ${file.name}`;
    }
    if (seen.has(file.name))
      return `duplicate file name: ${file.name}`;
    seen.add(file.name);
    files.push({ name: file.name, content: file.content });
  }
  return files;
}
function serializedByteLength(value) {
  return byteLength(JSON.stringify(value) ?? "");
}
function validatePacket(input) {
  if (!input || typeof input !== "object")
    return failure("packet must be an object");
  const record = input;
  const title = readTitle(record);
  if (title === null)
    return failure("title must be 1..200 characters");
  const files = readFiles(record);
  if (typeof files === "string")
    return failure(files);
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += byteLength(file.content);
  }
  if (totalBytes > MAX_PACKET_BYTES)
    return failure("packet exceeds 256 KiB");
  const serializedBytes = serializedByteLength({ title, files });
  if (serializedBytes > MAX_SERIALIZED_BYTES) {
    return failure("packet exceeds 384 KiB after JSON encoding");
  }
  return { ok: true, packet: { title, files, totalBytes } };
}

// src/plugin/packet.ts
async function buildPacket(args) {
  const paths = args.paths;
  if (!Array.isArray(paths) || paths.length === 0 || paths.length > MAX_FILES) {
    throw new Error(`paths must list 1..${MAX_FILES} files`);
  }
  let hasNonString = false;
  for (const path of paths) {
    if (typeof path !== "string")
      hasNonString = true;
  }
  if (hasNonString) {
    throw new Error(`paths must list 1..${MAX_FILES} files`);
  }
  let totalBytes = 0;
  for (const path of paths) {
    totalBytes += (await stat(path)).size;
    if (totalBytes > MAX_PACKET_BYTES) {
      throw new Error("packet exceeds 256 KiB");
    }
  }
  const files = [];
  for (const path of paths) {
    files.push({
      name: basename(path),
      content: await readFile(path, "utf8")
    });
  }
  const result = validatePacket({ title: args.title, files });
  if (!result.ok)
    throw new Error(result.error);
  return result.packet;
}

// src/plugin/api/generated/nosta.ts
var getApproveFlowUrl = (flowId) => {
  return `/api/flow/${flowId}/approval`;
};

// src/plugin/flow.ts
var FLOW_TOOLS = [
  {
    name: "nosta_flow_start",
    description: "Start one Nosta flow. Pass { path, baseSha, ticketUrl } to start a spec flow from a local spec file, or { paths, title? } to start a 1-step DeepSeek review flow on 1..32 local files (256 KiB total).",
    inputSchema: {
      type: "object",
      properties: {
        path: { type: "string", description: "Absolute path of a local spec file (spec mode)." },
        baseSha: { type: "string", description: "40-hex Git SHA from the caller's checkout (spec mode)." },
        ticketUrl: { type: "string", description: "HTTPS URL of the ticket this flow runs for (spec mode)." },
        paths: {
          type: "array",
          items: { type: "string" },
          description: "Absolute paths of 1..32 text files to review, 256 KiB total (review mode)."
        },
        title: { type: "string", description: "Optional review flow title (review mode)." }
      }
    }
  },
  {
    name: "nosta_flow_status",
    description: "Get one flow with its direct steps and any child flow records.",
    inputSchema: {
      type: "object",
      properties: { flowId: { type: "string", description: "ID from nosta_flow_start." } },
      required: ["flowId"]
    }
  },
  {
    name: "nosta_flow_log",
    description: "Get one flow's ordered step events.",
    inputSchema: {
      type: "object",
      properties: { flowId: { type: "string", description: "ID from nosta_flow_start." } },
      required: ["flowId"]
    }
  },
  {
    name: "nosta_flow_approve",
    description: "Approve or reject one flow at its merge gate using the fresh version and attempt the caller read.",
    inputSchema: {
      type: "object",
      properties: {
        flowId: { type: "string", description: "Flow ID waiting at its merge gate." },
        decision: { type: "string", enum: ["approve", "reject"] },
        version: { type: "integer", description: "Flow version the caller read." },
        attempt: { type: "integer", description: "Flow attempt the caller read." },
        decisionId: { type: "string", description: "Optional caller-supplied idempotency key for this decision." }
      },
      required: ["flowId", "decision", "version", "attempt"]
    }
  }
];
async function callFlowTool(input) {
  if (input.name === "nosta_flow_start")
    return startFlow(input.args, input.backend);
  if (input.name === "nosta_flow_status")
    return readFlow(input.args, input.backend, "");
  if (input.name === "nosta_flow_log")
    return readFlow(input.args, input.backend, "/events");
  if (input.name === "nosta_flow_approve")
    return approveFlow(input.args, input.backend);
  return null;
}
function text(value, name) {
  if (typeof value !== "string" || value.length === 0)
    throw new Error(`${name} must be a string`);
  return value;
}
function positiveInt(value, name) {
  if (typeof value !== "number" || !Number.isInteger(value) || value < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return value;
}
async function startReviewFlow(args, backend) {
  const packet = await buildPacket(args);
  const key = randomUUID();
  return backend.request("/api/flow", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ mode: "review", title: packet.title, files: packet.files })
  });
}
async function startSpecFlow(args, backend) {
  const path = text(args.path, "path");
  const baseSha = text(args.baseSha, "baseSha");
  const ticketUrl = text(args.ticketUrl, "ticketUrl");
  const spec = await readFile2(path, "utf8");
  const key = createHash("sha256").update(JSON.stringify({ baseSha, ticketUrl, spec })).digest("hex");
  return backend.request("/api/flow", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ mode: "spec", spec, baseSha, ticketUrl })
  });
}
async function startFlow(args, backend) {
  const hasSpec = args.path !== undefined;
  const hasReview = args.paths !== undefined;
  if (hasSpec && hasReview)
    throw new Error("provide either { path, baseSha, ticketUrl } or { paths }, not both");
  if (hasReview)
    return startReviewFlow(args, backend);
  if (hasSpec)
    return startSpecFlow(args, backend);
  throw new Error("provide either { path, baseSha, ticketUrl } for a spec flow or { paths } for a review flow");
}
function readFlow(args, backend, suffix) {
  const id = text(args.flowId, "flowId");
  return backend.request(`/api/flow/${encodeURIComponent(id)}${suffix}`);
}
function approveFlow(args, backend) {
  const flowId = text(args.flowId, "flowId");
  const decision = args.decision;
  if (decision !== "approve" && decision !== "reject")
    throw new Error("decision must be approve or reject");
  const version = positiveInt(args.version, "version");
  const attempt = positiveInt(args.attempt, "attempt");
  const decisionId = typeof args.decisionId === "string" && args.decisionId.length > 0 ? args.decisionId : randomUUID();
  const body = { decision, version, attempt, decisionId };
  const path = getApproveFlowUrl(encodeURIComponent(flowId));
  return backend.request(path, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}

// src/plugin/prompts.ts
var PROMPTS = [
  {
    name: "start_flow",
    description: "Start one Nosta flow from a local spec file, poll until completion or a merge gate, and stop for human approval.",
    arguments: [
      { name: "path", description: "Absolute path to the spec file.", required: true },
      { name: "ticketUrl", description: "HTTPS URL of the ticket this flow runs for.", required: true },
      { name: "baseSha", description: "Optional 40-hex Git SHA; resolves from git rev-parse HEAD if omitted." }
    ]
  },
  {
    name: "review_flow",
    description: "Inspect one Nosta flow's status and step log with read-only calls only.",
    arguments: [{ name: "flowId", description: "Flow ID returned by nosta_flow_start.", required: true }]
  },
  {
    name: "approve_flow",
    description: "Read fresh flow state and approve or reject a flow at its merge gate after explicit confirmation.",
    arguments: [
      { name: "flowId", description: "Flow ID waiting at its merge gate.", required: true },
      { name: "decision", description: "Optional decision: approve or reject. Omit to inspect and ask first." }
    ]
  },
  {
    name: "review_files",
    description: "Run a fresh 1-step Nosta file review via nosta_flow_start and poll nosta_flow_status until complete.",
    arguments: [
      { name: "paths", description: "Absolute file paths to review (comma- or space-separated).", required: true },
      { name: "title", description: "Optional title for the review flow." }
    ]
  }
];
function promptsEnabled(env = process.env) {
  const value = (env.NOSTA_PLUGIN_PROMPTS ?? "").trim().toLowerCase();
  return value !== "off" && value !== "0" && value !== "false";
}
function requiredString(args, name) {
  const value = args[name];
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`missing required prompt argument: ${name}`);
  }
  return value.trim();
}
function optionalString(args, name) {
  const value = args[name];
  if (value === undefined || value === null)
    return null;
  if (typeof value !== "string")
    throw new Error(`prompt argument ${name} must be a string`);
  const trimmed = value.trim();
  return trimmed.length > 0 ? trimmed : null;
}
function renderStartFlow(args) {
  const path = requiredString(args, "path");
  const ticketUrl = requiredString(args, "ticketUrl");
  const baseSha = optionalString(args, "baseSha");
  const shaLine = baseSha ? `Use baseSha: ${baseSha}.` : "Resolve baseSha from the target checkout with `git rev-parse HEAD` (40-hex SHA).";
  return [
    `Start a Nosta flow for spec file: ${path}`,
    `Ticket URL: ${ticketUrl}`,
    shaLine,
    "Steps:",
    "1. Call `nosta_flow_start` once with `path`, `baseSha`, and `ticketUrl`.",
    "2. Poll `nosta_flow_status` until every child flow finishes, blocks, errors, or reaches its merge gate.",
    "3. On any blocked, errored, or failed step, call `nosta_flow_log` and report the exact failure cause.",
    "4. At any merge gate, show the PR link and summary, then stop and ask the user for an explicit decision.",
    "Never call `nosta_flow_approve` without the user's explicit word in this session."
  ].join(`
`);
}
function renderReviewFlow(args) {
  const flowId = requiredString(args, "flowId");
  return [
    `Inspect Nosta flow: ${flowId}`,
    "Steps:",
    "1. Call `nosta_flow_status` and `nosta_flow_log` for this `flowId`.",
    "2. Summarize the flow's state, outcome, child flows, PR links, and any findings or step errors.",
    "3. Make no writes, no approvals, and no rejections."
  ].join(`
`);
}
function renderApproveFlow(args) {
  const flowId = requiredString(args, "flowId");
  const decision = optionalString(args, "decision");
  if (decision !== null && decision !== "approve" && decision !== "reject") {
    throw new Error("decision must be approve or reject");
  }
  const decisionSteps = decision === null ? [
    "2. Show the flow's current state, PR link, version, and attempt to the user.",
    "3. Ask the user whether to `approve` or `reject`, then stop without calling `nosta_flow_approve`."
  ] : [
    `2. Confirm the user explicitly requested \`${decision}\` in this session (never infer approval from an earlier turn).`,
    `3. Call \`nosta_flow_approve\` with \`flowId\`, \`decision: "${decision}"\`, and the fresh \`version\` and \`attempt\` just read.`
  ];
  return [
    `Handle merge gate for flow ${flowId}.`,
    "Steps:",
    "1. Call `nosta_flow_status` immediately to read the flow's fresh `version`, `attempt`, and PR link.",
    ...decisionSteps
  ].join(`
`);
}
function renderReviewFiles(args) {
  const paths = requiredString(args, "paths");
  const title = optionalString(args, "title");
  const titleLine = title ? `Review title: ${title}` : "Title: omit or use a concise description of the diff.";
  return [
    `Run a Nosta code review on these absolute file paths: ${paths}`,
    titleLine,
    "Steps:",
    "1. Call `nosta_flow_start` with `paths` (array of absolute paths) and optional `title`.",
    "2. Poll `nosta_flow_status` with the returned `flowId` until `state` is `idle` (check `outcome` and the review step's verdict/findings).",
    "3. Report each finding with file, line, severity, and concrete remedy; do not invent out-of-spec requirements."
  ].join(`
`);
}
function listPrompts(env = process.env) {
  return promptsEnabled(env) ? PROMPTS : [];
}
function getPrompt(input) {
  if (!promptsEnabled(input.env)) {
    throw new Error("prompts are disabled by NOSTA_PLUGIN_PROMPTS");
  }
  const def = PROMPTS.find((item) => item.name === input.name);
  if (!def)
    throw new Error(`unknown prompt: ${input.name}`);
  let text;
  if (input.name === "start_flow")
    text = renderStartFlow(input.args);
  else if (input.name === "review_flow")
    text = renderReviewFlow(input.args);
  else if (input.name === "approve_flow")
    text = renderApproveFlow(input.args);
  else if (input.name === "review_files")
    text = renderReviewFiles(input.args);
  else
    throw new Error(`unknown prompt: ${input.name}`);
  return {
    description: def.description,
    messages: [{ role: "user", content: { type: "text", text } }]
  };
}

// src/plugin/server.ts
var backend = backendFromEnv();
var TOOLS = [...FLOW_TOOLS];
async function callTool(name, args) {
  const flow = await callFlowTool({ name, args, backend });
  if (flow !== null)
    return flow;
  throw new Error(`unknown tool: ${name}`);
}
function send(message) {
  process.stdout.write(`${JSON.stringify(message)}
`);
}
function sendResult(id, result) {
  send({ jsonrpc: "2.0", id, result });
}
function sendError(id, code, message) {
  send({ jsonrpc: "2.0", id, error: { code, message } });
}
function errorText(error) {
  return error instanceof Error ? error.message : String(error);
}
function sendToolText(id, text, isError) {
  sendResult(id, { content: [{ type: "text", text }], isError });
}
async function handle(message) {
  const { id, method, params } = message;
  if (id === undefined || id === null)
    return;
  try {
    if (method === "initialize") {
      const capabilities = { tools: {} };
      if (promptsEnabled())
        capabilities.prompts = {};
      sendResult(id, {
        protocolVersion: params?.protocolVersion ?? "2025-06-18",
        capabilities,
        serverInfo: { name: "nosta", version: "0.3.0" }
      });
    } else if (method === "ping") {
      sendResult(id, {});
    } else if (method === "tools/list") {
      sendResult(id, { tools: TOOLS });
    } else if (method === "tools/call") {
      try {
        const text = await callTool(params?.name ?? "", params?.arguments ?? {});
        sendToolText(id, text, false);
      } catch (error) {
        sendToolText(id, `Error: ${errorText(error)}`, true);
      }
    } else if (method === "prompts/list") {
      sendResult(id, { prompts: listPrompts() });
    } else if (method === "prompts/get") {
      try {
        const result = getPrompt({ name: params?.name ?? "", args: params?.arguments ?? {} });
        sendResult(id, result);
      } catch (error) {
        sendError(id, -32602, errorText(error));
      }
    } else {
      sendError(id, -32601, `method not found: ${method}`);
    }
  } catch (error) {
    sendError(id, -32603, errorText(error));
  }
}
function startServer() {
  const lines = createInterface({ input: process.stdin, crlfDelay: Infinity });
  lines.on("line", (line) => {
    const trimmed = line.trim();
    if (!trimmed)
      return;
    try {
      handle(JSON.parse(trimmed));
    } catch {
      console.error("nosta-mcp: ignoring non-JSON line");
    }
  });
}
if (false) {}

// src/plugin/bin.ts
startServer();
