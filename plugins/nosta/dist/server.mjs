#!/usr/bin/env node

// src/bin.ts
import { readFile as readFile8 } from "node:fs/promises";

// src/install/index.ts
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { cp as cp2, mkdir as mkdir2, readFile, rename, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, join as join3, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// src/install/targets.ts
import { join } from "node:path";
var DEFAULT_PACKAGE_NAME = "@nostadev/mcp";
var HARNESSES = ["opencode", "codex", "cursor", "windsurf", "claude"];
function isHarness(value) {
  return HARNESSES.includes(value);
}
function resolveTarget(input) {
  const { harness, scope, cwd, homeDir } = input;
  if (harness === "opencode") {
    const base = scope === "global" ? join(homeDir, ".config", "opencode") : join(cwd, ".opencode");
    return {
      harness,
      scope,
      configPath: scope === "global" ? join(base, "opencode.json") : join(cwd, "opencode.json"),
      configFormat: "opencode-json",
      skillsDir: join(base, "skills"),
      pluginPath: join(base, "plugins", "nosta-approve-guard.ts")
    };
  }
  if (harness === "codex") {
    const configRoot = scope === "global" ? join(homeDir, ".codex") : join(cwd, ".codex");
    const skillsDir = scope === "global" ? join(homeDir, ".codex", "skills") : join(cwd, ".agents", "skills");
    return {
      harness,
      scope,
      configPath: join(configRoot, "config.toml"),
      configFormat: "codex-toml",
      skillsDir,
      pluginPath: null
    };
  }
  if (harness === "cursor") {
    const base = scope === "global" ? join(homeDir, ".cursor") : join(cwd, ".cursor");
    return {
      harness,
      scope,
      configPath: join(base, "mcp.json"),
      configFormat: "mcp-servers-json",
      skillsDir: join(base, "skills"),
      pluginPath: null
    };
  }
  if (harness === "windsurf") {
    const base = scope === "global" ? join(homeDir, ".codeium", "windsurf") : join(cwd, ".windsurf");
    return {
      harness,
      scope,
      configPath: join(base, scope === "global" ? "mcp_config.json" : "mcp.json"),
      configFormat: "mcp-servers-json",
      skillsDir: join(base, "skills"),
      pluginPath: null
    };
  }
  const claudeSkills = scope === "global" ? join(homeDir, ".claude", "skills") : join(cwd, ".claude", "skills");
  return {
    harness,
    scope,
    configPath: scope === "global" ? join(homeDir, ".claude.json") : join(cwd, ".mcp.json"),
    configFormat: "mcp-servers-json",
    skillsDir: claudeSkills,
    pluginPath: null
  };
}

// src/install/writers.ts
import { cp, mkdir, readdir } from "node:fs/promises";
import { join as join2 } from "node:path";
function parseJsonObject(text) {
  const trimmed = text.trim();
  if (!trimmed)
    return {};
  const parsed = JSON.parse(trimmed);
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
    throw new Error("existing config must be a JSON object");
  }
  return parsed;
}
function asObject(value) {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...value };
  }
  return {};
}
function mergeOpenCodeJson(input) {
  const root = parseJsonObject(input.existingText);
  if (typeof root.$schema !== "string") {
    root.$schema = "https://opencode.ai/config.json";
  }
  const mcp = asObject(root.mcp);
  const existingNosta = asObject(mcp.nosta);
  mcp.nosta = {
    ...existingNosta,
    type: "local",
    command: ["npx", "-y", input.packageName],
    enabled: true
  };
  root.mcp = mcp;
  const permission = asObject(root.permission);
  permission.nosta_nosta_flow_approve = "ask";
  permission.nosta_nosta_flow_bypass = "ask";
  root.permission = permission;
  return `${JSON.stringify(root, null, 2)}
`;
}
function mergeMcpServersJson(input) {
  const root = parseJsonObject(input.existingText);
  const mcpServers = asObject(root.mcpServers);
  const existingNosta = asObject(mcpServers.nosta);
  mcpServers.nosta = {
    ...existingNosta,
    command: "npx",
    args: ["-y", input.packageName]
  };
  root.mcpServers = mcpServers;
  return `${JSON.stringify(root, null, 2)}
`;
}
function mergeCodexToml(input) {
  const managedLines = [
    "[mcp_servers.nosta]",
    'command = "npx"',
    `args = ["-y", ${JSON.stringify(input.packageName)}]`,
    "enabled = true"
  ];
  const managedKeyRe = /^\s*(?:command|args|enabled)\s*=/;
  const lines = input.existingText.length > 0 ? input.existingText.replace(/\r\n/g, `
`).split(`
`) : [];
  const headerRe = /^\s*\[mcp_servers\.nosta\]\s*(?:#.*)?$/;
  const anyTableRe = /^\s*\[/;
  const startIdx = lines.findIndex((line) => headerRe.test(line));
  if (startIdx >= 0) {
    let endIdx = startIdx + 1;
    while (endIdx < lines.length && !anyTableRe.test(lines[endIdx] ?? "")) {
      endIdx += 1;
    }
    const preserved = lines.slice(startIdx + 1, endIdx).filter((line) => line.trim().length > 0 && !managedKeyRe.test(line));
    const block = [...managedLines, ...preserved].join(`
`);
    const before = lines.slice(0, startIdx);
    const after = lines.slice(endIdx);
    const replaced = [...before, block, ...after.length > 0 ? ["", ...after] : []].join(`
`).replace(/\n{3,}/g, `

`);
    return `${replaced.trimEnd()}
`;
  }
  const block = managedLines.join(`
`);
  const trimmed = input.existingText.trimEnd();
  return trimmed.length > 0 ? `${trimmed}

${block}
` : `${block}
`;
}
function mergeHarnessConfig(input) {
  if (input.format === "opencode-json") {
    return mergeOpenCodeJson({ existingText: input.existingText, packageName: input.packageName });
  }
  if (input.format === "codex-toml") {
    return mergeCodexToml({ existingText: input.existingText, packageName: input.packageName });
  }
  return mergeMcpServersJson({ existingText: input.existingText, packageName: input.packageName });
}
async function copySkills(input) {
  const entries = await readdir(input.sourceDir, { withFileTypes: true });
  const names = entries.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort();
  if (!input.dryRun) {
    await mkdir(input.targetDir, { recursive: true });
    for (const name of names) {
      await cp(join2(input.sourceDir, name), join2(input.targetDir, name), { recursive: true, force: true });
    }
  }
  return names;
}

// src/install/index.ts
function usageText() {
  return [
    "Usage: nosta-mcp install <harness> [--global | --project] [--dry-run]",
    `Harnesses: ${HARNESSES.join(", ")}`,
    "Run with no arguments to start the Nosta stdio MCP server."
  ].join(`
`);
}
function resolveAssetsDir(baseDir) {
  const candidates = [resolve(baseDir), resolve(baseDir, ".."), resolve(baseDir, "../..")];
  for (const dir of candidates) {
    if (existsSync(join3(dir, "skills")))
      return dir;
  }
  throw new Error(`could not locate bundled skills directory from ${baseDir}`);
}
function resolveDefaultPackageName(assetsDir) {
  const envName = process.env.NOSTA_MCP_PACKAGE?.trim();
  if (envName)
    return envName;
  const pkgPath = join3(assetsDir, "package.json");
  if (existsSync(pkgPath)) {
    const parsed = JSON.parse(readFileSync(pkgPath, "utf8"));
    if (typeof parsed.name === "string" && parsed.name.trim() && parsed.private !== true) {
      return parsed.name.trim();
    }
  }
  return DEFAULT_PACKAGE_NAME;
}
function scanInstallFlags(args) {
  let harnessArg = null;
  let scope = "global";
  let dryRun = false;
  let packageName = null;
  for (let i = 0;i < args.length; i += 1) {
    const token = args[i] ?? "";
    if (token === "--project" || token === "-p")
      scope = "project";
    else if (token === "--global" || token === "-g")
      scope = "global";
    else if (token === "--dry-run")
      dryRun = true;
    else if (token === "--package") {
      const next = args[i + 1];
      if (!next)
        throw new Error("missing value for --package");
      packageName = next;
      i += 1;
    } else if (token.startsWith("-"))
      throw new Error(`unknown option: ${token}
${usageText()}`);
    else if (!harnessArg)
      harnessArg = token.toLowerCase();
    else
      throw new Error(`unexpected argument: ${token}
${usageText()}`);
  }
  return { harnessArg, scope, dryRun, packageName };
}
function parseInstallArgs(input) {
  const { harnessArg, scope, dryRun, packageName } = scanInstallFlags(input.argv);
  if (!harnessArg || !isHarness(harnessArg)) {
    throw new Error(`unsupported or missing harness: ${harnessArg ?? "(none)"}
${usageText()}`);
  }
  const scriptDir = dirname(fileURLToPath(import.meta.url));
  const assetsDir = input.assetsDir ? resolve(input.assetsDir) : resolveAssetsDir(scriptDir);
  return {
    harness: harnessArg,
    scope,
    cwd: resolve(input.cwd ?? process.cwd()),
    homeDir: resolve(input.homeDir ?? homedir()),
    assetsDir,
    packageName: packageName ?? resolveDefaultPackageName(assetsDir),
    dryRun
  };
}
async function runInstall(options) {
  const target = resolveTarget({
    harness: options.harness,
    scope: options.scope,
    cwd: options.cwd,
    homeDir: options.homeDir
  });
  const existingText = existsSync(target.configPath) ? await readFile(target.configPath, "utf8") : "";
  const nextConfig = mergeHarnessConfig({
    format: target.configFormat,
    existingText,
    packageName: options.packageName
  });
  if (!options.dryRun) {
    await mkdir2(dirname(target.configPath), { recursive: true });
    const tmpPath = `${target.configPath}.tmp-${process.pid}-${randomBytes(6).toString("hex")}`;
    await writeFile(tmpPath, nextConfig, "utf8");
    await rename(tmpPath, target.configPath);
  }
  const skillsCopied = await copySkills({
    sourceDir: join3(options.assetsDir, "skills"),
    targetDir: target.skillsDir,
    dryRun: options.dryRun
  });
  let installedPluginPath = null;
  if (target.pluginPath) {
    const sourceGuard = join3(options.assetsDir, "hooks", "opencode-approve-guard.ts");
    if (!existsSync(sourceGuard)) {
      throw new Error(`bundled OpenCode approval guard missing: ${sourceGuard}`);
    }
    if (!options.dryRun) {
      await mkdir2(dirname(target.pluginPath), { recursive: true });
      await cp2(sourceGuard, target.pluginPath, { force: true });
    }
    installedPluginPath = target.pluginPath;
  }
  return {
    harness: target.harness,
    scope: target.scope,
    configPath: target.configPath,
    skillsDir: target.skillsDir,
    skillsCopied,
    pluginPath: installedPluginPath,
    dryRun: options.dryRun
  };
}
function formatInstallSummary(result) {
  const verb = result.dryRun ? "Would install" : "Installed";
  const lines = [
    `${verb} Nosta for ${result.harness} (${result.scope}):`,
    `  config: ${result.configPath}`,
    `  skills: ${result.skillsDir} (${result.skillsCopied.length} skills)`
  ];
  if (result.pluginPath) {
    lines.push(`  guard:  ${result.pluginPath}`);
  }
  lines.push("");
  lines.push("Next: export NOSTA_BACKEND_URL=https://app.nosta.dev and NOSTA_PLUGIN_TOKEN=<your-token>");
  return `${lines.join(`
`)}
`;
}

// src/server.ts
import { createInterface } from "node:readline";

// src/artifacts/index.ts
import { mkdir as mkdir4, writeFile as writeFile3 } from "node:fs/promises";
import { dirname as dirname3 } from "node:path";

// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/util.js
function getEnumValues(entries) {
  const numericValues = Object.values(entries).filter((v) => typeof v === "number");
  const values = Object.entries(entries).filter(([k, _]) => numericValues.indexOf(+k) === -1).map(([_, v]) => v);
  return values;
}
function joinValues(array, separator = "|") {
  return array.map((val) => stringifyPrimitive(val)).join(separator);
}
function jsonStringifyReplacer(_, value) {
  if (typeof value === "bigint")
    return value.toString();
  return value;
}

class Cached {
  constructor(getter) {
    this._getter = getter;
    this._value = undefined;
  }
  get value() {
    const getter = this._getter;
    if (getter !== undefined) {
      this._value = getter();
      this._getter = undefined;
    }
    return this._value;
  }
}
function cached(getter) {
  return new Cached(getter);
}
function nullish(input) {
  return input === null || input === undefined;
}
function cleanRegex(source) {
  const start = source.startsWith("^") ? 1 : 0;
  const end = source.endsWith("$") ? source.length - 1 : source.length;
  return source.slice(start, end);
}
function floatSafeRemainder(val, step) {
  const ratio = val / step;
  const roundedRatio = Math.round(ratio);
  const tolerance = 4 * Number.EPSILON * Math.max(Math.abs(ratio), 1);
  if (Math.abs(ratio - roundedRatio) < tolerance)
    return 0;
  return ratio - roundedRatio;
}
function assignProp(target, prop, value) {
  Object.defineProperty(target, prop, {
    value,
    writable: true,
    enumerable: true,
    configurable: true
  });
}
function rawShape(def) {
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  return desc?.get ? desc.get.raw : desc?.value;
}
function sourceShape(schema) {
  return rawShape(schema._zod.def) ?? schema._zod.def.shape;
}
function deferProp(target, key, getter) {
  Object.defineProperty(target, key, {
    get() {
      const value = getter();
      assignProp(this, key, value);
      return value;
    },
    enumerable: true,
    configurable: true
  });
}
function putProp(target, key, value) {
  if (key in target)
    assignProp(target, key, value);
  else
    target[key] = value;
}
function mirrorShape(target, source, keys, wrap) {
  const raw = sourceShape(source);
  for (const key of keys) {
    const desc = Object.getOwnPropertyDescriptor(raw, key);
    if (!desc.enumerable)
      continue;
    if (desc.get) {
      deferProp(target, key, () => {
        const value = source._zod.def.shape[key];
        return wrap ? wrap(value, key) : value;
      });
    } else
      putProp(target, key, wrap ? wrap(desc.value, key) : desc.value);
  }
}
function mirrorProps(target, source) {
  for (const key of Reflect.ownKeys(source)) {
    const desc = Object.getOwnPropertyDescriptor(source, key);
    if (!desc.enumerable)
      continue;
    if (desc.get)
      deferProp(target, key, () => source[key]);
    else
      putProp(target, key, desc.value);
  }
}
function mergeDefs(...defs) {
  const mergedDescriptors = {};
  for (const def of defs) {
    const descriptors = Object.getOwnPropertyDescriptors(def);
    Object.assign(mergedDescriptors, descriptors);
  }
  return Object.defineProperties({}, mergedDescriptors);
}
function esc(str) {
  return JSON.stringify(str);
}
function slugify(input) {
  return input.toLowerCase().trim().replace(/[^\w\s-]/g, "").replace(/[\s_-]+/g, "-").replace(/^-+|-+$/g, "");
}
var captureStackTrace = "captureStackTrace" in Error ? Error.captureStackTrace : (..._args) => {};
function isObject(data) {
  return typeof data === "object" && data !== null && !Array.isArray(data);
}
var allowsEval = /* @__PURE__ */ cached(() => {
  if (globalConfig.jitless) {
    return false;
  }
  if (typeof navigator !== "undefined" && navigator?.userAgent?.includes("Cloudflare")) {
    return false;
  }
  try {
    const F = Function;
    new F("");
    return true;
  } catch (_) {
    return false;
  }
});
function isPlainObject(o) {
  if (isObject(o) === false)
    return false;
  const ctor = o.constructor;
  if (ctor === undefined)
    return true;
  if (typeof ctor !== "function")
    return true;
  const prot = ctor.prototype;
  if (isObject(prot) === false)
    return false;
  if (Object.prototype.hasOwnProperty.call(prot, "isPrototypeOf") === false) {
    return false;
  }
  return true;
}
function shallowClone(o) {
  if (isPlainObject(o))
    return { ...o };
  if (Array.isArray(o))
    return [...o];
  if (o instanceof Map)
    return new Map(o);
  if (o instanceof Set)
    return new Set(o);
  return o;
}
var propertyKeyTypes = /* @__PURE__ */ new Set(["string", "number", "symbol"]);
function escapeRegex(str) {
  return str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
function clone(inst, def, params) {
  const cl = new inst._zod.constr(def ?? inst._zod.def);
  if (!def || params?.parent)
    cl._zod.parent = inst;
  return cl;
}
function normalizeParams(_params) {
  const params = _params;
  if (!params)
    return {};
  if (typeof params === "string")
    return { error: () => params };
  if (params?.message !== undefined) {
    if (params?.error !== undefined)
      throw new Error("Cannot specify both `message` and `error` params");
    params.error = params.message;
  }
  delete params.message;
  if (typeof params.error === "string")
    return { ...params, error: () => params.error };
  return params;
}
function stringifyPrimitive(value) {
  if (typeof value === "bigint")
    return value.toString() + "n";
  if (typeof value === "string")
    return `"${value}"`;
  return `${value}`;
}
function optionalKeys(shape) {
  return Object.keys(shape).filter((k) => {
    return shape[k]._zod.optin !== undefined && shape[k]._zod.optout === "optional";
  });
}
var NUMBER_FORMAT_RANGES = /* @__PURE__ */ (() => ({
  safeint: [Number.MIN_SAFE_INTEGER, Number.MAX_SAFE_INTEGER],
  int32: [-2147483648, 2147483647],
  uint32: [0, 4294967295],
  float32: [-340282346638528860000000000000000000000, 340282346638528860000000000000000000000],
  float64: [-Number.MAX_VALUE, Number.MAX_VALUE]
}))();
var BIGINT_FORMAT_RANGES = {
  int64: [/* @__PURE__ */ BigInt("-9223372036854775808"), /* @__PURE__ */ BigInt("9223372036854775807")],
  uint64: [/* @__PURE__ */ BigInt(0), /* @__PURE__ */ BigInt("18446744073709551615")]
};
function pick(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".pick() cannot be used on object schemas containing refinements");
  }
  const newShape = {};
  mirrorShape(newShape, schema, maskedKeys(schema, mask));
  return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
}
function maskedKeys(schema, mask) {
  const raw = sourceShape(schema);
  const keys = [];
  for (const key of Reflect.ownKeys(mask)) {
    if (!Object.getOwnPropertyDescriptor(raw, key)?.enumerable) {
      throw new Error(`Unrecognized key: "${String(key)}"`);
    }
    if (mask[key])
      keys.push(key);
  }
  return keys;
}
function omit(schema, mask) {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(".omit() cannot be used on object schemas containing refinements");
  }
  const omitted = new Set(maskedKeys(schema, mask));
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)).filter((key) => !omitted.has(key)));
  return clone(schema, mergeDefs(currDef, { shape: newShape, checks: [] }));
}
function extend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to extend: expected a plain object");
  }
  const checks = schema._zod.def.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    const existingShape = sourceShape(schema);
    for (const key of Reflect.ownKeys(shape)) {
      if (Object.getOwnPropertyDescriptor(existingShape, key) !== undefined) {
        throw new Error("Cannot overwrite keys on object schemas containing refinements. Use `.safeExtend()` instead.");
      }
    }
  }
  return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function extended(schema, shape) {
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)));
  mirrorProps(newShape, shape);
  return newShape;
}
function safeExtend(schema, shape) {
  if (!isPlainObject(shape)) {
    throw new Error("Invalid input to safeExtend: expected a plain object");
  }
  return clone(schema, mergeDefs(schema._zod.def, { shape: extended(schema, shape) }));
}
function merge(a, b) {
  if (!b?._zod?.def) {
    throw new Error("Invalid input to merge: expected an object schema. To merge a plain shape, use `.extend()`.");
  }
  if (a._zod.def.checks?.length) {
    throw new Error(".merge() cannot be used on object schemas containing refinements. Use .safeExtend() instead.");
  }
  const newShape = {};
  mirrorShape(newShape, a, Reflect.ownKeys(sourceShape(a)));
  mirrorShape(newShape, b, Reflect.ownKeys(sourceShape(b)));
  const def = mergeDefs(a._zod.def, {
    shape: newShape,
    get catchall() {
      return b._zod.def.catchall;
    },
    checks: b._zod.def.checks ?? []
  });
  return clone(a, def);
}
function partial(Class, schema, mask, name = "partial") {
  const currDef = schema._zod.def;
  const checks = currDef.checks;
  const hasChecks = checks && checks.length > 0;
  if (hasChecks) {
    throw new Error(`.${name}() cannot be used on object schemas containing refinements`);
  }
  const selected = mask ? new Set(maskedKeys(schema, mask)) : undefined;
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), Class && ((value, key) => selected && !selected.has(key) ? value : new Class({ type: "optional", innerType: value })));
  return clone(schema, mergeDefs(schema._zod.def, { shape: newShape, checks: [] }));
}
function required(Class, schema, mask) {
  const selected = mask ? new Set(maskedKeys(schema, mask)) : undefined;
  const newShape = {};
  mirrorShape(newShape, schema, Reflect.ownKeys(sourceShape(schema)), (value, key) => selected && !selected.has(key) ? value : new Class({ type: "nonoptional", innerType: value }));
  return clone(schema, mergeDefs(schema._zod.def, { shape: newShape }));
}
function aborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue !== true) {
      return true;
    }
  }
  return false;
}
function explicitlyAborted(x, startIndex = 0) {
  if (x.aborted === true)
    return true;
  for (let i = startIndex;i < x.issues.length; i++) {
    if (x.issues[i]?.continue === false) {
      return true;
    }
  }
  return false;
}
function prefixIssues(path, issues) {
  return issues.map((iss) => {
    var _a;
    (_a = iss).path ?? (_a.path = []);
    iss.path.unshift(path);
    return iss;
  });
}
function unwrapMessage(message) {
  return typeof message === "string" ? message : message?.message;
}
function sizeCaps(defChecks) {
  const caps = [];
  for (const ch of defChecks ?? []) {
    const d = ch._zod.def;
    if (!/_(length|size)$|_equals$/.test(d.check))
      break;
    const max = d.maximum ?? d.length ?? d.size;
    if (max >= 0)
      caps.push([max, ch]);
  }
  return caps;
}
function attachSchema(issues, start, inst) {
  var _a;
  for (let i = start;i < issues.length; i++) {
    (_a = issues[i]).schema ?? (_a.schema = inst);
  }
}
function finalizeIssue(iss, ctx, config) {
  var _a;
  const traits = iss.inst?._zod?.traits;
  if (traits?.has("$ZodType")) {
    if (traits.has("$ZodCheck"))
      (_a = iss).schema ?? (_a.schema = iss.inst);
    else
      iss.schema = iss.inst;
  }
  const schemaError = iss.schema !== iss.inst ? iss.schema?._zod.def?.error : undefined;
  const message = iss.message ? iss.message : unwrapMessage(iss.inst?._zod.def?.error?.(iss)) ?? unwrapMessage(schemaError?.(iss)) ?? unwrapMessage(ctx?.error?.(iss)) ?? unwrapMessage(config.customError?.(iss)) ?? unwrapMessage(config.localeError?.(iss)) ?? "Invalid input";
  const full = {};
  for (const k of Object.keys(iss)) {
    if (k === "inst" || k === "schema" || k === "continue" || k === "input" || k === "__proto__")
      continue;
    full[k] = iss[k];
  }
  full.path ?? (full.path = []);
  full.message = message;
  if (ctx?.reportInput) {
    full.input = iss.input;
  }
  return full;
}
var highSurrogate = /[\uD800-\uDBFF]/;
function codePointLength(str) {
  const units = str.length;
  if (!highSurrogate.test(str))
    return units;
  let count = units;
  for (let i = 0;i < units - 1; i++) {
    if ((str.charCodeAt(i) & 64512) === 55296 && (str.charCodeAt(i + 1) & 64512) === 56320) {
      count--;
      i++;
    }
  }
  return count;
}
function getLengthableOrigin(input) {
  if (Array.isArray(input))
    return "array";
  if (typeof input === "string")
    return "string";
  return "unknown";
}
function parsedType(data) {
  const t = typeof data;
  switch (t) {
    case "number": {
      return Number.isNaN(data) ? "nan" : "number";
    }
    case "object": {
      if (data === null) {
        return "null";
      }
      if (Array.isArray(data)) {
        return "array";
      }
      const obj = data;
      if (obj && Object.getPrototypeOf(obj) !== Object.prototype && "constructor" in obj && obj.constructor) {
        return obj.constructor.name;
      }
    }
  }
  return t;
}
function issue(...args) {
  const [iss, input, inst] = args;
  if (typeof iss === "string") {
    return {
      message: iss,
      code: "custom",
      input,
      inst
    };
  }
  return { ...iss };
}
function members(proto, table) {
  for (const key in table) {
    const desc = Object.getOwnPropertyDescriptor(table, key);
    if (desc.get)
      Object.defineProperty(proto, key, { ...desc, enumerable: false });
    else
      defineBound(proto, key, desc.value);
  }
}
function own(inst, key, value, enumerable = true) {
  Object.defineProperty(inst, key, { configurable: true, writable: true, enumerable, value });
  return value;
}
function hide(inst, key, value) {
  return own(inst, key, value, false);
}
function derived(computes, table) {
  for (const key in computes) {
    const compute = computes[key];
    Object.defineProperty(table, key, {
      configurable: true,
      enumerable: true,
      get() {
        return own(this, key, compute(this));
      },
      set(value) {
        own(this, key, value);
      }
    });
  }
  return table;
}
function defineBound(proto, key, fn) {
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      return this == null ? fn : own(this, key, fn.bind(this));
    },
    set(value) {
      own(this, key, value);
    }
  });
}
function claim(inst, sentinel) {
  const proto = Object.getPrototypeOf(inst);
  return sentinel in proto ? undefined : proto;
}
var installing;
var broke = false;
var breaker = {
  configurable: true,
  get() {
    broke = true;
    return;
  }
};
function defineLazyInternal(inst, key, compute) {
  const proto = Object.getPrototypeOf(inst._zod);
  if (key in proto && installing !== inst._zod) {
    installing = undefined;
    return;
  }
  installing = inst._zod;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      Object.defineProperty(this, key, breaker);
      const outer = broke;
      broke = false;
      try {
        const value = compute(this);
        if (broke)
          delete this[key];
        else
          Object.defineProperty(this, key, { configurable: true, writable: true, value });
        broke = broke || outer;
        return value;
      } catch (err) {
        delete this[key];
        broke = broke || outer;
        throw err;
      }
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, value });
    }
  });
}
function installLazyProp(inst, key, make, enumerable) {
  const proto = claim(inst, key);
  if (!proto)
    return;
  Object.defineProperty(proto, key, {
    configurable: true,
    get() {
      const desc = { configurable: true, writable: true, enumerable, value: undefined };
      Object.defineProperty(this, key, desc);
      desc.value = make(this);
      Object.defineProperty(this, key, desc);
      return desc.value;
    },
    set(value) {
      Object.defineProperty(this, key, { configurable: true, writable: true, enumerable, value });
    }
  });
}
var CONSTANT_CATCH = "~constantCatch";
function constantCatch(value) {
  const fn = () => value;
  fn[CONSTANT_CATCH] = true;
  return fn;
}

// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/core.js
var _a;
var _zodDesc = { value: undefined, enumerable: false };
var _E = "captureStackTrace" in Error ? Error : null;
function newError(Definition) {
  const E = _E;
  if (E) {
    const saved = E.stackTraceLimit;
    if (typeof saved === "number") {
      try {
        E.stackTraceLimit = 0;
      } catch {
        _E = null;
        return new Definition;
      }
      try {
        return new Definition;
      } finally {
        E.stackTraceLimit = saved;
      }
    }
  }
  return new Definition;
}
function $constructor(name, initializer, proto, params) {
  const zodProto = {};
  function Internals(def) {
    this.def = def;
    this.constr = _;
    this.traits = new Set;
  }
  Internals.prototype = zodProto;
  const protoMembers = proto;
  const initialized = protoMembers && new WeakSet;
  function init(inst, def) {
    if (!inst._zod) {
      _zodDesc.value = new Internals(def);
      try {
        Object.defineProperty(inst, "_zod", _zodDesc);
      } finally {
        _zodDesc.value = undefined;
      }
    } else if (inst._zod.traits.has(name)) {
      return;
    }
    inst._zod.traits.add(name);
    initializer(inst, def);
    if (initialized) {
      const own = Object.getPrototypeOf(inst);
      const ctorProto = inst._zod.constr.prototype;
      let up = own;
      while (up && up !== ctorProto)
        up = Object.getPrototypeOf(up);
      const target = up ?? own;
      if (!initialized.has(target)) {
        initialized.add(target);
        members(target, protoMembers);
      }
    }
    const proto = _.prototype;
    for (const k in proto) {
      if (!Object.prototype.hasOwnProperty.call(proto, k))
        continue;
      if (!(k in inst)) {
        inst[k] = proto[k].bind(inst);
      }
    }
  }
  const Parent = params?.Parent ?? Object;

  class Definition extends Parent {
  }
  Object.defineProperty(Definition, "name", { value: name });
  function _(def) {
    const inst = params?.Parent ? newError(Definition) : this;
    init(inst, def);
    const deferred = inst._zod.deferred;
    if (deferred) {
      for (const fn of deferred) {
        fn();
      }
      inst._zod.deferred = undefined;
    }
    const pp = globalThis.__zod_globalConfig?.postProcessor;
    if (pp)
      pp(inst);
    return inst;
  }
  Object.defineProperty(_, "init", { value: init });
  Object.defineProperty(_, Symbol.hasInstance, {
    value: (inst) => {
      if (params?.Parent && inst instanceof params.Parent)
        return true;
      return inst?._zod?.traits?.has(name);
    }
  });
  Object.defineProperty(_, "name", { value: name });
  return _;
}
class $ZodAsyncError extends Error {
  constructor() {
    super(`Encountered Promise during synchronous parse. Use .parseAsync() instead.`);
  }
}

class $ZodEncodeError extends Error {
  constructor(name) {
    super(`Encountered unidirectional transform during encode: ${name}`);
    this.name = "ZodEncodeError";
  }
}
(_a = globalThis).__zod_globalConfig ?? (_a.__zod_globalConfig = {});
var globalConfig = globalThis.__zod_globalConfig;
function config(newConfig) {
  if (newConfig)
    Object.assign(globalConfig, newConfig);
  return globalConfig;
}
// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/errors.js
function _getMessage() {
  const internals = this._zod;
  internals.message ?? (internals.message = JSON.stringify(internals.def, jsonStringifyReplacer, 2));
  return internals.message;
}
function _setMessage(value) {
  this._zod.message = value;
}
var _messageDesc = {
  get: _getMessage,
  set: _setMessage,
  enumerable: true,
  configurable: true
};
var _issuesDesc = { value: undefined, enumerable: false };
var _installedToString = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
var initializer = (inst, def) => {
  inst.name = "$ZodError";
  _issuesDesc.value = def;
  Object.defineProperty(inst, "issues", _issuesDesc);
  _issuesDesc.value = undefined;
  Object.defineProperty(inst, "message", _messageDesc);
  const proto = Object.getPrototypeOf(inst);
  if (!_installedToString.has(proto)) {
    _installedToString.add(proto);
    Object.defineProperty(proto, "toString", {
      configurable: true,
      enumerable: false,
      get() {
        const value = () => this.message;
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
        return value;
      },
      set(value) {
        Object.defineProperty(this, "toString", { value, configurable: true, writable: true });
      }
    });
  }
};
var $ZodError = $constructor("$ZodError", initializer);
var $ZodRealError = $constructor("$ZodError", initializer, undefined, {
  Parent: Error
});
function node(obj, key, make) {
  if (!Object.prototype.hasOwnProperty.call(obj, key)) {
    if (key === "__proto__") {
      Object.defineProperty(obj, key, { value: make(), writable: true, enumerable: true, configurable: true });
    } else {
      obj[key] = make();
    }
  }
  return obj[key];
}
function flattenError(error, mapper = (issue) => issue.message) {
  const fieldErrors = {};
  const formErrors = [];
  for (const sub of error.issues) {
    if (sub.path.length > 0) {
      node(fieldErrors, sub.path[0], () => []).push(mapper(sub));
    } else {
      formErrors.push(mapper(sub));
    }
  }
  return { formErrors, fieldErrors };
}
function formatError(error, mapper = (issue) => issue.message) {
  const fieldErrors = { _errors: [] };
  const processError = (error, path = []) => {
    for (const issue of error.issues) {
      if (issue.code === "invalid_union" && issue.errors.length) {
        issue.errors.map((issues) => processError({ issues }, [...path, ...issue.path]));
      } else if (issue.code === "invalid_key") {
        processError({ issues: issue.issues }, [...path, ...issue.path]);
      } else if (issue.code === "invalid_element") {
        processError({ issues: issue.issues }, [...path, ...issue.path]);
      } else {
        const fullpath = [...path, ...issue.path];
        if (fullpath.length === 0) {
          fieldErrors._errors.push(mapper(issue));
        } else {
          let curr = fieldErrors;
          let i = 0;
          while (i < fullpath.length) {
            const el = fullpath[i];
            const terminal = i === fullpath.length - 1;
            if (el === "_errors") {
              if (terminal)
                curr._errors.push(mapper(issue));
              i++;
              continue;
            }
            if (!Object.prototype.hasOwnProperty.call(curr, el)) {
              Object.defineProperty(curr, el, {
                value: { _errors: [] },
                enumerable: true,
                writable: true,
                configurable: true
              });
            }
            const node = curr[el];
            if (terminal) {
              node._errors.push(mapper(issue));
            }
            curr = node;
            i++;
          }
        }
      }
    }
  };
  processError(error);
  return fieldErrors;
}

// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/parse.js
function finalizeParams(callee, params) {
  return { callee: params?.callee ?? callee, Err: params?.Err };
}
var _parse = (_Err) => {
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
    const result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise) {
      throw new $ZodAsyncError;
    }
    if (result.issues.length) {
      const e = new (_params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, _params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var _parseAsync = (_Err) => {
  const fn = async (schema, value, _ctx, params) => {
    const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
    let result = schema._zod.run({ value, issues: [] }, ctx);
    if (result instanceof Promise)
      result = await result;
    if (result.issues.length) {
      const e = new (params?.Err ?? _Err)(result.issues.map((iss) => finalizeIssue(iss, ctx, config())));
      captureStackTrace(e, params?.callee ?? fn);
      throw e;
    }
    return result.value;
  };
  return fn;
};
var _safeParse = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: false } : { async: false };
  const result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
function failure(Err, issues, ctx) {
  let error;
  return {
    success: false,
    get error() {
      if (!error) {
        error = new Err(issues.map((iss) => finalizeIssue(iss, ctx, config())));
        issues = undefined;
        ctx = undefined;
      }
      return error;
    },
    set error(e) {
      error = e;
      issues = undefined;
      ctx = undefined;
    }
  };
}
var _safeParseAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true } : { async: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length ? failure(_Err, result.issues, ctx) : { success: true, data: result.value };
};
var COMPILE_INVALID = /* @__PURE__ */ Symbol.for("zod.compile.invalid");
var COMPILE_FALLBACK = /* @__PURE__ */ Symbol.for("zod.compile.fallback");
var validate = (schema, value, _ctx) => {
  const validator = schema._zod.bag.validator;
  if (validator !== undefined) {
    if (validator(value) !== COMPILE_INVALID)
      return true;
    if (validator.definite === true && _ctx === undefined)
      return false;
  }
  return validateFallback(schema, value, _ctx);
};
function validateFallback(schema, value, _ctx) {
  const ctx = _ctx ? { ..._ctx, async: false, abortEarly: true } : { async: false, abortEarly: true };
  const fallbackRun = schema._zod.bag.fallbackRun;
  let result;
  if (fallbackRun) {
    ctx[COMPILE_FALLBACK] = true;
    result = fallbackRun({ value, issues: [] }, ctx);
  } else {
    result = schema._zod.run({ value, issues: [] }, ctx);
  }
  if (result instanceof Promise) {
    throw new $ZodAsyncError;
  }
  return result.issues.length === 0;
}
var validateAsync = async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, async: true, abortEarly: true } : { async: true, abortEarly: true };
  let result = schema._zod.run({ value, issues: [] }, ctx);
  if (result instanceof Promise)
    result = await result;
  return result.issues.length === 0;
};
var _encode = (_Err) => {
  const parse = _parse(_Err);
  const fn = (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return parse(schema, value, ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _decode = (_Err) => {
  const parse = _parse(_Err);
  const fn = (schema, value, _ctx, _params) => {
    return parse(schema, value, _ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _encodeAsync = (_Err) => {
  const parseAsync = _parseAsync(_Err);
  const fn = async (schema, value, _ctx, _params) => {
    const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
    return await parseAsync(schema, value, ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _decodeAsync = (_Err) => {
  const parseAsync = _parseAsync(_Err);
  const fn = async (schema, value, _ctx, _params) => {
    return await parseAsync(schema, value, _ctx, finalizeParams(fn, _params));
  };
  return fn;
};
var _safeEncode = (_Err) => (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParse(_Err)(schema, value, ctx);
};
var _safeDecode = (_Err) => (schema, value, _ctx) => {
  return _safeParse(_Err)(schema, value, _ctx);
};
var _safeEncodeAsync = (_Err) => async (schema, value, _ctx) => {
  const ctx = _ctx ? { ..._ctx, direction: "backward" } : { direction: "backward" };
  return _safeParseAsync(_Err)(schema, value, ctx);
};
var _safeDecodeAsync = (_Err) => async (schema, value, _ctx) => {
  return _safeParseAsync(_Err)(schema, value, _ctx);
};
// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/regexes.js
var cuid = /^[cC][0-9a-z]{6,}$/;
var cuid2 = /^[0-9a-z]+$/;
var ulid = /^[0-7][0-9A-HJKMNP-TV-Za-hjkmnp-tv-z]{25}$/;
var xid = /^[0-9a-vA-V]{20}$/;
var ksuid = /^[A-Za-z0-9]{27}$/;
var nanoid = /^[a-zA-Z0-9_-]{21}$/;
function nanoidOfLength(length) {
  return new RegExp(`^[a-zA-Z0-9_-]{${length}}$`);
}
var duration = /^P(?:(\d+W)|(?!.*W)(?=\d|T\d)(\d+Y)?(\d+M)?(\d+D)?(T(?=\d)(\d+H)?(\d+M)?(\d+([.,]\d+)?S)?)?)$/;
var guid = /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{4}-[0-9a-fA-F]{12})$/;
var uuid = (version) => {
  if (!version)
    return /^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-[1-8][0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12}|00000000-0000-0000-0000-000000000000|ffffffff-ffff-ffff-ffff-ffffffffffff)$/;
  return new RegExp(`^([0-9a-fA-F]{8}-[0-9a-fA-F]{4}-${version}[0-9a-fA-F]{3}-[89abAB][0-9a-fA-F]{3}-[0-9a-fA-F]{12})$`);
};
var email = /^(?:[A-Za-z0-9_'+\-]+\.)*[A-Za-z0-9_'+\-]*[A-Za-z0-9_+-]@(?:[A-Za-z0-9][A-Za-z0-9\-]*\.)+[A-Za-z]{2,}$/;
var _emoji = `^(?=[\\s\\S]*[\\p{Extended_Pictographic}\\p{Regional_Indicator}\\u20E3])[\\p{Extended_Pictographic}\\p{Emoji_Component}]+$`;
function emoji() {
  return new RegExp(_emoji, "u");
}
var ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(?:25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])$/;
var ipv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))$/;
var cidrv4 = /^((25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\.){3}(25[0-5]|2[0-4][0-9]|1[0-9][0-9]|[1-9][0-9]|[0-9])\/([0-9]|[1-2][0-9]|3[0-2])$/;
var cidrv6 = /^(([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,7}:|([0-9a-fA-F]{1,4}:){1,6}:[0-9a-fA-F]{1,4}|([0-9a-fA-F]{1,4}:){1,5}(:[0-9a-fA-F]{1,4}){1,2}|([0-9a-fA-F]{1,4}:){1,4}(:[0-9a-fA-F]{1,4}){1,3}|([0-9a-fA-F]{1,4}:){1,3}(:[0-9a-fA-F]{1,4}){1,4}|([0-9a-fA-F]{1,4}:){1,2}(:[0-9a-fA-F]{1,4}){1,5}|[0-9a-fA-F]{1,4}:((:[0-9a-fA-F]{1,4}){1,6})|:((:[0-9a-fA-F]{1,4}){1,7}|:))\/(12[0-8]|1[01][0-9]|[1-9]?[0-9])$/;
var base64 = /^$|^(?:[0-9a-zA-Z+/]{4})*(?:(?:[0-9a-zA-Z+/]{2}==)|(?:[0-9a-zA-Z+/]{3}=))?$/;
var base64url = /^(?:[A-Za-z0-9_-]{4})*(?:[A-Za-z0-9_-]{2,3})?$/;
var httpProtocol = /^https?$/;
var e164 = /^\+[1-9]\d{6,14}$/;
var dateSource = `(?:(?:\\d\\d[2468][048]|\\d\\d[13579][26]|\\d\\d0[48]|[02468][048]00|[13579][26]00)-02-29|\\d{4}-(?:(?:0[13578]|1[02])-(?:0[1-9]|[12]\\d|3[01])|(?:0[469]|11)-(?:0[1-9]|[12]\\d|30)|(?:02)-(?:0[1-9]|1\\d|2[0-8])))`;
function anchor(source) {
  return new RegExp(`^${source}$`);
}
var date = /* @__PURE__ */ anchor(dateSource);
function timeSource(args) {
  const hhmm = `(?:[01]\\d|2[0-3]):[0-5]\\d`;
  const regex = typeof args.precision === "number" ? args.precision === -1 ? `${hhmm}` : args.precision === 0 ? `${hhmm}:[0-5]\\d` : `${hhmm}:[0-5]\\d\\.\\d{${args.precision}}` : args.seconds ? `${hhmm}:[0-5]\\d(?:\\.\\d+)?` : `${hhmm}(?::[0-5]\\d(?:\\.\\d+)?)?`;
  return regex;
}
function time(args) {
  return new RegExp(`^${timeSource(args)}$`);
}
function datetime(args) {
  const opts = ["Z"];
  if (args.offset)
    opts.push(`([+-](?:[01]\\d|2[0-3]):[0-5]\\d)`);
  const qualified = `${timeSource({ precision: args.precision, seconds: true })}(?:${opts.join("|")})`;
  const timeRegex = args.local ? `${qualified}|${timeSource({ precision: args.precision })}` : qualified;
  return new RegExp(`^${dateSource}T(?:${timeRegex})$`);
}
var anyString = /^[\s\S]{0,}$/;
var integer = /^-?\d+$/;
var number = /^-?\d+(?:\.\d+)?$/;
var boolean = /^(?:true|false)$/i;
var _null = /^null$/i;
var lowercase = /^[^A-Z]*$/;
var uppercase = /^[^a-z]*$/;

// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/checks.js
var $ZodCheck = /* @__PURE__ */ $constructor("$ZodCheck", (inst, def) => {
  var _a;
  inst._zod ?? (inst._zod = {});
  inst._zod.def = def;
  (_a = inst._zod).onattach ?? (_a.onattach = []);
});
var _whenHasLength = (payload) => {
  const val = payload.value;
  return !nullish(val) && val.length !== undefined;
};
var numericOriginMap = {
  number: "number",
  bigint: "bigint",
  object: "date"
};
var $ZodCheckLessThan = /* @__PURE__ */ $constructor("$ZodCheckLessThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value <= def.value : payload.value < def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin,
      code: "too_big",
      maximum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckGreaterThan = /* @__PURE__ */ $constructor("$ZodCheckGreaterThan", (inst, def) => {
  $ZodCheck.init(inst, def);
  const origin = numericOriginMap[typeof def.value];
  inst._zod.check = (payload) => {
    if (def.inclusive ? payload.value >= def.value : payload.value > def.value) {
      return;
    }
    payload.issues.push({
      origin: numericOriginMap[typeof payload.value] ?? origin,
      code: "too_small",
      minimum: typeof def.value === "object" ? def.value.getTime() : def.value,
      input: payload.value,
      inclusive: def.inclusive,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMultipleOf = /* @__PURE__ */ $constructor("$ZodCheckMultipleOf", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    if (typeof payload.value !== typeof def.value)
      throw new Error("Cannot mix number and bigint in multiple_of check.");
    const isMultiple = typeof payload.value === "bigint" ? def.value !== BigInt(0) && payload.value % def.value === BigInt(0) : floatSafeRemainder(payload.value, def.value) === 0;
    if (isMultiple)
      return;
    payload.issues.push({
      origin: typeof payload.value,
      code: "not_multiple_of",
      divisor: def.value,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckNumberFormat = /* @__PURE__ */ $constructor("$ZodCheckNumberFormat", (inst, def) => {
  $ZodCheck.init(inst, def);
  def.format = def.format || "float64";
  const isInt = def.format?.includes("int");
  const origin = isInt ? "int" : "number";
  const [minimum, maximum] = NUMBER_FORMAT_RANGES[def.format];
  inst._zod.check = (payload) => {
    const input = payload.value;
    if (isInt) {
      if (!Number.isInteger(input)) {
        payload.issues.push({
          expected: origin,
          format: def.format,
          code: "invalid_type",
          continue: false,
          input,
          inst
        });
        return;
      }
      if (!Number.isSafeInteger(input)) {
        if (input > 0) {
          payload.issues.push({
            input,
            code: "too_big",
            maximum: Number.MAX_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        } else {
          payload.issues.push({
            input,
            code: "too_small",
            minimum: Number.MIN_SAFE_INTEGER,
            note: "Integers must be within the safe integer range.",
            inst,
            origin,
            inclusive: true,
            continue: !def.abort
          });
        }
        return;
      }
    }
    if (input < minimum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_small",
        minimum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
    if (input > maximum) {
      payload.issues.push({
        origin: "number",
        input,
        code: "too_big",
        maximum,
        inclusive: true,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCheckMaxLength = /* @__PURE__ */ $constructor("$ZodCheckMaxLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units > def.maximum ? codePointLength(input) : units;
    if (length <= def.maximum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_big",
      maximum: def.maximum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckMinLength = /* @__PURE__ */ $constructor("$ZodCheckMinLength", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units >= def.minimum && units < def.minimum * 2 ? codePointLength(input) : units;
    if (length >= def.minimum)
      return;
    const origin = getLengthableOrigin(input);
    payload.issues.push({
      origin,
      code: "too_small",
      minimum: def.minimum,
      inclusive: true,
      input,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLengthEquals = /* @__PURE__ */ $constructor("$ZodCheckLengthEquals", (inst, def) => {
  var _a;
  $ZodCheck.init(inst, def);
  (_a = inst._zod.def).when ?? (_a.when = _whenHasLength);
  inst._zod.check = (payload) => {
    const input = payload.value;
    const units = input.length;
    const length = typeof input === "string" && units >= def.length && units <= def.length * 2 ? codePointLength(input) : units;
    if (length === def.length)
      return;
    const origin = getLengthableOrigin(input);
    const tooBig = length > def.length;
    payload.issues.push({
      origin,
      ...tooBig ? { code: "too_big", maximum: def.length } : { code: "too_small", minimum: def.length },
      inclusive: true,
      exact: true,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStringFormat = /* @__PURE__ */ $constructor("$ZodCheckStringFormat", (inst, def) => {
  var _a, _b;
  $ZodCheck.init(inst, def);
  if (def.pattern)
    (_a = inst._zod).check ?? (_a.check = (payload) => {
      def.pattern.lastIndex = 0;
      if (def.pattern.test(payload.value))
        return;
      payload.issues.push({
        origin: "string",
        code: "invalid_format",
        format: def.format,
        input: payload.value,
        ...def.pattern ? { pattern: def.pattern.toString() } : {},
        inst,
        continue: !def.abort
      });
    });
  else
    (_b = inst._zod).check ?? (_b.check = () => {});
});
var $ZodCheckRegex = /* @__PURE__ */ $constructor("$ZodCheckRegex", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    def.pattern.lastIndex = 0;
    if (def.pattern.test(payload.value))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "regex",
      input: payload.value,
      pattern: def.pattern.toString(),
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckLowerCase = /* @__PURE__ */ $constructor("$ZodCheckLowerCase", (inst, def) => {
  def.pattern ?? (def.pattern = lowercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckUpperCase = /* @__PURE__ */ $constructor("$ZodCheckUpperCase", (inst, def) => {
  def.pattern ?? (def.pattern = uppercase);
  $ZodCheckStringFormat.init(inst, def);
});
var $ZodCheckIncludes = /* @__PURE__ */ $constructor("$ZodCheckIncludes", (inst, def) => {
  $ZodCheck.init(inst, def);
  const escapedRegex = escapeRegex(def.includes);
  const pattern = new RegExp(typeof def.position === "number" ? `^.{${def.position},}${escapedRegex}` : escapedRegex);
  def.pattern = pattern;
  inst._zod.check = (payload) => {
    if (payload.value.includes(def.includes, def.position))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "includes",
      includes: def.includes,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckStartsWith = /* @__PURE__ */ $constructor("$ZodCheckStartsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`^${escapeRegex(def.prefix)}.*`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.check = (payload) => {
    if (payload.value.startsWith(def.prefix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "starts_with",
      prefix: def.prefix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckEndsWith = /* @__PURE__ */ $constructor("$ZodCheckEndsWith", (inst, def) => {
  $ZodCheck.init(inst, def);
  const pattern = new RegExp(`.*${escapeRegex(def.suffix)}$`);
  def.pattern ?? (def.pattern = pattern);
  inst._zod.check = (payload) => {
    if (payload.value.endsWith(def.suffix))
      return;
    payload.issues.push({
      origin: "string",
      code: "invalid_format",
      format: "ends_with",
      suffix: def.suffix,
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodCheckOverwrite = /* @__PURE__ */ $constructor("$ZodCheckOverwrite", (inst, def) => {
  $ZodCheck.init(inst, def);
  inst._zod.check = (payload) => {
    payload.value = def.tx(payload.value);
  };
});

// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/doc.js
class Doc {
  constructor(args = [], closed = {}) {
    this.content = [];
    this.indent = 0;
    this.args = args;
    this.closed = closed;
  }
  indented(fn) {
    this.indent += 1;
    try {
      fn(this);
    } finally {
      this.indent -= 1;
    }
  }
  write(arg) {
    if (typeof arg === "function") {
      arg(this, { execution: "sync" });
      arg(this, { execution: "async" });
      return;
    }
    const content = arg;
    const lines = content.split(`
`).filter((x) => x);
    const minIndent = Math.min(...lines.map((x) => x.length - x.trimStart().length));
    const dedented = lines.map((x) => x.slice(minIndent)).map((x) => " ".repeat(this.indent * 2) + x);
    for (const line of dedented) {
      this.content.push(line);
    }
  }
  compile() {
    const F = Function;
    const content = this?.content ?? [``];
    const factory = new F(...Object.keys(this.closed), `return function (${this.args.join(", ")}) {
${content.join(`
`)}
};`);
    return factory(...Object.values(this.closed));
  }
}

// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/versions.js
var version = {
  major: 4,
  minor: 6,
  patch: 7
};

// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/schemas.js
var $ZodType = /* @__PURE__ */ $constructor("$ZodType", (inst, def) => {
  var _a;
  inst ?? (inst = {});
  inst._zod.def = def;
  inst._zod.bag = inst._zod.bag || {};
  inst._zod.version = version;
  const defChecks = inst._zod.def.checks;
  const checks = inst._zod.traits.has("$ZodCheck") ? [inst, ...defChecks ?? []] : defChecks?.length ? [...defChecks] : [];
  for (const ch of checks) {
    for (const fn of ch._zod.onattach) {
      fn(inst);
    }
  }
  if (checks.length === 0) {
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred?.push(() => {
      inst._zod.run = inst._zod.parse;
    });
  } else {
    const runChecks = (payload, checks, ctx) => {
      if (payload.memo)
        return payload;
      let isAborted = aborted(payload);
      let asyncResult;
      for (const ch of checks) {
        if (ch._zod.def.when) {
          if (explicitlyAborted(payload))
            continue;
          const shouldRun = ch._zod.def.when(payload);
          if (!shouldRun)
            continue;
        } else if (isAborted) {
          continue;
        }
        const currLen = payload.issues.length;
        const _ = ch._zod.check(payload);
        if (_ instanceof Promise && ctx?.async === false) {
          throw new $ZodAsyncError;
        }
        if (asyncResult || _ instanceof Promise) {
          asyncResult = (asyncResult ?? Promise.resolve()).then(async () => {
            await _;
            const nextLen = payload.issues.length;
            if (nextLen === currLen)
              return;
            attachSchema(payload.issues, currLen, inst);
            if (!isAborted)
              isAborted = aborted(payload, currLen);
          });
        } else {
          const nextLen = payload.issues.length;
          if (nextLen === currLen)
            continue;
          attachSchema(payload.issues, currLen, inst);
          if (!isAborted)
            isAborted = aborted(payload, currLen);
        }
      }
      if (asyncResult) {
        return asyncResult.then(() => {
          return payload;
        });
      }
      return payload;
    };
    const handleCanaryResult = (canary, payload, ctx) => {
      if (aborted(canary)) {
        canary.aborted = true;
        return canary;
      }
      const checkResult = runChecks(payload, checks, ctx);
      if (checkResult instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return checkResult.then((checkResult) => inst._zod.parse(checkResult, ctx));
      }
      return inst._zod.parse(checkResult, ctx);
    };
    inst._zod.run = (payload, ctx) => {
      if (ctx.skipChecks) {
        return inst._zod.parse(payload, ctx);
      }
      if (ctx.direction === "backward") {
        const canary = inst._zod.parse({ value: payload.value, issues: [] }, { ...ctx, skipChecks: true });
        if (canary instanceof Promise) {
          return canary.then((canary) => {
            return handleCanaryResult(canary, payload, ctx);
          });
        }
        return handleCanaryResult(canary, payload, ctx);
      }
      const result = inst._zod.parse(payload, ctx);
      if (result instanceof Promise) {
        if (ctx.async === false)
          throw new $ZodAsyncError;
        return result.then((result) => runChecks(result, checks, ctx));
      }
      return runChecks(result, checks, ctx);
    };
  }
}, {
  get "~standard"() {
    return hide(this, "~standard", standardProps(this));
  },
  set "~standard"(value) {
    own(this, "~standard", value);
  }
});
var toStandardResult = (r, ctx) => r.issues.length ? { issues: r.issues.map((iss) => finalizeIssue(iss, ctx, config())) } : { value: r.value };
async function validateAsync2(inst, value) {
  const ctx = { async: true };
  return toStandardResult(await inst._zod.run({ value, issues: [] }, ctx), ctx);
}
function standardProps(inst) {
  return {
    validate: (value) => {
      const ctx = { async: false };
      try {
        const r = inst._zod.run({ value, issues: [] }, ctx);
        if (!(r instanceof Promise))
          return toStandardResult(r, ctx);
      } catch (_) {}
      return validateAsync2(inst, value);
    },
    vendor: "zod",
    version: 1
  };
}
var $ZodString = /* @__PURE__ */ $constructor("$ZodString", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = def.pattern ?? anyString;
  inst._zod.parse = (payload, _) => {
    if (def.coerce)
      try {
        payload.value = String(payload.value);
      } catch (_) {}
    if (typeof payload.value === "string")
      return payload;
    payload.issues.push({
      expected: "string",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
var $ZodStringFormat = /* @__PURE__ */ $constructor("$ZodStringFormat", (inst, def) => {
  $ZodCheckStringFormat.init(inst, def);
  $ZodString.init(inst, def);
});
var $ZodGUID = /* @__PURE__ */ $constructor("$ZodGUID", (inst, def) => {
  def.pattern ?? (def.pattern = guid);
  $ZodStringFormat.init(inst, def);
});
var $ZodUUID = /* @__PURE__ */ $constructor("$ZodUUID", (inst, def) => {
  if (def.version) {
    const versionMap = {
      v1: 1,
      v2: 2,
      v3: 3,
      v4: 4,
      v5: 5,
      v6: 6,
      v7: 7,
      v8: 8
    };
    const v = versionMap[def.version];
    if (v === undefined)
      throw new Error(`Invalid UUID version: "${def.version}"`);
    def.pattern ?? (def.pattern = uuid(v));
  } else
    def.pattern ?? (def.pattern = uuid());
  $ZodStringFormat.init(inst, def);
});
var $ZodEmail = /* @__PURE__ */ $constructor("$ZodEmail", (inst, def) => {
  def.pattern ?? (def.pattern = email);
  $ZodStringFormat.init(inst, def);
});
var URL_BAD_FORMAT = 1;
var URL_UNPARSEABLE = 2;
function canParseURL(input) {
  try {
    if (typeof URL !== "undefined" && typeof URL.canParse === "function")
      return URL.canParse(input);
    new URL(input);
    return true;
  } catch {
    return false;
  }
}
function validateURL(trimmed, def) {
  if (!("normalize" in def) && !("hostname" in def) && !("protocol" in def)) {
    return canParseURL(trimmed) || URL_UNPARSEABLE;
  }
  return parseURLObject(trimmed, def);
}
function parseURLObject(trimmed, def) {
  if (!def.normalize && def.protocol?.source === httpProtocol.source && !/^https?:\/\//i.test(trimmed)) {
    return URL_BAD_FORMAT;
  }
  try {
    if (typeof URL !== "undefined") {
      const URLStatic = URL;
      if (typeof URLStatic.parse === "function")
        return URLStatic.parse(trimmed) ?? URL_UNPARSEABLE;
    }
    return new URL(trimmed);
  } catch {
    return URL_UNPARSEABLE;
  }
}
var asciiTabOrNewline = /[\t\n\r]/g;
function stripTabAndNewline(value) {
  return value.replace(asciiTabOrNewline, "");
}
function urlHostnameOk(url, hostname) {
  hostname.lastIndex = 0;
  return hostname.test(url.hostname);
}
function urlProtocolOk(url, protocol) {
  protocol.lastIndex = 0;
  return protocol.test(url.protocol.endsWith(":") ? url.protocol.slice(0, -1) : url.protocol);
}
var $ZodURL = /* @__PURE__ */ $constructor("$ZodURL", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    try {
      const trimmed = payload.value.trim();
      const url = validateURL(trimmed, def);
      if (url === URL_BAD_FORMAT) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          note: "Invalid URL format",
          input: payload.value,
          inst,
          continue: !def.abort
        });
        return;
      }
      if (url === URL_UNPARSEABLE) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          input: payload.value,
          inst,
          continue: !def.abort
        });
        return;
      }
      if (url === true) {
        payload.value = stripTabAndNewline(trimmed);
        return;
      }
      if (def.hostname && !urlHostnameOk(url, def.hostname)) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          note: "Invalid hostname",
          pattern: def.hostname.source,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
      if (def.protocol && !urlProtocolOk(url, def.protocol)) {
        payload.issues.push({
          code: "invalid_format",
          format: "url",
          note: "Invalid protocol",
          pattern: def.protocol.source,
          input: payload.value,
          inst,
          continue: !def.abort
        });
      }
      payload.value = def.normalize ? url.href : stripTabAndNewline(trimmed);
      return;
    } catch (_) {
      payload.issues.push({
        code: "invalid_format",
        format: "url",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodEmoji = /* @__PURE__ */ $constructor("$ZodEmoji", (inst, def) => {
  def.pattern ?? (def.pattern = emoji());
  $ZodStringFormat.init(inst, def);
});
var $ZodNanoID = /* @__PURE__ */ $constructor("$ZodNanoID", (inst, def) => {
  if (def.length !== undefined && (!Number.isInteger(def.length) || def.length < 1))
    throw new Error(`Invalid nanoid length: ${def.length}`);
  def.pattern ?? (def.pattern = def.length === undefined ? nanoid : nanoidOfLength(def.length));
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID = /* @__PURE__ */ $constructor("$ZodCUID", (inst, def) => {
  def.pattern ?? (def.pattern = cuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodCUID2 = /* @__PURE__ */ $constructor("$ZodCUID2", (inst, def) => {
  def.pattern ?? (def.pattern = cuid2);
  $ZodStringFormat.init(inst, def);
});
var $ZodULID = /* @__PURE__ */ $constructor("$ZodULID", (inst, def) => {
  def.pattern ?? (def.pattern = ulid);
  $ZodStringFormat.init(inst, def);
});
var $ZodXID = /* @__PURE__ */ $constructor("$ZodXID", (inst, def) => {
  def.pattern ?? (def.pattern = xid);
  $ZodStringFormat.init(inst, def);
});
var $ZodKSUID = /* @__PURE__ */ $constructor("$ZodKSUID", (inst, def) => {
  def.pattern ?? (def.pattern = ksuid);
  $ZodStringFormat.init(inst, def);
});
var $ZodISODateTime = /* @__PURE__ */ $constructor("$ZodISODateTime", (inst, def) => {
  def.pattern ?? (def.pattern = datetime(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODate = /* @__PURE__ */ $constructor("$ZodISODate", (inst, def) => {
  def.pattern ?? (def.pattern = date);
  $ZodStringFormat.init(inst, def);
});
var $ZodISOTime = /* @__PURE__ */ $constructor("$ZodISOTime", (inst, def) => {
  def.pattern ?? (def.pattern = time(def));
  $ZodStringFormat.init(inst, def);
});
var $ZodISODuration = /* @__PURE__ */ $constructor("$ZodISODuration", (inst, def) => {
  def.pattern ?? (def.pattern = duration);
  $ZodStringFormat.init(inst, def);
});
var $ZodIPv4 = /* @__PURE__ */ $constructor("$ZodIPv4", (inst, def) => {
  def.pattern ?? (def.pattern = ipv4);
  $ZodStringFormat.init(inst, def);
});
var ipv6Alphabet = /^[0-9a-fA-F:.]+$/;
function isValidIPv6(value) {
  if (!ipv6Alphabet.test(value))
    return false;
  return canParseURL(`http://[${value}]`);
}
var $ZodIPv6 = /* @__PURE__ */ $constructor("$ZodIPv6", (inst, def) => {
  def.pattern ?? (def.pattern = ipv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (!isValidIPv6(payload.value)) {
      payload.issues.push({
        code: "invalid_format",
        format: "ipv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
var $ZodCIDRv4 = /* @__PURE__ */ $constructor("$ZodCIDRv4", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv4);
  $ZodStringFormat.init(inst, def);
});
function isValidCIDRv6(value) {
  const parts = value.split("/");
  if (parts.length !== 2)
    return false;
  const [address, prefix] = parts;
  if (!prefix)
    return false;
  const prefixNum = Number(prefix);
  if (`${prefixNum}` !== prefix)
    return false;
  if (prefixNum < 0 || prefixNum > 128)
    return false;
  return isValidIPv6(address);
}
var $ZodCIDRv6 = /* @__PURE__ */ $constructor("$ZodCIDRv6", (inst, def) => {
  def.pattern ?? (def.pattern = cidrv6);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (!isValidCIDRv6(payload.value)) {
      payload.issues.push({
        code: "invalid_format",
        format: "cidrv6",
        input: payload.value,
        inst,
        continue: !def.abort
      });
    }
  };
});
function isValidBase64(data) {
  if (data === "")
    return true;
  if (/\s/.test(data))
    return false;
  if (data.length % 4 !== 0)
    return false;
  try {
    atob(data);
    return true;
  } catch {
    return false;
  }
}
var base64Charset = /^[0-9a-zA-Z+/]*={0,2}$/;
var $ZodBase64 = /* @__PURE__ */ $constructor("$ZodBase64", (inst, def) => {
  def.pattern ?? (def.pattern = base64Charset);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidBase64(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var base64urlCharset = /^[A-Za-z0-9_-]*$/;
function isValidBase64URL(data) {
  if (!base64urlCharset.test(data))
    return false;
  const base64 = data.replace(/[-_]/g, (c) => c === "-" ? "+" : "/");
  const padded = base64.padEnd(Math.ceil(base64.length / 4) * 4, "=");
  return isValidBase64(padded);
}
var $ZodBase64URL = /* @__PURE__ */ $constructor("$ZodBase64URL", (inst, def) => {
  def.pattern ?? (def.pattern = base64urlCharset);
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidBase64URL(payload.value))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "base64url",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodE164 = /* @__PURE__ */ $constructor("$ZodE164", (inst, def) => {
  def.pattern ?? (def.pattern = e164);
  $ZodStringFormat.init(inst, def);
});
function isValidJWT(token, algorithm = null) {
  try {
    const tokensParts = token.split(".");
    if (tokensParts.length !== 3)
      return false;
    const [header] = tokensParts;
    if (!header)
      return false;
    const parsedHeader = JSON.parse(atob(header));
    if ("typ" in parsedHeader && parsedHeader?.typ !== "JWT")
      return false;
    if (!parsedHeader.alg)
      return false;
    if (algorithm && (!("alg" in parsedHeader) || parsedHeader.alg !== algorithm))
      return false;
    return true;
  } catch {
    return false;
  }
}
var $ZodJWT = /* @__PURE__ */ $constructor("$ZodJWT", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  inst._zod.check = (payload) => {
    if (isValidJWT(payload.value, def.alg))
      return;
    payload.issues.push({
      code: "invalid_format",
      format: "jwt",
      input: payload.value,
      inst,
      continue: !def.abort
    });
  };
});
var $ZodNumber = /* @__PURE__ */ $constructor("$ZodNumber", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = number;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Number(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "number" && !Number.isNaN(input) && Number.isFinite(input)) {
      return payload;
    }
    const received = typeof input === "number" ? Number.isNaN(input) ? "NaN" : !Number.isFinite(input) ? String(input) : undefined : undefined;
    payload.issues.push({
      expected: "number",
      code: "invalid_type",
      input,
      inst,
      ...received ? { received } : {}
    });
    return payload;
  };
});
var $ZodNumberFormat = /* @__PURE__ */ $constructor("$ZodNumberFormat", (inst, def) => {
  $ZodCheckNumberFormat.init(inst, def);
  $ZodNumber.init(inst, def);
});
var $ZodBoolean = /* @__PURE__ */ $constructor("$ZodBoolean", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = boolean;
  inst._zod.parse = (payload, _ctx) => {
    if (def.coerce)
      try {
        payload.value = Boolean(payload.value);
      } catch (_) {}
    const input = payload.value;
    if (typeof input === "boolean")
      return payload;
    payload.issues.push({
      expected: "boolean",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodNull = /* @__PURE__ */ $constructor("$ZodNull", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.pattern = _null;
  inst._zod.values = new Set([null]);
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (input === null)
      return payload;
    payload.issues.push({
      expected: "null",
      code: "invalid_type",
      input,
      inst
    });
    return payload;
  };
});
var $ZodUnknown = /* @__PURE__ */ $constructor("$ZodUnknown", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload) => payload;
});
var $ZodNever = /* @__PURE__ */ $constructor("$ZodNever", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _ctx) => {
    payload.issues.push({
      expected: "never",
      code: "invalid_type",
      input: payload.value,
      inst
    });
    return payload;
  };
});
function capSize(inst, size) {
  const caps = sizeCaps(inst._zod.def.checks);
  if (!caps.length)
    return;
  const cap = Math.min(...caps.map((c) => c[0]));
  const parse = inst._zod.parse;
  inst._zod.parse = (payload, ctx) => {
    const n = size(payload.value);
    if (n > cap && !ctx?.skipChecks && ctx?.direction !== "backward") {
      for (const [max, ch] of sizeCaps(inst._zod.def.checks)) {
        if (n > max && ch._zod.def.when(payload)) {
          const start = payload.issues.length;
          ch._zod.check(payload);
          payload.issues[start].continue = false;
          attachSchema(payload.issues, start, inst);
          return payload;
        }
      }
    }
    return parse(payload, ctx);
  };
}
var arraySize = (input) => Array.isArray(input) ? input.length : -1;
function handleArrayResult(result, final, index) {
  if (result.issues.length) {
    final.issues.push(...prefixIssues(index, result.issues));
  }
  final.value[index] = result.value;
}
var $ZodArray = /* @__PURE__ */ $constructor("$ZodArray", (inst, def) => {
  $ZodType.init(inst, def);
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!Array.isArray(input)) {
      payload.issues.push({
        expected: "array",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, Array(input.length), ctx) : Array(input.length);
    const proms = [];
    const abortEarly = ctx?.abortEarly;
    for (let i = 0;i < input.length; i++) {
      const item = input[i];
      const result = def.element._zod.run({
        value: item,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        proms.push(result.then((result) => handleArrayResult(result, payload, i)));
      } else {
        handleArrayResult(result, payload, i);
        if (abortEarly && result.issues.length !== 0 && aborted(result))
          break;
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
  capSize(inst, arraySize);
});
function handlePropertyResult(result, final, key, input, optin, optout) {
  const isPresent = key in input;
  const isOptionalOut = optout === "optional";
  if (!isPresent && isOptionalOut && optin === "optional") {
    return;
  }
  if (result.issues.length) {
    if (optin !== undefined && isOptionalOut && !isPresent) {
      return;
    }
    final.issues.push(...prefixIssues(key, result.issues));
  }
  if (!isPresent && optin === undefined) {
    if (!result.issues.length) {
      final.issues.push({
        code: "invalid_type",
        expected: "nonoptional",
        input: undefined,
        path: [key]
      });
    }
    return;
  }
  if (result.value === undefined) {
    if (isPresent || optin === "defaulted" && !isOptionalOut) {
      final.value[key] = undefined;
    }
  } else {
    final.value[key] = result.value;
  }
}
var NO_SYMBOL_KEYS = [];
function normalizeDef(def) {
  const keys = Object.keys(def.shape);
  const ownSymbols = Object.getOwnPropertySymbols(def.shape);
  const symbolKeys = ownSymbols.length ? ownSymbols : NO_SYMBOL_KEYS;
  const allKeys = symbolKeys.length ? [...keys, ...symbolKeys] : keys;
  for (const k of allKeys) {
    if (!def.shape?.[k]?._zod?.traits?.has("$ZodType")) {
      throw new Error(`Invalid element at key "${String(k)}": expected a Zod schema`);
    }
  }
  const okeys = optionalKeys(def.shape);
  return {
    ...def,
    allKeys,
    symbolKeys,
    keySet: new Set(keys),
    numKeys: keys.length,
    optionalKeys: new Set(okeys)
  };
}
function handleCatchall(proms, input, payload, ctx, def, inst, abortEarly) {
  const unrecognized = [];
  const keySet = def.keySet;
  const _catchall = def.catchall._zod;
  const t = _catchall.def.type;
  const optin = _catchall.optin;
  const optout = _catchall.optout;
  let seen = 0;
  for (const key in input) {
    if (abortEarly && payload.issues.length !== seen) {
      if (aborted(payload, seen))
        break;
      seen = payload.issues.length;
    }
    if (keySet.has(key))
      continue;
    if (key === "__proto__") {
      if (t === "never")
        unrecognized.push(key);
      continue;
    }
    if (t === "never") {
      unrecognized.push(key);
      continue;
    }
    const r = _catchall.run({ value: input[key], issues: [] }, ctx);
    if (r instanceof Promise) {
      proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
    } else {
      handlePropertyResult(r, payload, key, input, optin, optout);
    }
  }
  if (unrecognized.length) {
    payload.issues.push({
      code: "unrecognized_keys",
      keys: unrecognized,
      input,
      inst,
      continue: true
    });
  }
  if (!proms.length)
    return payload;
  return Promise.all(proms).then(() => {
    return payload;
  });
}
var $ZodObject = /* @__PURE__ */ $constructor("$ZodObject", (inst, def) => {
  $ZodType.init(inst, def);
  const desc = Object.getOwnPropertyDescriptor(def, "shape");
  const sh = desc?.get ? desc.get.raw : def.shape ?? {};
  if (sh) {
    const get = () => {
      const newSh = { ...sh };
      Object.defineProperty(def, "shape", { value: newSh });
      get.raw = newSh;
      return newSh;
    };
    get.raw = sh;
    Object.defineProperty(def, "shape", { get });
  }
  const _normalized = cached(() => normalizeDef(def));
  defineLazyInternal(inst, "propValues", (zod) => {
    const shape = zod.def.shape;
    const propValues = {};
    for (const key in shape) {
      const field = shape[key]._zod;
      if (field.values) {
        if (!Object.prototype.hasOwnProperty.call(propValues, key)) {
          assignProp(propValues, key, new Set);
        }
        for (const v of field.values)
          propValues[key].add(v);
        if (field.optin !== undefined)
          propValues[key].add(undefined);
      }
    }
    return propValues;
  });
  const isObject2 = isObject;
  const catchall = def.catchall;
  let value;
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
    const proms = [];
    const shape = value.shape;
    const abortEarly = ctx?.abortEarly;
    let seen = payload.issues.length;
    for (const key of value.allKeys) {
      if (abortEarly && payload.issues.length !== seen) {
        if (aborted(payload, seen))
          break;
        seen = payload.issues.length;
      }
      if (key === "__proto__")
        continue;
      const el = shape[key];
      const optin = el._zod.optin;
      const optout = el._zod.optout;
      const r = el._zod.run({ value: input[key], issues: [] }, ctx);
      if (r instanceof Promise) {
        proms.push(r.then((r) => handlePropertyResult(r, payload, key, input, optin, optout)));
      } else {
        handlePropertyResult(r, payload, key, input, optin, optout);
      }
    }
    if (!catchall) {
      return proms.length ? Promise.all(proms).then(() => payload) : payload;
    }
    return handleCatchall(proms, input, payload, ctx, _normalized.value, inst, abortEarly === true);
  };
});
var $ZodObjectJIT = /* @__PURE__ */ $constructor("$ZodObjectJIT", (inst, def) => {
  $ZodObject.init(inst, def);
  const superParse = inst._zod.parse;
  const _normalized = cached(() => normalizeDef(def));
  const memo = globalConfig.memoizer;
  const generateFastpass = (shape) => {
    const normalized = _normalized.value;
    const syms = normalized.symbolKeys;
    const doc = new Doc(["payload", "ctx"], { shape, inst, memo, syms });
    const parseStr = (k) => `shape[${k}]._zod.run({ value: input[${k}], issues: [] }, ctx)`;
    const prefixStr = (id, k) => `
          let ${id}_ab = false;
          for (let i = 0; i < ${id}.issues.length; i++) {
            const iss = ${id}.issues[i];
            iss.path = iss.path ? [${k}, ...iss.path] : [${k}];
            payload.issues.push(iss);
            if (iss.continue !== true) ${id}_ab = true;
          }
          if (${id}_ab && ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }`;
    doc.write(`const input = payload.value;`);
    const ids = Object.create(null);
    let counter = 0;
    for (const key of normalized.allKeys) {
      ids[key] = `key_${counter++}`;
    }
    doc.write(memo ? `const newResult = memo.alloc(inst, payload, {}, ctx);` : `const newResult = {};`);
    for (const key of normalized.allKeys) {
      if (key === "__proto__")
        continue;
      const id = ids[key];
      const k = typeof key === "symbol" ? `syms[${syms.indexOf(key)}]` : esc(key);
      const isPresent = `${k} in input`;
      const schema = shape[key];
      const optin = schema?._zod?.optin;
      const isOptionalIn = optin !== undefined;
      const isOptionalOut = schema?._zod?.optout === "optional";
      doc.write(`const ${id} = ${parseStr(k)};`);
      if (isOptionalIn && isOptionalOut) {
        const assign = optin === "optional" ? `${id}_present` : `${id}.value !== undefined || ${id}_present`;
        doc.write(`
        const ${id}_present = ${isPresent};
        if (!${id}.issues.length || ${id}_present) {
          if (${id}.issues.length) {${prefixStr(id, k)}
          }

          if (${assign}) {
            newResult[${k}] = ${id}.value;
          }
        }

      `);
      } else if (!isOptionalIn) {
        doc.write(`
        const ${id}_present = ${isPresent};
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
        if (!${id}_present && !${id}.issues.length) {
          payload.issues.push({
            code: "invalid_type",
            expected: "nonoptional",
            input: undefined,
            path: [${k}]
          });
          if (ctx && ctx.abortEarly) {
            payload.value = newResult;
            return payload;
          }
        }

        if (${id}_present) {
          newResult[${k}] = ${id}.value;
        }

      `);
      } else {
        doc.write(`
        if (${id}.issues.length) {${prefixStr(id, k)}
        }
      `);
        if (optin === "defaulted") {
          doc.write(`newResult[${k}] = ${id}.value;`);
        } else {
          doc.write(`
        if (${id}.value !== undefined || ${isPresent}) {
          newResult[${k}] = ${id}.value;
        }
      `);
        }
      }
    }
    doc.write(`payload.value = newResult;`);
    doc.write(`return payload;`);
    return doc.compile();
  };
  let fastpass;
  const isObject2 = isObject;
  const jit = !globalConfig.jitless;
  const allowsEval2 = allowsEval;
  const fastEnabled = jit && allowsEval2.value;
  const catchall = def.catchall;
  let value;
  inst._zod.parse = (payload, ctx) => {
    value ?? (value = _normalized.value);
    const input = payload.value;
    if (!isObject2(input)) {
      payload.issues.push({
        expected: "object",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    if (jit && fastEnabled && ctx?.async === false && ctx.jitless !== true) {
      if (!fastpass)
        fastpass = generateFastpass(def.shape);
      payload = fastpass(payload, ctx);
      if (!catchall)
        return payload;
      return handleCatchall([], input, payload, ctx, value, inst, ctx?.abortEarly === true);
    }
    return superParse(payload, ctx);
  };
});
function handleUnionResults(results, final, inst, ctx) {
  for (const result of results) {
    if (result.issues.length === 0) {
      final.value = result.value;
      return final;
    }
  }
  const nonaborted = results.filter((r) => !aborted(r));
  if (nonaborted.length === 1) {
    final.value = nonaborted[0].value;
    return nonaborted[0];
  }
  final.issues.push({
    code: "invalid_union",
    input: final.value,
    inst,
    errors: results.map((result) => result.issues.map((iss) => finalizeIssue(iss, ctx, config())))
  });
  return final;
}
var $ZodUnion = /* @__PURE__ */ $constructor("$ZodUnion", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.options.some((o) => o._zod.optin === "defaulted") ? "defaulted" : zod.def.options.some((o) => o._zod.optin !== undefined) ? "optional" : undefined);
  defineLazyInternal(inst, "optout", (zod) => zod.def.options.some((o) => o._zod.optout === "optional") ? "optional" : undefined);
  defineLazyInternal(inst, "values", (zod) => {
    if (zod.def.options.every((o) => o._zod.values)) {
      return new Set(zod.def.options.flatMap((option) => Array.from(option._zod.values)));
    }
    return;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    if (zod.def.options.every((o) => o._zod.pattern)) {
      const patterns = zod.def.options.map((o) => o._zod.pattern);
      return new RegExp(`^(${patterns.map((p) => cleanRegex(p.source)).join("|")})$`);
    }
    return;
  });
  const first = def.options.length === 1 ? def.options[0]._zod.run : null;
  inst._zod.parse = (payload, ctx) => {
    if (first) {
      return first(payload, ctx);
    }
    let async = false;
    const results = [];
    for (const option of def.options) {
      const result = option._zod.run({
        value: payload.value,
        issues: []
      }, ctx);
      if (result instanceof Promise) {
        results.push(result);
        async = true;
      } else {
        if (result.issues.length === 0)
          return result;
        results.push(result);
      }
    }
    if (!async)
      return handleUnionResults(results, payload, inst, ctx);
    return Promise.all(results).then((results) => {
      return handleUnionResults(results, payload, inst, ctx);
    });
  };
});
function discriminatorMap(def) {
  const map = new Map;
  for (const option of def.options) {
    const values = option._zod.propValues?.[def.discriminator];
    if (!values || values.size === 0)
      throw new Error(`Invalid discriminated union option at index "${def.options.indexOf(option)}"`);
    for (const value of values) {
      if (map.has(value)) {
        if (value !== undefined)
          throw new Error(`Duplicate discriminator value "${String(value)}"`);
        map.set(value, null);
      } else {
        map.set(value, option);
      }
    }
  }
  return map;
}
var $ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("$ZodDiscriminatedUnion", (inst, def) => {
  def.inclusive = false;
  $ZodUnion.init(inst, def);
  const _super = inst._zod.parse;
  defineLazyInternal(inst, "propValues", (zod) => {
    const propValues = {};
    let undefinedCount = 0;
    for (const option of zod.def.options) {
      const pv = option._zod.propValues;
      if (!pv || Object.keys(pv).length === 0)
        throw new Error(`Invalid discriminated union option at index "${zod.def.options.indexOf(option)}"`);
      if (pv[zod.def.discriminator]?.has(undefined))
        undefinedCount++;
      for (const [k, v] of Object.entries(pv)) {
        if (!Object.prototype.hasOwnProperty.call(propValues, k)) {
          assignProp(propValues, k, new Set);
        }
        for (const val of v) {
          propValues[k].add(val);
        }
      }
    }
    if (!zod.def.unionFallback && undefinedCount > 1)
      propValues[zod.def.discriminator]?.delete(undefined);
    return propValues;
  });
  def.options.forEach((option, i) => {
    const propShape = rawShape(option._zod.def);
    if (propShape && !Object.prototype.hasOwnProperty.call(propShape, def.discriminator)) {
      throw new Error(`Invalid discriminated union option at index "${i}"`);
    }
  });
  const disc = cached(() => discriminatorMap(def));
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isObject(input)) {
      payload.issues.push({
        code: "invalid_type",
        expected: "object",
        input,
        inst
      });
      return payload;
    }
    const value = input?.[def.discriminator];
    const opt = disc.value.get(value);
    if (opt && (value !== undefined || ctx.direction !== "backward")) {
      return opt._zod.run(payload, ctx);
    }
    if (def.unionFallback || ctx.direction === "backward") {
      return _super(payload, ctx);
    }
    payload.issues.push({
      code: "invalid_union",
      errors: [],
      note: "No matching discriminator",
      discriminator: def.discriminator,
      options: Array.from(disc.value.keys()).filter((value) => disc.value.get(value) !== null),
      input,
      path: [def.discriminator],
      inst
    });
    return payload;
  };
});
var $ZodIntersection = /* @__PURE__ */ $constructor("$ZodIntersection", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    const left = def.left._zod.run({ value: input, issues: [] }, ctx);
    const right = def.right._zod.run({ value: input, issues: [] }, ctx);
    const async = left instanceof Promise || right instanceof Promise;
    if (async) {
      return Promise.all([left, right]).then(([left, right]) => {
        return handleIntersectionResults(payload, left, right);
      });
    }
    return handleIntersectionResults(payload, left, right);
  };
});
function mergeValues(a, b) {
  if (a === b) {
    return { valid: true, data: a };
  }
  if (a instanceof Date && b instanceof Date && +a === +b) {
    return { valid: true, data: a };
  }
  if (isPlainObject(a) && isPlainObject(b)) {
    const bKeys = Object.keys(b);
    const sharedKeys = Object.keys(a).filter((key) => bKeys.indexOf(key) !== -1);
    const newObj = { ...a, ...b };
    if (Object.prototype.hasOwnProperty.call(newObj, "__proto__"))
      delete newObj.__proto__;
    for (const key of sharedKeys) {
      if (key === "__proto__")
        continue;
      const sharedValue = mergeValues(a[key], b[key]);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [key, ...sharedValue.mergeErrorPath]
        };
      }
      newObj[key] = sharedValue.data;
    }
    return { valid: true, data: newObj };
  }
  if (Array.isArray(a) && Array.isArray(b)) {
    if (a.length !== b.length) {
      return { valid: false, mergeErrorPath: [] };
    }
    const newArray = [];
    for (let index = 0;index < a.length; index++) {
      const itemA = a[index];
      const itemB = b[index];
      const sharedValue = mergeValues(itemA, itemB);
      if (!sharedValue.valid) {
        return {
          valid: false,
          mergeErrorPath: [index, ...sharedValue.mergeErrorPath]
        };
      }
      newArray.push(sharedValue.data);
    }
    return { valid: true, data: newArray };
  }
  return { valid: false, mergeErrorPath: [] };
}
function handleIntersectionResults(result, left, right) {
  const unrecKeys = new Map;
  let unrecIssue;
  const keyIssues = new Map;
  const collect = (iss, side) => {
    let keys;
    if (iss.code === "unrecognized_keys" && !iss.path?.length) {
      unrecIssue ?? (unrecIssue = iss);
      keys = iss.keys;
    } else if (iss.code === "invalid_key" && iss.origin === "record" && iss.path?.length === 1) {
      const k = String(iss.path[0]);
      if (!keyIssues.has(k))
        keyIssues.set(k, iss);
      keys = [k];
    } else {
      return false;
    }
    for (const k of keys) {
      if (!unrecKeys.has(k))
        unrecKeys.set(k, {});
      unrecKeys.get(k)[side] = true;
    }
    return true;
  };
  for (const iss of left.issues) {
    if (!collect(iss, "l"))
      result.issues.push(iss);
  }
  for (const iss of right.issues) {
    if (!collect(iss, "r"))
      result.issues.push(iss);
  }
  const bothKeys = [...unrecKeys].filter(([, f]) => f.l && f.r).map(([k]) => k);
  if (bothKeys.length) {
    const aggregated = unrecIssue ? bothKeys.filter((k) => unrecIssue.keys.includes(k)) : [];
    if (aggregated.length)
      result.issues.push({ ...unrecIssue, keys: aggregated });
    for (const k of bothKeys) {
      if (!aggregated.includes(k) && keyIssues.has(k))
        result.issues.push(keyIssues.get(k));
    }
  }
  const merged = mergeValues(left.value, right.value);
  if (!merged.valid) {
    if (aborted(result))
      return result;
    throw new Error(`Unmergable intersection. Error path: ` + `${JSON.stringify(merged.mergeErrorPath)}`);
  }
  result.value = merged.data;
  return result;
}
var $ZodRecord = /* @__PURE__ */ $constructor("$ZodRecord", (inst, def) => {
  $ZodType.init(inst, def);
  const memo = globalConfig.memoizer;
  memo?.attach(inst);
  inst._zod.parse = (payload, ctx) => {
    const input = payload.value;
    if (!isPlainObject(input)) {
      payload.issues.push({
        expected: "record",
        code: "invalid_type",
        input,
        inst
      });
      return payload;
    }
    const proms = [];
    const values = def.keyType._zod.values;
    if (values && !def.partial) {
      payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
      const recordKeys = new Set;
      for (const key of values) {
        if (typeof key === "string" || typeof key === "number" || typeof key === "symbol") {
          recordKeys.add(typeof key === "number" ? key.toString() : key);
          if (key === "__proto__")
            continue;
          const keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
          if (keyResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (keyResult.issues.length) {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
            continue;
          }
          const outKey = keyResult.value;
          if (outKey === "__proto__")
            continue;
          const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
          if (result instanceof Promise) {
            proms.push(result.then((result) => {
              if (result.issues.length) {
                payload.issues.push(...prefixIssues(key, result.issues));
              }
              payload.value[outKey] = result.value;
            }));
          } else {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }
        }
      }
      let unrecognized;
      for (const key in input) {
        if (!recordKeys.has(key)) {
          if (def.mode === "loose") {
            if (key === "__proto__")
              continue;
            payload.value[key] = input[key];
          } else {
            unrecognized = unrecognized ?? [];
            unrecognized.push(key);
          }
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized,
          continue: true
        });
      }
    } else {
      payload.value = memo ? memo.alloc(inst, payload, {}, ctx) : {};
      let unrecognized;
      for (const key of Reflect.ownKeys(input)) {
        if (key === "__proto__")
          continue;
        if (!Object.prototype.propertyIsEnumerable.call(input, key))
          continue;
        let keyResult = def.keyType._zod.run({ value: key, issues: [] }, ctx);
        if (keyResult instanceof Promise) {
          throw new Error("Async schemas not supported in object keys currently");
        }
        const checkNumericKey = typeof key === "string" && number.test(key) && keyResult.issues.length;
        if (checkNumericKey) {
          const retryResult = def.keyType._zod.run({ value: Number(key), issues: [] }, ctx);
          if (retryResult instanceof Promise) {
            throw new Error("Async schemas not supported in object keys currently");
          }
          if (retryResult.issues.length === 0) {
            keyResult = retryResult;
          }
        }
        if (keyResult.issues.length) {
          if (def.mode === "loose") {
            payload.value[key] = input[key];
          } else if (values) {
            unrecognized = unrecognized ?? [];
            unrecognized.push(key);
          } else {
            payload.issues.push({
              code: "invalid_key",
              origin: "record",
              issues: keyResult.issues.map((iss) => finalizeIssue(iss, ctx, config())),
              input: key,
              path: [key],
              inst
            });
          }
          continue;
        }
        const outKey = keyResult.value;
        if (outKey === "__proto__")
          continue;
        const result = def.valueType._zod.run({ value: input[key], issues: [] }, ctx);
        if (result instanceof Promise) {
          proms.push(result.then((result) => {
            if (result.issues.length) {
              payload.issues.push(...prefixIssues(key, result.issues));
            }
            payload.value[outKey] = result.value;
          }));
        } else {
          if (result.issues.length) {
            payload.issues.push(...prefixIssues(key, result.issues));
          }
          payload.value[outKey] = result.value;
        }
      }
      if (unrecognized && unrecognized.length > 0) {
        payload.issues.push({
          code: "unrecognized_keys",
          input,
          inst,
          keys: unrecognized,
          continue: true
        });
      }
    }
    if (proms.length) {
      return Promise.all(proms).then(() => payload);
    }
    return payload;
  };
});
var $ZodEnum = /* @__PURE__ */ $constructor("$ZodEnum", (inst, def) => {
  $ZodType.init(inst, def);
  const values = getEnumValues(def.entries);
  const valuesSet = new Set(values);
  inst._zod.values = valuesSet;
  defineLazyInternal(inst, "pattern", (zod) => {
    const patternValues = getEnumValues(zod.def.entries).filter((k) => propertyKeyTypes.has(typeof k));
    return new RegExp(patternValues.length ? `^(${patternValues.map((o) => escapeRegex(o.toString())).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (valuesSet.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodLiteral = /* @__PURE__ */ $constructor("$ZodLiteral", (inst, def) => {
  $ZodType.init(inst, def);
  const values = new Set(def.values);
  inst._zod.values = values;
  defineLazyInternal(inst, "pattern", (zod) => {
    const vals = zod.def.values;
    return new RegExp(vals.length ? `^(${vals.map((o) => typeof o === "string" ? escapeRegex(o) : o ? escapeRegex(o.toString()) : String(o)).join("|")})$` : "^[^\\s\\S]$");
  });
  inst._zod.parse = (payload, _ctx) => {
    const input = payload.value;
    if (values.has(input)) {
      return payload;
    }
    payload.issues.push({
      code: "invalid_value",
      values: def.values,
      input,
      inst
    });
    return payload;
  };
});
var $ZodTransform = /* @__PURE__ */ $constructor("$ZodTransform", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "optional";
  globalConfig.memoizer?.guard(inst);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    const _out = def.transform(payload.value, payload);
    if (ctx.async) {
      const output = _out instanceof Promise ? _out : Promise.resolve(_out);
      return output.then((output) => {
        payload.value = output;
        return payload;
      });
    }
    if (_out instanceof Promise) {
      throw new $ZodAsyncError;
    }
    payload.value = _out;
    return payload;
  };
});
function handleOptionalResult(payload, result) {
  payload.value = result.issues.length ? undefined : result.value;
  return payload;
}
var $ZodOptional = /* @__PURE__ */ $constructor("$ZodOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
  inst._zod.optout = "optional";
  defineLazyInternal(inst, "values", (zod) => {
    const values = zod.def.innerType._zod.values;
    return values ? new Set([...values, undefined]) : undefined;
  });
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)})?$`) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === undefined) {
      if (def.innerType._zod.optin !== "defaulted")
        return payload;
      const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
      if (result instanceof Promise)
        return result.then((result) => handleOptionalResult(payload, result));
      return handleOptionalResult(payload, result);
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodExactOptional = /* @__PURE__ */ $constructor("$ZodExactOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  defineLazyInternal(inst, "pattern", (zod) => zod.def.innerType._zod.pattern);
  inst._zod.parse = (payload, ctx) => {
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNullable = /* @__PURE__ */ $constructor("$ZodNullable", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "pattern", (zod) => {
    const pattern = zod.def.innerType._zod.pattern;
    return pattern ? new RegExp(`^(${cleanRegex(pattern.source)}|null)$`) : undefined;
  });
  defineLazyInternal(inst, "values", (zod) => {
    return zod.def.innerType._zod.values ? new Set([...zod.def.innerType._zod.values, null]) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    if (payload.value === null)
      return payload;
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodDefault = /* @__PURE__ */ $constructor("$ZodDefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "defaulted";
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
      return payload;
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result) => handleDefaultResult(result, def));
    }
    return handleDefaultResult(result, def);
  };
});
function handleDefaultResult(payload, def) {
  if (payload.value === undefined) {
    payload.value = def.defaultValue;
  }
  return payload;
}
var $ZodPrefault = /* @__PURE__ */ $constructor("$ZodPrefault", (inst, def) => {
  $ZodType.init(inst, def);
  inst._zod.optin = "defaulted";
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    if (payload.value === undefined) {
      payload.value = def.defaultValue;
    }
    return def.innerType._zod.run(payload, ctx);
  };
});
var $ZodNonOptional = /* @__PURE__ */ $constructor("$ZodNonOptional", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "values", (zod) => {
    const v = zod.def.innerType._zod.values;
    return v ? new Set([...v].filter((x) => x !== undefined)) : undefined;
  });
  inst._zod.parse = (payload, ctx) => {
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then((result) => handleNonOptionalResult(result, inst));
    }
    return handleNonOptionalResult(result, inst);
  };
});
function handleNonOptionalResult(payload, inst) {
  if (!payload.issues.length && payload.value === undefined) {
    payload.issues.push({
      code: "invalid_type",
      expected: "nonoptional",
      input: payload.value,
      inst
    });
  }
  return payload;
}
function handleCatchResult(payload, result, def, ctx) {
  if (!result.issues.length) {
    payload.value = result.value;
    if (result.memo)
      payload.memo = true;
    return payload;
  }
  payload.value = def.catchValue({
    ...result,
    value: payload.value,
    error: {
      issues: result.issues.map((iss) => finalizeIssue(iss, ctx, config()))
    },
    input: payload.value
  });
  return payload;
}
var $ZodCatch = /* @__PURE__ */ $constructor("$ZodCatch", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType._zod.optin === "defaulted" ? "defaulted" : "optional");
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType._zod.optout);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run({ value: payload.value, issues: [] }, ctx);
    if (result instanceof Promise) {
      return result.then((result) => handleCatchResult(payload, result, def, ctx));
    }
    return handleCatchResult(payload, result, def, ctx);
  };
});
var $ZodPipe = /* @__PURE__ */ $constructor("$ZodPipe", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "values", (zod) => zod.def.in._zod.values);
  defineLazyInternal(inst, "optin", (zod) => zod.def.in._zod.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.out._zod.optout);
  defineLazyInternal(inst, "propValues", (zod) => zod.def.in._zod.propValues);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      const right = def.out._zod.run(payload, ctx);
      if (right instanceof Promise) {
        return right.then((right) => handlePipeResult(right, def.in, ctx));
      }
      return handlePipeResult(right, def.in, ctx);
    }
    const left = def.in._zod.run(payload, ctx);
    if (left instanceof Promise) {
      return left.then((left) => handlePipeResult(left, def.out, ctx));
    }
    return handlePipeResult(left, def.out, ctx);
  };
});
function handlePipeResult(left, next, ctx) {
  if (left.issues.some((iss) => iss.code !== "unrecognized_keys")) {
    left.aborted = true;
    return left;
  }
  return next._zod.run({ value: left.value, issues: left.issues }, ctx);
}
var $ZodReadonly = /* @__PURE__ */ $constructor("$ZodReadonly", (inst, def) => {
  $ZodType.init(inst, def);
  defineLazyInternal(inst, "propValues", (zod) => zod.def.innerType._zod.propValues);
  defineLazyInternal(inst, "values", (zod) => zod.def.innerType._zod.values);
  defineLazyInternal(inst, "optin", (zod) => zod.def.innerType?._zod?.optin);
  defineLazyInternal(inst, "optout", (zod) => zod.def.innerType?._zod?.optout);
  inst._zod.parse = (payload, ctx) => {
    if (ctx.direction === "backward") {
      return def.innerType._zod.run(payload, ctx);
    }
    const result = def.innerType._zod.run(payload, ctx);
    if (result instanceof Promise) {
      return result.then(handleReadonlyResult);
    }
    return handleReadonlyResult(result);
  };
});
function handleReadonlyResult(payload) {
  if (!payload.memo)
    payload.value = Object.freeze(payload.value);
  return payload;
}
var $ZodCustom = /* @__PURE__ */ $constructor("$ZodCustom", (inst, def) => {
  $ZodCheck.init(inst, def);
  $ZodType.init(inst, def);
  inst._zod.parse = (payload, _) => {
    return payload;
  };
  inst._zod.check = (payload) => {
    const input = payload.value;
    const r = def.fn(input);
    if (r instanceof Promise) {
      return r.then((r) => handleRefineResult(r, payload, input, inst));
    }
    handleRefineResult(r, payload, input, inst);
    return;
  };
});
function handleRefineResult(result, payload, input, inst) {
  if (!result) {
    const _iss = {
      code: "custom",
      input,
      inst,
      path: [...inst._zod.def.path ?? []],
      continue: !inst._zod.def.abort
    };
    if (inst._zod.def.params)
      _iss.params = inst._zod.def.params;
    payload.issues.push(issue(_iss));
  }
}
// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/memoizer.js
class $ZodCyclicError extends Error {
  constructor() {
    super(`Cannot parse a reference cycle that closes through a transform`);
    this.name = "ZodCyclicError";
  }
}
var STATE = "~memo";
var NO_ISSUES = [];
function isRef(value) {
  return value !== null && typeof value === "object";
}
function cloneIssues(issues) {
  return issues.map((iss) => iss.path ? { ...iss, path: iss.path.slice() } : { ...iss });
}
var recursive = /* @__PURE__ */ new WeakMap;
var NONE = 0;
var ASSUMED = 1;
var PROVEN = 2;
function isRecursive(inst, stack, resolve) {
  const cached = recursive.get(inst);
  if (cached !== undefined)
    return cached ? PROVEN : NONE;
  if (stack.has(inst))
    return PROVEN;
  stack.add(inst);
  let result = NONE;
  const check = (child) => {
    if (result !== PROVEN && child?._zod) {
      const answer = isRecursive(child, stack, resolve);
      if (answer > result)
        result = answer;
    }
  };
  const shape = (sh, spread) => {
    let answer = NONE;
    for (const key of Reflect.ownKeys(sh)) {
      const desc = Object.getOwnPropertyDescriptor(sh, key);
      if (spread && !desc.enumerable)
        continue;
      const child = desc.get ? ASSUMED : desc.value?._zod ? isRecursive(desc.value, stack, resolve) : NONE;
      if (child > answer)
        answer = child;
    }
    return answer;
  };
  const merge = (answer) => {
    if (answer > result)
      result = answer;
  };
  const def = inst._zod.def;
  const kind = def.type;
  switch (kind) {
    case "object": {
      const raw = rawShape(def);
      merge(raw ? shape(raw, true) : ASSUMED);
      check(def.catchall);
      break;
    }
    case "array":
      check(def.element);
      break;
    case "tuple":
      for (const el of def.items)
        check(el);
      check(def.rest);
      break;
    case "record":
    case "map":
      check(def.keyType);
      check(def.valueType);
      break;
    case "set":
      check(def.valueType);
      break;
    case "union":
      for (const el of def.options)
        check(el);
      break;
    case "intersection":
      check(def.left);
      check(def.right);
      break;
    case "optional":
    case "nullable":
    case "default":
    case "prefault":
    case "catch":
    case "readonly":
    case "nonoptional":
    case "promise":
    case "success":
      check(def.innerType);
      break;
    case "pipe":
      check(def.in);
      check(def.out);
      break;
    case "function":
      check(def.input);
      check(def.output);
      break;
    case "lazy": {
      const inner = def._cachedInner ?? (resolve ? inst._zod.innerType : undefined);
      merge(inner ? isRecursive(inner, stack, false) : ASSUMED);
      break;
    }
    case "template_literal":
    case "string":
    case "number":
    case "int":
    case "boolean":
    case "bigint":
    case "symbol":
    case "undefined":
    case "null":
    case "void":
    case "never":
    case "any":
    case "unknown":
    case "date":
    case "nan":
    case "enum":
    case "literal":
    case "file":
    case "transform":
    case "custom":
      break;
    default: {
      for (const key in def) {
        const desc = Object.getOwnPropertyDescriptor(def, key);
        if (!desc || desc.get)
          continue;
        const value = desc.value;
        if (!value || typeof value !== "object")
          continue;
        if (value._zod)
          check(value);
        else if (Array.isArray(value))
          for (const el of value)
            check(el);
      }
    }
  }
  stack.delete(inst);
  return settle(inst, result);
}
function settle(inst, answer) {
  if (answer !== ASSUMED)
    recursive.set(inst, answer === PROVEN);
  return answer;
}
function bucketFor(state, inst) {
  let bucket = state.buckets.get(inst);
  if (!bucket) {
    bucket = new WeakMap;
    state.buckets.set(inst, bucket);
  }
  return bucket;
}
var handoff;
var open = [];
var memo = {
  alloc(_inst, payload, empty) {
    const bucket = handoff;
    if (!bucket)
      return empty;
    handoff = undefined;
    const entry = { value: empty, issues: null };
    bucket.set(payload.value, entry);
    open.push(entry);
    return empty;
  },
  guard(inst) {
    var _a;
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred.push(() => {
      const base = inst._zod.parse;
      const wrapped = (payload, ctx) => {
        if (ctx.direction !== "backward" && isBackEdge(ctx, payload.value))
          throw new $ZodCyclicError;
        return base(payload, ctx);
      };
      inst._zod.parse = wrapped;
      if (inst._zod.run === base)
        inst._zod.run = wrapped;
    });
  },
  attach(inst) {
    var _a;
    let isRecursiveInst;
    let rechecked = false;
    let lastCtx;
    let lastBucket;
    (_a = inst._zod).deferred ?? (_a.deferred = []);
    inst._zod.deferred.push(() => {
      const base = inst._zod.parse;
      const wrapped = (payload, ctx) => {
        if (isRecursiveInst === undefined) {
          const walked = isRecursive(inst, new Set, false);
          if (walked === NONE) {
            inst._zod.parse = base;
            if (inst._zod.run === wrapped)
              inst._zod.run = base;
            return base(payload, ctx);
          }
          if (walked === PROVEN || rechecked)
            isRecursiveInst = true;
          else
            rechecked = true;
        }
        const input = payload.value;
        if (!isRef(input))
          return base(payload, ctx);
        let state = ctx[STATE];
        if (!state) {
          state = { buckets: new WeakMap, backEdges: undefined };
          ctx[STATE] = state;
        }
        let bucket;
        if (lastCtx === ctx) {
          bucket = lastBucket;
        } else {
          bucket = bucketFor(state, inst);
          lastCtx = ctx;
          lastBucket = bucket;
        }
        const hit = bucket.get(input);
        if (hit) {
          payload.value = hit.value;
          if (hit.issues) {
            if (hit.issues.length)
              payload.issues.push(...cloneIssues(hit.issues));
          } else {
            payload.memo = true;
            state.backEdges ?? (state.backEdges = new WeakSet);
            state.backEdges.add(hit.value);
          }
          return payload;
        }
        handoff = bucket;
        const depth = open.length;
        const result = base(payload, ctx);
        handoff = undefined;
        const entry = open.length > depth ? open.pop() : undefined;
        if (result instanceof Promise) {
          return result.then((r) => {
            if (entry)
              entry.issues = r.issues.length ? cloneIssues(r.issues) : NO_ISSUES;
            return r;
          });
        }
        if (entry)
          entry.issues = result.issues.length ? cloneIssues(result.issues) : NO_ISSUES;
        return result;
      };
      inst._zod.parse = wrapped;
      if (inst._zod.run === base)
        inst._zod.run = wrapped;
    });
  }
};
function memoizer() {
  return memo;
}
function isBackEdge(ctx, value) {
  const backEdges = ctx[STATE]?.backEdges;
  return backEdges !== undefined && isRef(value) && backEdges.has(value);
}
// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/locales/en.js
var error = () => {
  const Sizable = {
    string: { unit: "characters", verb: "to have" },
    file: { unit: "bytes", verb: "to have" },
    array: { unit: "items", verb: "to have" },
    set: { unit: "items", verb: "to have" },
    map: { unit: "entries", verb: "to have" }
  };
  function getSizing(origin) {
    return Sizable[origin] ?? null;
  }
  const FormatDictionary = {
    regex: "input",
    email: "email address",
    url: "URL",
    emoji: "emoji",
    uuid: "UUID",
    uuidv4: "UUIDv4",
    uuidv6: "UUIDv6",
    nanoid: "nanoid",
    guid: "GUID",
    cuid: "cuid",
    cuid2: "cuid2",
    ulid: "ULID",
    xid: "XID",
    ksuid: "KSUID",
    datetime: "ISO datetime",
    date: "ISO date",
    time: "ISO time",
    duration: "ISO duration",
    ipv4: "IPv4 address",
    ipv6: "IPv6 address",
    mac: "MAC address",
    cidrv4: "IPv4 range",
    cidrv6: "IPv6 range",
    base64: "base64-encoded string",
    base64url: "base64url-encoded string",
    json_string: "JSON string",
    e164: "E.164 number",
    currency_code: "currency code",
    credit_card: "credit card number",
    iban: "IBAN",
    jwt: "JWT",
    template_literal: "input"
  };
  const TypeDictionary = {
    nan: "NaN"
  };
  function getTypeName(type, input) {
    if (type === "number" && typeof input === "number" && !Number.isFinite(input)) {
      return String(input);
    }
    return TypeDictionary[type] ?? type;
  }
  return (issue) => {
    switch (issue.code) {
      case "invalid_type": {
        const expected = getTypeName(issue.expected);
        const receivedType = parsedType(issue.input);
        const received = getTypeName(receivedType, issue.input);
        return `Invalid input: expected ${expected}, received ${received}`;
      }
      case "invalid_value":
        if (issue.values.length === 1)
          return `Invalid input: expected ${stringifyPrimitive(issue.values[0])}`;
        return `Invalid option: expected one of ${joinValues(issue.values, "|")}`;
      case "too_big": {
        const adj = issue.exact ? "exactly " : issue.inclusive ? "<=" : "<";
        const sizing = getSizing(issue.origin);
        if (sizing)
          return `Too big: expected ${issue.origin ?? "value"} to have ${adj}${issue.maximum.toString()} ${sizing.unit ?? "elements"}`;
        return `Too big: expected ${issue.origin ?? "value"} to be ${adj}${issue.maximum.toString()}`;
      }
      case "too_small": {
        const adj = issue.exact ? "exactly " : issue.inclusive ? ">=" : ">";
        const sizing = getSizing(issue.origin);
        if (sizing) {
          return `Too small: expected ${issue.origin} to have ${adj}${issue.minimum.toString()} ${sizing.unit}`;
        }
        return `Too small: expected ${issue.origin} to be ${adj}${issue.minimum.toString()}`;
      }
      case "invalid_format": {
        const _issue = issue;
        if (_issue.format === "starts_with") {
          return `Invalid string: must start with "${_issue.prefix}"`;
        }
        if (_issue.format === "ends_with")
          return `Invalid string: must end with "${_issue.suffix}"`;
        if (_issue.format === "includes")
          return `Invalid string: must include "${_issue.includes}"`;
        if (_issue.format === "regex")
          return `Invalid string: must match pattern ${_issue.pattern}`;
        return `Invalid ${FormatDictionary[_issue.format] ?? issue.format}`;
      }
      case "not_multiple_of":
        return `Invalid number: must be a multiple of ${issue.divisor}`;
      case "unrecognized_keys":
        return `Unrecognized key${issue.keys.length > 1 ? "s" : ""}: ${joinValues(issue.keys, ", ")}`;
      case "invalid_key":
        return `Invalid key in ${issue.origin}`;
      case "invalid_union":
        if (issue.options && Array.isArray(issue.options) && issue.options.length > 0) {
          const opts = issue.options.map((o) => `'${o}'`).join(" | ");
          return `Invalid discriminator value. Expected ${opts}`;
        }
        if (issue.inclusive === false) {
          return "Invalid input: more than one option matched";
        }
        return "Invalid input";
      case "invalid_element":
        return `Invalid value in ${issue.origin}`;
      default:
        return `Invalid input`;
    }
  };
};
function en_default() {
  return {
    localeError: error()
  };
}
// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/registries.js
var _a2;
class $ZodRegistry {
  constructor() {
    this._map = new WeakMap;
    this._idmap = new Map;
  }
  add(schema, ..._meta) {
    const meta = _meta[0];
    this._map.set(schema, meta);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.set(meta.id, schema);
    }
    return this;
  }
  clear() {
    this._map = new WeakMap;
    this._idmap = new Map;
    return this;
  }
  remove(schema) {
    const meta = this._map.get(schema);
    if (meta && typeof meta === "object" && "id" in meta) {
      this._idmap.delete(meta.id);
    }
    this._map.delete(schema);
    return this;
  }
  get(schema) {
    const p = schema._zod.parent;
    if (p) {
      const pm = { ...this.get(p) ?? {} };
      delete pm.id;
      const f = { ...pm, ...this._map.get(schema) };
      return Object.keys(f).length ? f : undefined;
    }
    return this._map.get(schema);
  }
  has(schema) {
    return this._map.has(schema);
  }
}
function registry() {
  return new $ZodRegistry;
}
(_a2 = globalThis).__zod_globalRegistry ?? (_a2.__zod_globalRegistry = registry());
var globalRegistry = globalThis.__zod_globalRegistry;
// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/api.js
function snapshotChecks(def) {
  if (def.checks)
    def.checks = [...def.checks];
  return def;
}
function _string(Class, params) {
  return new Class(snapshotChecks({ type: "string", ...normalizeParams(params) }));
}
function _email(Class, params) {
  return new Class({
    type: "string",
    format: "email",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _guid(Class, params) {
  return new Class({
    type: "string",
    format: "guid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuid(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _uuidv4(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v4",
    ...normalizeParams(params)
  });
}
function _uuidv6(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v6",
    ...normalizeParams(params)
  });
}
function _uuidv7(Class, params) {
  return new Class({
    type: "string",
    format: "uuid",
    check: "string_format",
    abort: false,
    version: "v7",
    ...normalizeParams(params)
  });
}
function _url(Class, params) {
  return new Class({
    type: "string",
    format: "url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _emoji2(Class, params) {
  return new Class({
    type: "string",
    format: "emoji",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _nanoid(Class, params) {
  return new Class({
    type: "string",
    format: "nanoid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid(Class, params) {
  return new Class({
    type: "string",
    format: "cuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cuid2(Class, params) {
  return new Class({
    type: "string",
    format: "cuid2",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ulid(Class, params) {
  return new Class({
    type: "string",
    format: "ulid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _xid(Class, params) {
  return new Class({
    type: "string",
    format: "xid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ksuid(Class, params) {
  return new Class({
    type: "string",
    format: "ksuid",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv4(Class, params) {
  return new Class({
    type: "string",
    format: "ipv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _ipv6(Class, params) {
  return new Class({
    type: "string",
    format: "ipv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv4(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv4",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _cidrv6(Class, params) {
  return new Class({
    type: "string",
    format: "cidrv6",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64(Class, params) {
  return new Class({
    type: "string",
    format: "base64",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _base64url(Class, params) {
  return new Class({
    type: "string",
    format: "base64url",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _e164(Class, params) {
  return new Class({
    type: "string",
    format: "e164",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _jwt(Class, params) {
  return new Class({
    type: "string",
    format: "jwt",
    check: "string_format",
    abort: false,
    ...normalizeParams(params)
  });
}
function _isoDateTime(Class, params) {
  return new Class({
    type: "string",
    format: "datetime",
    check: "string_format",
    offset: false,
    local: false,
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDate(Class, params) {
  return new Class({
    type: "string",
    format: "date",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _isoTime(Class, params) {
  return new Class({
    type: "string",
    format: "time",
    check: "string_format",
    precision: null,
    ...normalizeParams(params)
  });
}
function _isoDuration(Class, params) {
  return new Class({
    type: "string",
    format: "duration",
    check: "string_format",
    ...normalizeParams(params)
  });
}
function _number(Class, params) {
  return new Class(snapshotChecks({ type: "number", checks: [], ...normalizeParams(params) }));
}
function _int(Class, params) {
  return new Class({
    type: "number",
    check: "number_format",
    abort: false,
    format: "safeint",
    ...normalizeParams(params)
  });
}
function _boolean(Class, params) {
  return new Class({
    type: "boolean",
    ...normalizeParams(params)
  });
}
function _null2(Class, params) {
  return new Class({
    type: "null",
    ...normalizeParams(params)
  });
}
function _unknown(Class) {
  return new Class({
    type: "unknown"
  });
}
function _never(Class, params) {
  return new Class({
    type: "never",
    ...normalizeParams(params)
  });
}
function _lt(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _lte(value, params) {
  return new $ZodCheckLessThan({
    check: "less_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _gt(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: false
  });
}
function _gte(value, params) {
  return new $ZodCheckGreaterThan({
    check: "greater_than",
    ...normalizeParams(params),
    value,
    inclusive: true
  });
}
function _multipleOf(value, params) {
  return new $ZodCheckMultipleOf({
    check: "multiple_of",
    ...normalizeParams(params),
    value
  });
}
function _maxLength(maximum, params) {
  const ch = new $ZodCheckMaxLength({
    check: "max_length",
    ...normalizeParams(params),
    maximum
  });
  return ch;
}
function _minLength(minimum, params) {
  return new $ZodCheckMinLength({
    check: "min_length",
    ...normalizeParams(params),
    minimum
  });
}
function _length(length, params) {
  return new $ZodCheckLengthEquals({
    check: "length_equals",
    ...normalizeParams(params),
    length
  });
}
function _regex(pattern, params) {
  return new $ZodCheckRegex({
    check: "string_format",
    format: "regex",
    ...normalizeParams(params),
    pattern
  });
}
function _lowercase(params) {
  return new $ZodCheckLowerCase({
    check: "string_format",
    format: "lowercase",
    ...normalizeParams(params)
  });
}
function _uppercase(params) {
  return new $ZodCheckUpperCase({
    check: "string_format",
    format: "uppercase",
    ...normalizeParams(params)
  });
}
function _includes(includes, params) {
  return new $ZodCheckIncludes({
    check: "string_format",
    format: "includes",
    ...normalizeParams(params),
    includes
  });
}
function _startsWith(prefix, params) {
  return new $ZodCheckStartsWith({
    check: "string_format",
    format: "starts_with",
    ...normalizeParams(params),
    prefix
  });
}
function _endsWith(suffix, params) {
  return new $ZodCheckEndsWith({
    check: "string_format",
    format: "ends_with",
    ...normalizeParams(params),
    suffix
  });
}
function _overwrite(tx) {
  return new $ZodCheckOverwrite({
    check: "overwrite",
    tx
  });
}
function _normalize(form) {
  return _overwrite((input) => input.normalize(form));
}
function _trim() {
  return _overwrite((input) => input.trim());
}
function _toLowerCase() {
  return _overwrite((input) => input.toLowerCase());
}
function _toUpperCase() {
  return _overwrite((input) => input.toUpperCase());
}
function _slugify() {
  return _overwrite((input) => slugify(input));
}
function _array(Class, element, params) {
  return new Class({
    type: "array",
    element,
    ...normalizeParams(params)
  });
}
function _refine(Class, fn, _params) {
  const schema = new Class({
    type: "custom",
    check: "custom",
    fn,
    ...normalizeParams(_params)
  });
  return schema;
}
function _superRefine(fn, params) {
  const ch = _check((payload) => {
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, ch._zod.def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        if (!("input" in _issue))
          _issue.input = payload.value;
        _issue.inst ?? (_issue.inst = ch);
        _issue.continue ?? (_issue.continue = !ch._zod.def.abort);
        payload.issues.push(issue(_issue));
      }
    };
    return fn(payload.value, payload);
  }, params);
  return ch;
}
function _check(fn, params) {
  const ch = new $ZodCheck({
    check: "custom",
    ...normalizeParams(params)
  });
  ch._zod.check = fn;
  return ch;
}
// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/to-json-schema.js
function assignProps(target, ...sources) {
  for (const source of sources) {
    for (const key of Reflect.ownKeys(source)) {
      if (Object.prototype.propertyIsEnumerable.call(source, key)) {
        assignProp(target, key, source[key]);
      }
    }
  }
  return target;
}
function initializeContext(params) {
  let target = params?.target ?? "draft-2020-12";
  if (target === "draft-4")
    target = "draft-04";
  if (target === "draft-7")
    target = "draft-07";
  return {
    processors: params.processors ?? {},
    metadataRegistry: params?.metadata ?? globalRegistry,
    target,
    unrepresentable: params?.unrepresentable ?? "throw",
    override: params?.override ?? (() => {}),
    io: params?.io ?? "output",
    counter: 0,
    seen: new Map,
    sharedDefsExtractedFor: undefined,
    sharedEmitDoneFor: undefined,
    cycles: params?.cycles ?? "ref",
    reused: params?.reused ?? "inline",
    intersections: [],
    deferred: [],
    external: params?.external ?? undefined
  };
}
function handleUnrepresentable(schema, ctx, json, params, message) {
  const result = typeof ctx.unrepresentable === "function" ? ctx.unrepresentable({ zodSchema: schema, path: params.path, message }) : ctx.unrepresentable;
  if (result === "any")
    return false;
  if (result === undefined || result === "throw")
    throw new Error(message);
  Object.assign(json, result);
  return true;
}
function processSchema(schema, ctx, _params = { path: [], schemaPath: [] }) {
  var _a;
  const def = schema._zod.def;
  const seen = ctx.seen.get(schema);
  if (seen) {
    seen.count++;
    const isCycle = _params.schemaPath.includes(schema);
    if (isCycle) {
      seen.cycle = _params.path;
    }
    return seen.schema;
  }
  const result = { schema: {}, count: 1, cycle: undefined, path: _params.path };
  ctx.seen.set(schema, result);
  ctx.sharedDefsExtractedFor = undefined;
  ctx.sharedEmitDoneFor = undefined;
  const overrideSchema = schema._zod.toJSONSchema?.();
  if (overrideSchema) {
    result.schema = overrideSchema;
  } else {
    const params = {
      ..._params,
      schemaPath: [..._params.schemaPath, schema],
      path: _params.path
    };
    if (schema._zod.processJSONSchema) {
      schema._zod.processJSONSchema(ctx, result.schema, params);
    } else {
      const _json = result.schema;
      const processor = ctx.processors[def.type];
      if (!processor) {
        throw new Error(`[toJSONSchema]: Non-representable type encountered: ${def.type}`);
      }
      processor(schema, ctx, _json, params);
    }
    const parent = schema._zod.parent;
    if (parent) {
      if (!result.ref)
        result.ref = parent;
      processSchema(parent, ctx, params);
      ctx.seen.get(parent).isParent = true;
    }
  }
  const meta = ctx.metadataRegistry.get(schema);
  if (meta)
    assignProps(result.schema, meta);
  if (ctx.io === "input" && isTransforming(schema)) {
    delete result.schema.examples;
    delete result.schema.default;
  }
  if (ctx.io === "input" && "_prefault" in result.schema)
    (_a = result.schema).default ?? (_a.default = result.schema._prefault);
  delete result.schema._prefault;
  const _result = ctx.seen.get(schema);
  return _result.schema;
}
function encodeJSONPointerSegment(segment) {
  return segment.replace(/~/g, "~0").replace(/\//g, "~1");
}
function extractDefs(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  if (ctx.external && ctx.sharedDefsExtractedFor === ctx.external)
    return;
  const idToSchema = new Map;
  for (const entry of ctx.seen.entries()) {
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      const existing = idToSchema.get(id);
      if (existing && existing !== entry[0]) {
        throw new Error(`Duplicate schema id "${id}" detected during JSON Schema conversion. Two different schemas cannot share the same id when converted together.`);
      }
      idToSchema.set(id, entry[0]);
    }
  }
  const makeURI = (entry) => {
    const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
    if (ctx.external) {
      const externalId = ctx.external.registry.get(entry[0])?.id;
      const uriGenerator = ctx.external.uri ?? ((id) => id);
      if (externalId) {
        return { ref: uriGenerator(externalId) };
      }
      const id = entry[1].defId ?? entry[1].schema.id ?? `schema${ctx.counter++}`;
      entry[1].defId = id;
      return { defId: id, ref: `${uriGenerator("__shared")}#/${defsSegment}/${encodeJSONPointerSegment(id)}` };
    }
    const uriPrefix = `#`;
    const defUriPrefix = `${uriPrefix}/${defsSegment}/`;
    if (entry[1] === root && !entry[1].schema.id) {
      return { ref: uriPrefix };
    }
    const defId = entry[1].schema.id ?? `__schema${ctx.counter++}`;
    return { defId, ref: defUriPrefix + encodeJSONPointerSegment(defId) };
  };
  const extractToDef = (entry) => {
    if (entry[1].schema.$ref) {
      return;
    }
    const seen = entry[1];
    const { ref, defId } = makeURI(entry);
    seen.def = { ...seen.schema };
    if (defId)
      seen.defId = defId;
    const schema = seen.schema;
    for (const key in schema) {
      delete schema[key];
    }
    schema.$ref = ref;
  };
  if (ctx.cycles === "throw") {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.cycle) {
        throw new Error("Cycle detected: " + `#/${seen.cycle?.join("/")}/<root>` + '\n\nSet the `cycles` parameter to `"ref"` to resolve cyclical schemas with defs.');
      }
    }
  }
  for (const entry of ctx.seen.entries()) {
    const seen = entry[1];
    if (schema === entry[0]) {
      extractToDef(entry);
      continue;
    }
    if (ctx.external) {
      const ext = ctx.external.registry.get(entry[0])?.id;
      if (schema !== entry[0] && ext) {
        extractToDef(entry);
        continue;
      }
    }
    const id = ctx.metadataRegistry.get(entry[0])?.id;
    if (id) {
      extractToDef(entry);
      continue;
    }
    if (seen.cycle) {
      extractToDef(entry);
      continue;
    }
    if (seen.count > 1) {
      if (ctx.reused === "ref") {
        extractToDef(entry);
      }
    }
  }
  if (ctx.external)
    ctx.sharedDefsExtractedFor = ctx.external;
}
function compactTypeUnion(schema) {
  const options = schema.anyOf;
  if (!Array.isArray(options) || options.length === 0 || schema.type !== undefined)
    return;
  const types = [];
  for (const option of options) {
    if (!option || typeof option !== "object")
      return;
    compactTypeUnion(option);
    const keys = Object.keys(option);
    if (keys.length !== 1 || keys[0] !== "type")
      return;
    const type = option.type;
    for (const member of Array.isArray(type) ? type : [type]) {
      if (typeof member !== "string")
        return;
      if (!types.includes(member))
        types.push(member);
    }
  }
  delete schema.anyOf;
  schema.type = types.length === 1 ? types[0] : types;
}
var FOLDABLE_KEYS = new Set(["type", "properties", "required", "additionalProperties"]);
var UNION_KEYS = ["oneOf", "anyOf"];
function undeclaredConstraint(member) {
  const extra = member.additionalProperties;
  if (extra === undefined || extra === false || typeof extra !== "object" || extra === null)
    return null;
  return Object.keys(extra).length ? extra : null;
}
function foldObjects(members) {
  const objects = [];
  for (const member of members) {
    if (typeof member !== "object" || member.type !== "object")
      return null;
    for (const key in member) {
      if (!FOLDABLE_KEYS.has(key))
        return null;
    }
    objects.push(member);
  }
  const properties = {};
  const required = new Set;
  for (const object of objects) {
    for (const key in object.properties) {
      if (Object.prototype.hasOwnProperty.call(properties, key))
        continue;
      const parts = [];
      for (const other of objects) {
        const part = other.properties?.[key] ?? undeclaredConstraint(other);
        if (part === null || part === undefined)
          continue;
        if (!parts.some((seen) => JSON.stringify(seen) === JSON.stringify(part)))
          parts.push(part);
      }
      const merged = parts.length === 1 ? parts[0] : foldObjects(parts) ?? { allOf: parts };
      assignProp(properties, key, merged);
    }
    for (const key of object.required ?? [])
      required.add(key);
  }
  const folded = { type: "object", properties };
  if (required.size)
    folded.required = [...required];
  if (objects.every((object) => object.additionalProperties === false)) {
    folded.additionalProperties = false;
  } else {
    const constraints = [];
    for (const object of objects) {
      const constraint = undeclaredConstraint(object);
      if (constraint && !constraints.some((seen) => JSON.stringify(seen) === JSON.stringify(constraint)))
        constraints.push(constraint);
    }
    if (constraints.length === 1)
      folded.additionalProperties = constraints[0];
    else if (constraints.length > 1)
      folded.additionalProperties = { allOf: constraints };
  }
  return folded;
}
function foldIntersection(json) {
  const allOf = json.allOf;
  if (!Array.isArray(allOf) || allOf.length < 2)
    return;
  for (const key of FOLDABLE_KEYS)
    if (key in json)
      return;
  const unions = allOf.filter((m) => UNION_KEYS.some((k) => Array.isArray(m[k])));
  let folded = null;
  if (!unions.length) {
    folded = foldObjects(allOf);
  } else {
    const union = unions[0];
    const keyword = UNION_KEYS.find((k) => Array.isArray(union[k]));
    if (Object.keys(union).length !== 1)
      return;
    const rest = allOf.filter((m) => m !== union);
    const branches = union[keyword].map((branch) => foldObjects([...rest, branch]));
    if (branches.some((b) => !b))
      return;
    folded = { [keyword]: branches };
  }
  if (!folded)
    return;
  delete json.allOf;
  assignProps(json, folded);
}
function finalize(ctx, schema) {
  const root = ctx.seen.get(schema);
  if (!root)
    throw new Error("Unprocessed schema. This is a bug in Zod.");
  const flattenRef = (zodSchema) => {
    const seen = ctx.seen.get(zodSchema);
    if (seen.ref === null)
      return;
    const schema = seen.def ?? seen.schema;
    const _cached = { ...schema };
    const ref = seen.ref;
    seen.ref = null;
    if (ref) {
      flattenRef(ref);
      const refSeen = ctx.seen.get(ref);
      const refSchema = refSeen.schema;
      if (refSchema.$ref && (ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0")) {
        schema.allOf = schema.allOf ?? [];
        schema.allOf.push(refSchema);
      } else {
        assignProps(schema, refSchema);
      }
      assignProps(schema, _cached);
      const isParentRef = zodSchema._zod.parent === ref;
      if (isParentRef) {
        for (const key in schema) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (!(key in _cached)) {
            delete schema[key];
          }
        }
      }
      if (refSchema.$ref && refSeen.def) {
        for (const key in schema) {
          if (key === "$ref" || key === "allOf")
            continue;
          if (key in refSeen.def && JSON.stringify(schema[key]) === JSON.stringify(refSeen.def[key])) {
            delete schema[key];
          }
        }
      }
    }
    const parent = zodSchema._zod.parent;
    if (parent && parent !== ref) {
      flattenRef(parent);
      const parentSeen = ctx.seen.get(parent);
      if (parentSeen?.schema.$ref) {
        schema.$ref = parentSeen.schema.$ref;
        if (parentSeen.def) {
          for (const key in schema) {
            if (key === "$ref" || key === "allOf")
              continue;
            if (key in parentSeen.def && JSON.stringify(schema[key]) === JSON.stringify(parentSeen.def[key])) {
              delete schema[key];
            }
          }
        }
      }
    }
    ctx.override({
      zodSchema,
      jsonSchema: schema,
      path: seen.path ?? []
    });
  };
  if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
    for (const entry of [...ctx.seen.entries()].reverse()) {
      flattenRef(entry[0]);
    }
    if (ctx.target !== "openapi-3.0") {
      for (const entry of ctx.seen.entries()) {
        compactTypeUnion(entry[1].def ?? entry[1].schema);
      }
    }
    for (const rewrite of ctx.deferred)
      rewrite();
    if (ctx.intersections.length) {
      const carriers = new Map;
      for (const seen of ctx.seen.values()) {
        for (const json of [seen.schema, seen.def]) {
          const allOf = json?.allOf;
          if (!Array.isArray(allOf))
            continue;
          const existing = carriers.get(allOf);
          if (existing)
            existing.push(json);
          else
            carriers.set(allOf, [json]);
        }
      }
      for (const allOf of ctx.intersections) {
        for (const json of carriers.get(allOf) ?? [])
          foldIntersection(json);
      }
    }
  }
  const result = {};
  if (ctx.target === "draft-2020-12") {
    result.$schema = "https://json-schema.org/draft/2020-12/schema";
  } else if (ctx.target === "draft-07") {
    result.$schema = "http://json-schema.org/draft-07/schema#";
  } else if (ctx.target === "draft-04") {
    result.$schema = "http://json-schema.org/draft-04/schema#";
  } else if (ctx.target === "openapi-3.0") {}
  if (ctx.external?.uri) {
    const id = ctx.external.registry.get(schema)?.id;
    if (!id)
      throw new Error("Schema is missing an `id` property");
    result.$id = ctx.external.uri(id);
  }
  assignProps(result, root.defId ? root.schema : root.def ?? root.schema);
  const rootMetaId = ctx.metadataRegistry.get(schema)?.id;
  if (rootMetaId !== undefined && result.id === rootMetaId)
    delete result.id;
  const defs = ctx.external?.defs ?? {};
  if (!ctx.external || ctx.sharedEmitDoneFor !== ctx.external) {
    for (const entry of ctx.seen.entries()) {
      const seen = entry[1];
      if (seen.def && seen.defId) {
        if (seen.def.id === seen.defId)
          delete seen.def.id;
        assignProp(defs, seen.defId, seen.def);
      }
    }
  }
  if (ctx.external)
    ctx.sharedEmitDoneFor = ctx.external;
  if (ctx.external) {} else {
    if (Object.keys(defs).length > 0) {
      if (ctx.target === "draft-2020-12") {
        result.$defs = defs;
      } else {
        result.definitions = defs;
      }
    }
  }
  try {
    const finalized = JSON.parse(JSON.stringify(result));
    Object.defineProperty(finalized, "~standard", {
      value: {
        ...schema["~standard"],
        jsonSchema: {
          input: createStandardJSONSchemaMethod(schema, "input", ctx.processors),
          output: createStandardJSONSchemaMethod(schema, "output", ctx.processors)
        }
      },
      enumerable: false,
      writable: false
    });
    return finalized;
  } catch (_err) {
    throw new Error("Error converting schema to JSON.");
  }
}
function isTransforming(_schema, _ctx) {
  const ctx = _ctx ?? { seen: new Set };
  if (ctx.seen.has(_schema))
    return false;
  ctx.seen.add(_schema);
  const def = _schema._zod.def;
  if (def.type === "transform")
    return true;
  if (def.type === "array")
    return isTransforming(def.element, ctx);
  if (def.type === "set")
    return isTransforming(def.valueType, ctx);
  if (def.type === "lazy")
    return isTransforming(def.getter(), ctx);
  if (def.type === "promise" || def.type === "optional" || def.type === "nonoptional" || def.type === "nullable" || def.type === "readonly" || def.type === "default" || def.type === "prefault" || def.type === "catch") {
    return isTransforming(def.innerType, ctx);
  }
  if (def.type === "intersection") {
    return isTransforming(def.left, ctx) || isTransforming(def.right, ctx);
  }
  if (def.type === "record" || def.type === "map") {
    return isTransforming(def.keyType, ctx) || isTransforming(def.valueType, ctx);
  }
  if (def.type === "pipe") {
    if (_schema._zod.traits.has("$ZodCodec"))
      return true;
    return isTransforming(def.in, ctx) || isTransforming(def.out, ctx);
  }
  if (def.type === "object") {
    for (const key in def.shape) {
      if (isTransforming(def.shape[key], ctx))
        return true;
    }
    return false;
  }
  if (def.type === "union") {
    for (const option of def.options) {
      if (isTransforming(option, ctx))
        return true;
    }
    return false;
  }
  if (def.type === "tuple") {
    for (const item of def.items) {
      if (isTransforming(item, ctx))
        return true;
    }
    if (def.rest && isTransforming(def.rest, ctx))
      return true;
    return false;
  }
  return false;
}
var createToJSONSchemaMethod = (schema, processors = {}) => (params) => {
  const ctx = initializeContext({ ...params, processors });
  processSchema(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
var createStandardJSONSchemaMethod = (schema, io, processors = {}) => (params) => {
  const { libraryOptions, target } = params ?? {};
  const ctx = initializeContext({ ...libraryOptions ?? {}, target, io, processors });
  processSchema(schema, ctx);
  extractDefs(ctx, schema);
  return finalize(ctx, schema);
};
// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/core/json-schema-processors.js
var narrowMin = (agg, key, value) => {
  if (agg[key] === undefined || value > agg[key])
    agg[key] = value;
};
var narrowMax = (agg, key, value) => {
  if (agg[key] === undefined || value < agg[key])
    agg[key] = value;
};
var narrowBoth = (agg, value) => {
  narrowMin(agg, "minimum", value);
  narrowMax(agg, "maximum", value);
};
var addDivisor = (agg, value) => {
  agg.multipleOf ?? (agg.multipleOf = []);
  if (!agg.multipleOf.includes(value))
    agg.multipleOf.push(value);
};
var addPattern = (agg, pattern) => {
  agg.patterns ?? (agg.patterns = new Set);
  agg.patterns.add(pattern);
};
var intersectMime = (agg, mime) => {
  agg.mime = agg.mime ? agg.mime.filter((m) => mime.includes(m)) : [...mime];
};
var setFormat = (agg, format) => {
  agg.format = format;
  if (format.includes("int"))
    agg.isInt = true;
};
var minContributor = (agg, def) => narrowMin(agg, "minimum", def.minimum);
var maxContributor = (agg, def) => narrowMax(agg, "maximum", def.maximum);
var formatContributor = (ranges) => (agg, def) => {
  setFormat(agg, def.format);
  const [minimum, maximum] = ranges[def.format];
  narrowMin(agg, "minimum", minimum);
  narrowMax(agg, "maximum", maximum);
};
var contributors = {
  greater_than: (agg, def) => narrowMin(agg, def.inclusive ? "minimum" : "exclusiveMinimum", def.value),
  less_than: (agg, def) => narrowMax(agg, def.inclusive ? "maximum" : "exclusiveMaximum", def.value),
  multiple_of: (agg, def) => addDivisor(agg, def.value),
  number_format: formatContributor(NUMBER_FORMAT_RANGES),
  bigint_format: formatContributor(BIGINT_FORMAT_RANGES),
  min_length: minContributor,
  max_length: maxContributor,
  length_equals: (agg, def) => narrowBoth(agg, def.length),
  min_size: minContributor,
  max_size: maxContributor,
  size_equals: (agg, def) => narrowBoth(agg, def.size),
  string_format: (agg, def) => {
    setFormat(agg, def.format);
    if (def.pattern)
      addPattern(agg, def.pattern);
    if (def.format === "base64" || def.format === "base64url")
      agg.contentEncoding = def.format;
    if (def.local || def.precision === -1)
      agg.laxFormat = true;
  },
  mime_type: (agg, def) => intersectMime(agg, def.mime)
};
function aggregateChecks(schema) {
  const agg = {};
  const def = schema._zod.def;
  const list = schema._zod.traits.has("$ZodCheck") ? [schema, ...def.checks ?? []] : def.checks ?? [];
  for (const ch of list)
    contributors[ch._zod.def.check]?.(agg, ch._zod.def);
  const bag = schema._zod.bag;
  if (bag.minimum !== undefined)
    narrowMin(agg, "minimum", bag.minimum);
  if (bag.exclusiveMinimum !== undefined)
    narrowMin(agg, "exclusiveMinimum", bag.exclusiveMinimum);
  if (bag.maximum !== undefined)
    narrowMax(agg, "maximum", bag.maximum);
  if (bag.exclusiveMaximum !== undefined)
    narrowMax(agg, "exclusiveMaximum", bag.exclusiveMaximum);
  if (bag.multipleOf !== undefined)
    addDivisor(agg, bag.multipleOf);
  if (bag.format !== undefined) {
    agg.format ?? (agg.format = bag.format);
    if (bag.format.includes("int"))
      agg.isInt = true;
  }
  if (bag.mime)
    intersectMime(agg, bag.mime);
  for (const pattern of bag.patterns ?? [])
    addPattern(agg, pattern);
  return agg;
}
var formatMap = {
  guid: "uuid",
  url: "uri",
  datetime: "date-time",
  json_string: "json-string",
  regex: ""
};
var exactPatterns = new Map([
  [base64Charset, base64],
  [base64urlCharset, base64url]
]);
var exactPattern = (p) => exactPatterns.get(p) ?? p;
var stringProcessor = (schema, ctx, _json, _params) => {
  const json = _json;
  json.type = "string";
  const { minimum, maximum, format, patterns, contentEncoding, laxFormat } = aggregateChecks(schema);
  if (typeof minimum === "number")
    json.minLength = minimum;
  if (typeof maximum === "number")
    json.maxLength = maximum;
  if (format) {
    json.format = formatMap[format] ?? format;
    if (json.format === "")
      delete json.format;
    if (format === "time" || laxFormat) {
      delete json.format;
    }
  }
  if (contentEncoding)
    json.contentEncoding = contentEncoding;
  if (patterns && patterns.size > 0) {
    const patternList = [...patterns].map(exactPattern);
    if (patternList.length === 1)
      json.pattern = patternList[0].source;
    else if (patternList.length > 1) {
      json.allOf = [
        ...patternList.map((regex) => ({
          ...ctx.target === "draft-07" || ctx.target === "draft-04" || ctx.target === "openapi-3.0" ? { type: "string" } : {},
          pattern: regex.source
        }))
      ];
    }
  }
};
var numberProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const { minimum, maximum, multipleOf, exclusiveMaximum, exclusiveMinimum, isInt } = aggregateChecks(schema);
  json.type = isInt ? "integer" : "number";
  const exMin = typeof exclusiveMinimum === "number" && exclusiveMinimum >= (minimum ?? Number.NEGATIVE_INFINITY);
  const exMax = typeof exclusiveMaximum === "number" && exclusiveMaximum <= (maximum ?? Number.POSITIVE_INFINITY);
  const legacy = ctx.target === "draft-04" || ctx.target === "openapi-3.0";
  if (exMin) {
    if (legacy) {
      json.minimum = exclusiveMinimum;
      json.exclusiveMinimum = true;
    } else {
      json.exclusiveMinimum = exclusiveMinimum;
    }
  } else if (typeof minimum === "number") {
    json.minimum = minimum;
  }
  if (exMax) {
    if (legacy) {
      json.maximum = exclusiveMaximum;
      json.exclusiveMaximum = true;
    } else {
      json.exclusiveMaximum = exclusiveMaximum;
    }
  } else if (typeof maximum === "number") {
    json.maximum = maximum;
  }
  if (multipleOf) {
    const divisors = new Set;
    for (const divisor of multipleOf) {
      if (Number.isFinite(divisor) && divisor !== 0)
        divisors.add(Math.abs(divisor));
      else
        handleUnrepresentable(schema, ctx, json, params, `A multipleOf divisor of ${divisor} cannot be represented in JSON Schema`);
    }
    const [first, ...rest] = divisors;
    if (first !== undefined)
      json.multipleOf = first;
    if (rest.length)
      json.allOf = [...json.allOf ?? [], ...rest.map((m) => ({ multipleOf: m }))];
  }
};
var booleanProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var bigintProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "BigInt cannot be represented in JSON Schema");
};
var symbolProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Symbols cannot be represented in JSON Schema");
};
var nullProcessor = (_schema, ctx, json, _params) => {
  if (ctx.target === "openapi-3.0") {
    json.type = "string";
    json.nullable = true;
    json.enum = [null];
  } else {
    json.type = "null";
  }
};
var undefinedProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Undefined cannot be represented in JSON Schema");
};
var voidProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Void cannot be represented in JSON Schema");
};
var neverProcessor = (_schema, _ctx, json, _params) => {
  json.not = {};
};
var anyProcessor = (_schema, _ctx, _json, _params) => {};
var unknownProcessor = (_schema, _ctx, _json, _params) => {};
var dateProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Date cannot be represented in JSON Schema");
};
var enumProcessor = (schema, _ctx, json, _params) => {
  const def = schema._zod.def;
  const values = getEnumValues(def.entries);
  if (values.length === 0) {
    json.not = {};
    return;
  }
  if (values.every((v) => typeof v === "number"))
    json.type = "number";
  if (values.every((v) => typeof v === "string"))
    json.type = "string";
  json.enum = values;
};
var literalProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  if (def.values.length === 0) {
    json.not = {};
    return;
  }
  const vals = [];
  for (const val of def.values) {
    if (val === undefined) {
      if (handleUnrepresentable(schema, ctx, json, params, "Literal `undefined` cannot be represented in JSON Schema"))
        return;
    } else if (typeof val === "bigint") {
      if (handleUnrepresentable(schema, ctx, json, params, "BigInt literals cannot be represented in JSON Schema"))
        return;
      vals.push(Number(val));
    } else {
      vals.push(val);
    }
  }
  if (vals.length === 0) {} else if (vals.length === 1) {
    const val = vals[0];
    json.type = val === null ? "null" : typeof val;
    if (ctx.target === "draft-04" || ctx.target === "openapi-3.0") {
      json.enum = [val];
    } else {
      json.const = val;
    }
  } else {
    if (vals.every((v) => typeof v === "number"))
      json.type = "number";
    if (vals.every((v) => typeof v === "string"))
      json.type = "string";
    if (vals.every((v) => typeof v === "boolean"))
      json.type = "boolean";
    if (vals.every((v) => v === null))
      json.type = "null";
    json.enum = vals;
  }
};
var nanProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "NaN cannot be represented in JSON Schema");
};
var templateLiteralProcessor = (schema, _ctx, json, _params) => {
  const _json = json;
  const pattern = schema._zod.pattern;
  if (!pattern)
    throw new Error("Pattern not found in template literal");
  _json.type = "string";
  _json.pattern = pattern.source;
};
var fileProcessor = (schema, _ctx, json, _params) => {
  const _json = json;
  _json.type = "string";
  _json.format = "binary";
  _json.contentEncoding = "binary";
  const { minimum, maximum, mime } = aggregateChecks(schema);
  if (minimum !== undefined)
    _json.minLength = minimum;
  if (maximum !== undefined)
    _json.maxLength = maximum;
  if (!mime)
    return;
  if (mime.length === 0)
    _json.not = {};
  else if (mime.length === 1)
    _json.contentMediaType = mime[0];
  else
    _json.anyOf = mime.map((m) => ({ contentMediaType: m }));
};
var successProcessor = (_schema, _ctx, json, _params) => {
  json.type = "boolean";
};
var customProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Custom types cannot be represented in JSON Schema");
};
var functionProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Function types cannot be represented in JSON Schema");
};
var transformProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Transforms cannot be represented in JSON Schema");
};
var mapProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Map cannot be represented in JSON Schema");
};
var setProcessor = (schema, ctx, json, params) => {
  handleUnrepresentable(schema, ctx, json, params, "Set cannot be represented in JSON Schema");
};
var arrayProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const { minimum, maximum } = aggregateChecks(schema);
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
  json.type = "array";
  json.items = processSchema(def.element, ctx, {
    ...params,
    path: [...params.path, "items"]
  });
};
function inputOptin(schema) {
  const def = schema._zod.def;
  if (def.type === "pipe" && def.in._zod.traits.has("$ZodTransform")) {
    return inputOptin(def.out);
  }
  if (def.type === "catch") {
    return inputOptin(def.innerType);
  }
  return schema._zod.optin;
}
var objectProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  const shape = def.shape;
  const symbolKeys = Object.getOwnPropertySymbols(shape);
  if (symbolKeys.length && handleUnrepresentable(schema, ctx, json, params, "Symbol keys cannot be represented in JSON Schema")) {
    return;
  }
  json.type = "object";
  json.properties = {};
  for (const key in shape) {
    assignProp(json.properties, key, processSchema(shape[key], ctx, {
      ...params,
      path: [...params.path, "properties", key]
    }));
  }
  const requiredKeys = [];
  for (const key of Object.keys(shape)) {
    const field = def.shape[key];
    if (ctx.io === "input" ? inputOptin(field) === undefined : field._zod.optout === undefined) {
      requiredKeys.push(key);
    }
  }
  if (requiredKeys.length > 0) {
    json.required = requiredKeys;
  }
  if (def.catchall?._zod.def.type === "never") {
    json.additionalProperties = false;
  } else if (!def.catchall) {
    if (ctx.io === "output")
      json.additionalProperties = false;
  } else if (def.catchall) {
    json.additionalProperties = processSchema(def.catchall, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
};
var unionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const isExclusive = def.inclusive === false;
  const options = def.options.map((x, i) => processSchema(x, ctx, {
    ...params,
    path: [...params.path, isExclusive ? "oneOf" : "anyOf", i]
  }));
  if (isExclusive) {
    json.oneOf = options;
  } else {
    json.anyOf = options;
  }
};
var intersectionProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const a = processSchema(def.left, ctx, {
    ...params,
    path: [...params.path, "allOf", 0]
  });
  const b = processSchema(def.right, ctx, {
    ...params,
    path: [...params.path, "allOf", 1]
  });
  const isSimpleIntersection = (val) => ("allOf" in val) && Object.keys(val).length === 1;
  const allOf = [
    ...isSimpleIntersection(a) ? a.allOf : [a],
    ...isSimpleIntersection(b) ? b.allOf : [b]
  ];
  json.allOf = allOf;
  ctx.intersections.push(allOf);
};
var tupleProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "array";
  const prefixPath = ctx.target === "draft-2020-12" ? "prefixItems" : "items";
  const restPath = ctx.target === "draft-2020-12" ? "items" : ctx.target === "openapi-3.0" ? "items" : "additionalItems";
  const prefixItems = def.items.map((x, i) => processSchema(x, ctx, {
    ...params,
    path: [...params.path, prefixPath, i]
  }));
  const rest = def.rest ? processSchema(def.rest, ctx, {
    ...params,
    path: [...params.path, restPath, ...ctx.target === "openapi-3.0" ? [def.items.length] : []]
  }) : null;
  let minItems = def.items.length;
  while (minItems > 0) {
    const item = def.items[minItems - 1];
    const optional = ctx.io === "input" ? inputOptin(item) !== undefined : item._zod.optout === "optional";
    if (!optional)
      break;
    minItems--;
  }
  const maxItems = def.items.length;
  const isClosed = !def.rest;
  if (ctx.target === "draft-2020-12") {
    json.prefixItems = prefixItems;
    if (isClosed) {
      json.items = false;
    } else if (rest) {
      json.items = rest;
    }
    if (minItems > 0)
      json.minItems = minItems;
    if (isClosed)
      json.maxItems = maxItems;
  } else if (ctx.target === "openapi-3.0") {
    json.items = {
      anyOf: prefixItems
    };
    if (rest) {
      json.items.anyOf.push(rest);
    }
    if (minItems > 0)
      json.minItems = minItems;
    if (isClosed)
      json.maxItems = maxItems;
  } else {
    json.items = prefixItems;
    if (isClosed) {
      json.additionalItems = false;
    } else if (rest) {
      json.additionalItems = rest;
    }
    if (minItems > 0)
      json.minItems = minItems;
    if (isClosed)
      json.maxItems = maxItems;
  }
  const { minimum, maximum } = aggregateChecks(schema);
  if (typeof minimum === "number")
    json.minItems = minimum;
  if (typeof maximum === "number")
    json.maxItems = maximum;
};
function stringifyKeyNames(bySchema, json, visited) {
  if (json.$ref) {
    if (visited.has(json))
      return json;
    visited.add(json);
    const def = bySchema.get(json)?.def;
    if (!def)
      return json;
    const inlined = stringifyKeyNames(bySchema, def, visited);
    return inlined === def ? json : inlined;
  }
  for (const keyword of ["anyOf", "oneOf"]) {
    const branches = json[keyword];
    if (!Array.isArray(branches))
      continue;
    const mapped = branches.map((branch) => stringifyKeyNames(bySchema, branch, visited));
    if (mapped.some((branch, i) => branch !== branches[i]))
      json = { ...json, [keyword]: mapped };
  }
  const types = Array.isArray(json.type) ? json.type : [json.type];
  const numericType = !types.includes("string") && types.some((t) => t === "number" || t === "integer");
  const values = json.enum ?? (json.const !== undefined ? [json.const] : undefined);
  if (!numericType && !values?.some((v) => typeof v === "number"))
    return json;
  const { minimum, maximum, exclusiveMinimum, exclusiveMaximum, multipleOf, format, id, ...rest } = json;
  if (rest.enum)
    rest.enum = rest.enum.map((v) => typeof v === "number" ? String(v) : v);
  else if (typeof rest.const === "number")
    rest.const = String(rest.const);
  if (!numericType)
    return rest;
  rest.type = "string";
  if (!values)
    rest.pattern = (types.includes("number") ? number : integer).source;
  return rest;
}
var pendingRecords = new WeakMap;
function rewriteKeyNames(ctx) {
  const bySchema = new Map;
  for (const entry of ctx.seen.values()) {
    if (entry.def && !bySchema.has(entry.schema))
      bySchema.set(entry.schema, entry);
  }
  const rewrites = new Map;
  for (const record of pendingRecords.get(ctx) ?? []) {
    const seen = ctx.seen.get(record);
    const names = (seen?.def ?? seen?.schema)?.propertyNames;
    if (!names || names === true || rewrites.has(names))
      continue;
    const rewritten = stringifyKeyNames(bySchema, names, new Set);
    if (rewritten !== names)
      rewrites.set(names, rewritten);
  }
  if (!rewrites.size)
    return;
  for (const entry of ctx.seen.values()) {
    for (const carrier of [entry.schema, entry.def]) {
      const rewritten = carrier && rewrites.get(carrier.propertyNames);
      if (rewritten)
        carrier.propertyNames = rewritten;
    }
  }
}
var recordProcessor = (schema, ctx, _json, params) => {
  const json = _json;
  const def = schema._zod.def;
  json.type = "object";
  const keyType = def.keyType;
  const patterns = aggregateChecks(keyType).patterns;
  if (def.mode === "loose" && patterns && patterns.size > 0) {
    const valueSchema = processSchema(def.valueType, ctx, {
      ...params,
      path: [...params.path, "patternProperties", "*"]
    });
    json.patternProperties = {};
    for (const pattern of patterns) {
      assignProp(json.patternProperties, exactPattern(pattern).source, valueSchema);
    }
  } else {
    if (ctx.target === "draft-07" || ctx.target === "draft-2020-12") {
      json.propertyNames = processSchema(def.keyType, ctx, {
        ...params,
        path: [...params.path, "propertyNames"]
      });
      let pending = pendingRecords.get(ctx);
      if (!pending) {
        pending = [];
        pendingRecords.set(ctx, pending);
        ctx.deferred.push(() => rewriteKeyNames(ctx));
      }
      pending.push(schema);
    }
    json.additionalProperties = processSchema(def.valueType, ctx, {
      ...params,
      path: [...params.path, "additionalProperties"]
    });
  }
  const keyValues = keyType._zod.values;
  const omittableOnInput = ctx.io === "input" && inputOptin(def.valueType) !== undefined;
  if (keyValues && !def.partial && !omittableOnInput) {
    const validKeyValues = [...keyValues].filter((v) => typeof v === "string" || typeof v === "number");
    if (validKeyValues.length > 0) {
      json.required = validKeyValues.map(String);
    }
  }
};
var nullableProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  const inner = processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  if (ctx.target === "openapi-3.0") {
    seen.ref = def.innerType;
    json.nullable = true;
  } else {
    json.anyOf = [inner, { type: "null" }];
  }
};
var nonoptionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var UNREPRESENTABLE_DEFAULT = Symbol();
function serializeDefaultValue(value, schema, ctx, json, params) {
  let unrepresentable = false;
  const serialized = JSON.stringify(value, (_, val) => {
    if (typeof val !== "bigint")
      return val;
    unrepresentable = true;
    return null;
  });
  if (!unrepresentable)
    return JSON.parse(serialized);
  handleUnrepresentable(schema, ctx, json, params, "BigInt defaults cannot be represented in JSON Schema");
  return UNREPRESENTABLE_DEFAULT;
}
var defaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
  if (value !== UNREPRESENTABLE_DEFAULT)
    json.default = value;
};
var prefaultProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  if (ctx.io !== "input")
    return;
  const value = serializeDefaultValue(def.defaultValue, schema, ctx, json, params);
  if (value !== UNREPRESENTABLE_DEFAULT)
    json._prefault = value;
};
var catchProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  let catchValue;
  try {
    catchValue = def.catchValue(undefined);
  } catch {
    handleUnrepresentable(schema, ctx, json, params, "Dynamic catch values are not supported in JSON Schema");
    return;
  }
  json.default = catchValue;
};
var pipeProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  const inIsTransform = def.in._zod.traits.has("$ZodTransform");
  const innerType = ctx.io === "input" ? inIsTransform ? def.out : def.in : def.out;
  processSchema(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var readonlyProcessor = (schema, ctx, json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
  json.readOnly = true;
};
var promiseProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var optionalProcessor = (schema, ctx, _json, params) => {
  const def = schema._zod.def;
  processSchema(def.innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = def.innerType;
};
var lazyProcessor = (schema, ctx, _json, params) => {
  const innerType = schema._zod.innerType;
  processSchema(innerType, ctx, params);
  const seen = ctx.seen.get(schema);
  seen.ref = innerType;
};
var allProcessors = {
  string: stringProcessor,
  number: numberProcessor,
  boolean: booleanProcessor,
  bigint: bigintProcessor,
  symbol: symbolProcessor,
  null: nullProcessor,
  undefined: undefinedProcessor,
  void: voidProcessor,
  never: neverProcessor,
  any: anyProcessor,
  unknown: unknownProcessor,
  date: dateProcessor,
  enum: enumProcessor,
  literal: literalProcessor,
  nan: nanProcessor,
  template_literal: templateLiteralProcessor,
  file: fileProcessor,
  success: successProcessor,
  custom: customProcessor,
  function: functionProcessor,
  transform: transformProcessor,
  map: mapProcessor,
  set: setProcessor,
  array: arrayProcessor,
  object: objectProcessor,
  union: unionProcessor,
  intersection: intersectionProcessor,
  tuple: tupleProcessor,
  record: recordProcessor,
  nullable: nullableProcessor,
  nonoptional: nonoptionalProcessor,
  default: defaultProcessor,
  prefault: prefaultProcessor,
  catch: catchProcessor,
  pipe: pipeProcessor,
  readonly: readonlyProcessor,
  promise: promiseProcessor,
  optional: optionalProcessor,
  lazy: lazyProcessor
};
function toJSONSchema(input, params) {
  if ("_idmap" in input) {
    const registry = input;
    const ctx = initializeContext({ ...params, processors: allProcessors });
    const defs = {};
    for (const entry of registry._idmap.entries()) {
      const [_, schema] = entry;
      processSchema(schema, ctx);
    }
    const schemas = {};
    const external = {
      registry,
      uri: params?.uri,
      defs
    };
    ctx.external = external;
    for (const entry of registry._idmap.entries()) {
      const [key, schema] = entry;
      extractDefs(ctx, schema);
      assignProp(schemas, key, finalize(ctx, schema));
    }
    if (Object.keys(defs).length > 0) {
      const defsSegment = ctx.target === "draft-2020-12" ? "$defs" : "definitions";
      schemas.__shared = {
        [defsSegment]: defs
      };
    }
    return { schemas };
  }
  const ctx = initializeContext({ ...params, processors: allProcessors });
  processSchema(input, ctx);
  extractDefs(ctx, input);
  return finalize(ctx, input);
}
// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/classic/errors.js
var _installedErrorProtos = /* @__PURE__ */ new WeakSet([Object.prototype, Error.prototype]);
function _lazyMethod(proto, key, make) {
  Object.defineProperty(proto, key, {
    configurable: true,
    enumerable: false,
    get() {
      const value = make(this);
      Object.defineProperty(this, key, { value, configurable: true, writable: true });
      return value;
    },
    set(value) {
      Object.defineProperty(this, key, { value, configurable: true, writable: true });
    }
  });
}
var initializer2 = (inst, issues) => {
  $ZodError.init(inst, issues);
  inst.name = "ZodError";
  const proto = Object.getPrototypeOf(inst);
  if (_installedErrorProtos.has(proto))
    return;
  _installedErrorProtos.add(proto);
  _lazyMethod(proto, "format", (self) => (mapper) => formatError(self, mapper));
  _lazyMethod(proto, "flatten", (self) => (mapper) => flattenError(self, mapper));
  _lazyMethod(proto, "addIssue", (self) => (issue) => {
    self.issues.push(issue);
    self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
  });
  _lazyMethod(proto, "addIssues", (self) => (issues) => {
    self.issues.push(...issues);
    self.message = JSON.stringify(self.issues, jsonStringifyReplacer, 2);
  });
  Object.defineProperty(proto, "isEmpty", {
    configurable: true,
    enumerable: false,
    get() {
      return this.issues.length === 0;
    }
  });
};
var ZodRealError = /* @__PURE__ */ $constructor("ZodError", initializer2, undefined, {
  Parent: Error
});

// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/classic/parse.js
var parse2 = /* @__PURE__ */ _parse(ZodRealError);
var parseAsync = /* @__PURE__ */ _parseAsync(ZodRealError);
var safeParse = /* @__PURE__ */ _safeParse(ZodRealError);
var safeParseAsync = /* @__PURE__ */ _safeParseAsync(ZodRealError);
var encode = /* @__PURE__ */ _encode(ZodRealError);
var decode = /* @__PURE__ */ _decode(ZodRealError);
var encodeAsync = /* @__PURE__ */ _encodeAsync(ZodRealError);
var decodeAsync = /* @__PURE__ */ _decodeAsync(ZodRealError);
var safeEncode = /* @__PURE__ */ _safeEncode(ZodRealError);
var safeDecode = /* @__PURE__ */ _safeDecode(ZodRealError);
var safeEncodeAsync = /* @__PURE__ */ _safeEncodeAsync(ZodRealError);
var safeDecodeAsync = /* @__PURE__ */ _safeDecodeAsync(ZodRealError);

// ../../node_modules/.bun/zod@4.6.7/node_modules/zod/v4/classic/schemas.js
function _ensureDefaultLocale() {
  if (!globalConfig.localeError)
    config(en_default());
}
function _ensureDefaultMemoizer() {
  if (!globalConfig.memoizer)
    config({ memoizer: memoizer() });
}
var ZodType = /* @__PURE__ */ $constructor("ZodType", (inst, def) => {
  _ensureDefaultLocale();
  $ZodType.init(inst, def);
  inst.def = def;
  inst.type = def.type;
  return inst;
}, {
  check(...chks) {
    const def = this.def;
    return this.clone(mergeDefs(def, {
      checks: [
        ...def.checks ?? [],
        ...chks.map((ch) => typeof ch === "function" ? { _zod: { check: ch, def: { check: "custom" }, onattach: [] } } : ch)
      ]
    }), { parent: true });
  },
  with(...chks) {
    return this.check(...chks);
  },
  clone(def, params) {
    return clone(this, def, params);
  },
  brand() {
    return this;
  },
  register(reg, meta) {
    reg.add(this, meta);
    return this;
  },
  refine(check, params) {
    return this.check(refine(check, params));
  },
  superRefine(refinement, params) {
    return this.check(superRefine(refinement, params));
  },
  overwrite(fn) {
    return this.check(_overwrite(fn));
  },
  optional() {
    return optional(this);
  },
  exactOptional() {
    return exactOptional(this);
  },
  nullable() {
    return nullable(this);
  },
  nullish() {
    return optional(nullable(this));
  },
  nonoptional(params) {
    return nonoptional(this, params);
  },
  array() {
    return array(this);
  },
  or(arg) {
    return union([this, arg]);
  },
  and(arg) {
    return intersection(this, arg);
  },
  transform(tx) {
    return pipe(this, transform(tx));
  },
  default(d) {
    return _default(this, d);
  },
  prefault(d) {
    return prefault(this, d);
  },
  catch(params) {
    return _catch(this, params);
  },
  pipe(target) {
    return pipe(this, target);
  },
  readonly() {
    return readonly(this);
  },
  describe(description) {
    const cl = this.clone();
    globalRegistry.add(cl, { description });
    return cl;
  },
  meta(...args) {
    if (args.length === 0)
      return globalRegistry.get(this);
    const cl = this.clone();
    globalRegistry.add(cl, args[0]);
    return cl;
  },
  isOptional() {
    return this.safeParse(undefined).success;
  },
  isNullable() {
    return this.safeParse(null).success;
  },
  apply(fn, ...args) {
    return args.length === 0 ? fn(this) : fn(this, ...args);
  },
  get "~standard"() {
    return hide(this, "~standard", {
      ...standardProps(this),
      jsonSchema: {
        input: createStandardJSONSchemaMethod(this, "input"),
        output: createStandardJSONSchemaMethod(this, "output")
      }
    });
  },
  set "~standard"(value) {
    own(this, "~standard", value);
  },
  parse: function _parse(data, params) {
    return parse2(this, data, params, { callee: _parse });
  },
  parseAsync: async function _parseAsync(data, params) {
    return await parseAsync(this, data, params, { callee: _parseAsync });
  },
  safeParse(data, params) {
    return safeParse(this, data, params);
  },
  async safeParseAsync(data, params) {
    return safeParseAsync(this, data, params);
  },
  get spa() {
    return this?.safeParseAsync;
  },
  set spa(value) {
    own(this, "spa", value);
  },
  validate(data, params) {
    return validate(this, data, params);
  },
  validateAsync(data, params) {
    return validateAsync(this, data, params);
  },
  encode: function _encode(data, params) {
    return encode(this, data, params, { callee: _encode });
  },
  decode: function _decode(data, params) {
    return decode(this, data, params, { callee: _decode });
  },
  encodeAsync: async function _encodeAsync(data, params) {
    return await encodeAsync(this, data, params, { callee: _encodeAsync });
  },
  decodeAsync: async function _decodeAsync(data, params) {
    return await decodeAsync(this, data, params, { callee: _decodeAsync });
  },
  safeEncode(data, params) {
    return safeEncode(this, data, params);
  },
  safeDecode(data, params) {
    return safeDecode(this, data, params);
  },
  async safeEncodeAsync(data, params) {
    return safeEncodeAsync(this, data, params);
  },
  async safeDecodeAsync(data, params) {
    return safeDecodeAsync(this, data, params);
  },
  toJSONSchema(params) {
    return createToJSONSchemaMethod(this, {})(params);
  },
  get description() {
    return globalRegistry.get(this)?.description;
  },
  get _def() {
    return this._zod.def;
  }
});
var _ZodString = /* @__PURE__ */ $constructor("_ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => stringProcessor(inst, ctx, json, params);
}, /* @__PURE__ */ derived({
  format: (inst) => aggregateChecks(inst).format ?? null,
  minLength: (inst) => aggregateChecks(inst).minimum ?? null,
  maxLength: (inst) => aggregateChecks(inst).maximum ?? null
}, {
  regex(...args) {
    return this.check(_regex(...args));
  },
  includes(...args) {
    return this.check(_includes(...args));
  },
  startsWith(...args) {
    return this.check(_startsWith(...args));
  },
  endsWith(...args) {
    return this.check(_endsWith(...args));
  },
  min(...args) {
    return this.check(_minLength(...args));
  },
  max(...args) {
    return this.check(_maxLength(...args));
  },
  length(...args) {
    return this.check(_length(...args));
  },
  nonempty(...args) {
    return this.check(_minLength(1, ...args));
  },
  lowercase(params) {
    return this.check(_lowercase(params));
  },
  uppercase(params) {
    return this.check(_uppercase(params));
  },
  trim() {
    return this.check(_trim());
  },
  normalize(...args) {
    return this.check(_normalize(...args));
  },
  toLowerCase() {
    return this.check(_toLowerCase());
  },
  toUpperCase() {
    return this.check(_toUpperCase());
  },
  slugify() {
    return this.check(_slugify());
  }
}));
var ZodString = /* @__PURE__ */ $constructor("ZodString", (inst, def) => {
  $ZodString.init(inst, def);
  _ZodString.init(inst, def);
}, {
  email(params) {
    return this.check(_email(ZodEmail, params));
  },
  url(params) {
    return this.check(_url(ZodURL, params));
  },
  jwt(params) {
    return this.check(_jwt(ZodJWT, params));
  },
  emoji(params) {
    return this.check(_emoji2(ZodEmoji, params));
  },
  guid(params) {
    return this.check(_guid(ZodGUID, params));
  },
  uuid(params) {
    return this.check(_uuid(ZodUUID, params));
  },
  uuidv4(params) {
    return this.check(_uuidv4(ZodUUID, params));
  },
  uuidv6(params) {
    return this.check(_uuidv6(ZodUUID, params));
  },
  uuidv7(params) {
    return this.check(_uuidv7(ZodUUID, params));
  },
  nanoid(params) {
    return this.check(_nanoid(ZodNanoID, params));
  },
  cuid(params) {
    return this.check(_cuid(ZodCUID, params));
  },
  cuid2(params) {
    return this.check(_cuid2(ZodCUID2, params));
  },
  ulid(params) {
    return this.check(_ulid(ZodULID, params));
  },
  base64(params) {
    return this.check(_base64(ZodBase64, params));
  },
  base64url(params) {
    return this.check(_base64url(ZodBase64URL, params));
  },
  xid(params) {
    return this.check(_xid(ZodXID, params));
  },
  ksuid(params) {
    return this.check(_ksuid(ZodKSUID, params));
  },
  ipv4(params) {
    return this.check(_ipv4(ZodIPv4, params));
  },
  ipv6(params) {
    return this.check(_ipv6(ZodIPv6, params));
  },
  cidrv4(params) {
    return this.check(_cidrv4(ZodCIDRv4, params));
  },
  cidrv6(params) {
    return this.check(_cidrv6(ZodCIDRv6, params));
  },
  e164(params) {
    return this.check(_e164(ZodE164, params));
  },
  datetime(params) {
    return this.check(_isoDateTime(ZodISODateTime, params));
  },
  date(params) {
    return this.check(_isoDate(ZodISODate, params));
  },
  time(params) {
    return this.check(_isoTime(ZodISOTime, params));
  },
  duration(params) {
    return this.check(_isoDuration(ZodISODuration, params));
  }
});
function string2(params) {
  return _string(ZodString, params);
}
var ZodStringFormat = /* @__PURE__ */ $constructor("ZodStringFormat", (inst, def) => {
  $ZodStringFormat.init(inst, def);
  _ZodString.init(inst, def);
});
var ZodISODateTime = /* @__PURE__ */ $constructor("ZodISODateTime", (inst, def) => {
  $ZodISODateTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodISODate = /* @__PURE__ */ $constructor("ZodISODate", (inst, def) => {
  $ZodISODate.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodISOTime = /* @__PURE__ */ $constructor("ZodISOTime", (inst, def) => {
  $ZodISOTime.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodISODuration = /* @__PURE__ */ $constructor("ZodISODuration", (inst, def) => {
  $ZodISODuration.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodEmail = /* @__PURE__ */ $constructor("ZodEmail", (inst, def) => {
  $ZodEmail.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodGUID = /* @__PURE__ */ $constructor("ZodGUID", (inst, def) => {
  $ZodGUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodUUID = /* @__PURE__ */ $constructor("ZodUUID", (inst, def) => {
  $ZodUUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodURL = /* @__PURE__ */ $constructor("ZodURL", (inst, def) => {
  $ZodURL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodEmoji = /* @__PURE__ */ $constructor("ZodEmoji", (inst, def) => {
  $ZodEmoji.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNanoID = /* @__PURE__ */ $constructor("ZodNanoID", (inst, def) => {
  $ZodNanoID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID = /* @__PURE__ */ $constructor("ZodCUID", (inst, def) => {
  $ZodCUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCUID2 = /* @__PURE__ */ $constructor("ZodCUID2", (inst, def) => {
  $ZodCUID2.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodULID = /* @__PURE__ */ $constructor("ZodULID", (inst, def) => {
  $ZodULID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodXID = /* @__PURE__ */ $constructor("ZodXID", (inst, def) => {
  $ZodXID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodKSUID = /* @__PURE__ */ $constructor("ZodKSUID", (inst, def) => {
  $ZodKSUID.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv4 = /* @__PURE__ */ $constructor("ZodIPv4", (inst, def) => {
  $ZodIPv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodIPv6 = /* @__PURE__ */ $constructor("ZodIPv6", (inst, def) => {
  $ZodIPv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv4 = /* @__PURE__ */ $constructor("ZodCIDRv4", (inst, def) => {
  $ZodCIDRv4.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodCIDRv6 = /* @__PURE__ */ $constructor("ZodCIDRv6", (inst, def) => {
  $ZodCIDRv6.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64 = /* @__PURE__ */ $constructor("ZodBase64", (inst, def) => {
  $ZodBase64.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodBase64URL = /* @__PURE__ */ $constructor("ZodBase64URL", (inst, def) => {
  $ZodBase64URL.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodE164 = /* @__PURE__ */ $constructor("ZodE164", (inst, def) => {
  $ZodE164.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodJWT = /* @__PURE__ */ $constructor("ZodJWT", (inst, def) => {
  $ZodJWT.init(inst, def);
  ZodStringFormat.init(inst, def);
});
var ZodNumber = /* @__PURE__ */ $constructor("ZodNumber", (inst, def) => {
  $ZodNumber.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => numberProcessor(inst, ctx, json, params);
  inst.isFinite = true;
}, /* @__PURE__ */ derived({
  minValue: (inst) => {
    const { minimum, exclusiveMinimum } = aggregateChecks(inst);
    return Math.max(minimum ?? Number.NEGATIVE_INFINITY, exclusiveMinimum ?? Number.NEGATIVE_INFINITY);
  },
  maxValue: (inst) => {
    const { maximum, exclusiveMaximum } = aggregateChecks(inst);
    return Math.min(maximum ?? Number.POSITIVE_INFINITY, exclusiveMaximum ?? Number.POSITIVE_INFINITY);
  },
  isInt: (inst) => {
    const { isInt, multipleOf } = aggregateChecks(inst);
    return !!isInt || !!multipleOf?.some(Number.isSafeInteger);
  },
  format: (inst) => aggregateChecks(inst).format ?? null
}, {
  gt(value, params) {
    return this.check(_gt(value, params));
  },
  gte(value, params) {
    return this.check(_gte(value, params));
  },
  min(value, params) {
    return this.check(_gte(value, params));
  },
  lt(value, params) {
    return this.check(_lt(value, params));
  },
  lte(value, params) {
    return this.check(_lte(value, params));
  },
  max(value, params) {
    return this.check(_lte(value, params));
  },
  int(params) {
    return this.check(int(params));
  },
  safe(params) {
    return this.check(int(params));
  },
  positive(params) {
    return this.check(_gt(0, params));
  },
  nonnegative(params) {
    return this.check(_gte(0, params));
  },
  negative(params) {
    return this.check(_lt(0, params));
  },
  nonpositive(params) {
    return this.check(_lte(0, params));
  },
  multipleOf(value, params) {
    return this.check(_multipleOf(value, params));
  },
  step(value, params) {
    return this.check(_multipleOf(value, params));
  },
  finite() {
    return this;
  }
}));
function number2(params) {
  return _number(ZodNumber, params);
}
var ZodNumberFormat = /* @__PURE__ */ $constructor("ZodNumberFormat", (inst, def) => {
  $ZodNumberFormat.init(inst, def);
  ZodNumber.init(inst, def);
});
function int(params) {
  return _int(ZodNumberFormat, params);
}
var ZodBoolean = /* @__PURE__ */ $constructor("ZodBoolean", (inst, def) => {
  $ZodBoolean.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => booleanProcessor(inst, ctx, json, params);
});
function boolean2(params) {
  return _boolean(ZodBoolean, params);
}
var ZodNull = /* @__PURE__ */ $constructor("ZodNull", (inst, def) => {
  $ZodNull.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nullProcessor(inst, ctx, json, params);
});
function _null3(params) {
  return _null2(ZodNull, params);
}
var ZodUnknown = /* @__PURE__ */ $constructor("ZodUnknown", (inst, def) => {
  $ZodUnknown.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unknownProcessor(inst, ctx, json, params);
});
function unknown() {
  return _unknown(ZodUnknown);
}
var ZodNever = /* @__PURE__ */ $constructor("ZodNever", (inst, def) => {
  $ZodNever.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => neverProcessor(inst, ctx, json, params);
});
function never(params) {
  return _never(ZodNever, params);
}
var ZodArray = /* @__PURE__ */ $constructor("ZodArray", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodArray.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => arrayProcessor(inst, ctx, json, params);
  inst.element = def.element;
}, {
  min(n, params) {
    return this.check(_minLength(n, params));
  },
  nonempty(params) {
    return this.check(_minLength(1, params));
  },
  max(n, params) {
    return this.check(_maxLength(n, params));
  },
  length(n, params) {
    return this.check(_length(n, params));
  },
  unwrap() {
    return this.element;
  }
});
function array(element, params) {
  return _array(ZodArray, element, params);
}
var ZodObject = /* @__PURE__ */ $constructor("ZodObject", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodObjectJIT.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => objectProcessor(inst, ctx, json, params);
  installLazyProp(inst, "shape", (self) => self._zod.def.shape, false);
}, {
  keyof() {
    return _enum(Object.keys(this._zod.def.shape));
  },
  catchall(catchall) {
    return this.clone(mergeDefs(this._zod.def, { catchall }));
  },
  passthrough() {
    return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
  },
  loose() {
    return this.clone(mergeDefs(this._zod.def, { catchall: unknown() }));
  },
  strict() {
    return this.clone(mergeDefs(this._zod.def, { catchall: never() }));
  },
  strip() {
    return this.clone(mergeDefs(this._zod.def, { catchall: undefined }));
  },
  extend(incoming) {
    return extend(this, incoming);
  },
  safeExtend(incoming) {
    return safeExtend(this, incoming);
  },
  merge(other) {
    return merge(this, other);
  },
  pick(mask) {
    return pick(this, mask);
  },
  omit(mask) {
    return omit(this, mask);
  },
  partial(...args) {
    return partial(ZodOptional, this, args[0]);
  },
  exactPartial(...args) {
    return partial(ZodExactOptional, this, args[0], "exactPartial");
  },
  required(...args) {
    return required(ZodNonOptional, this, args[0]);
  }
});
function object(shape, params) {
  const def = {
    type: "object",
    shape: shape ?? {},
    ...normalizeParams(params)
  };
  return new ZodObject(def);
}
var ZodUnion = /* @__PURE__ */ $constructor("ZodUnion", (inst, def) => {
  $ZodUnion.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => unionProcessor(inst, ctx, json, params);
  inst.options = def.options;
});
function union(options, params) {
  return new ZodUnion({
    type: "union",
    options,
    ...normalizeParams(params)
  });
}
var ZodDiscriminatedUnion = /* @__PURE__ */ $constructor("ZodDiscriminatedUnion", (inst, def) => {
  ZodUnion.init(inst, def);
  $ZodDiscriminatedUnion.init(inst, def);
});
function discriminatedUnion(discriminator, options, params) {
  return new ZodDiscriminatedUnion({
    type: "union",
    options,
    discriminator,
    ...normalizeParams(params)
  });
}
var ZodIntersection = /* @__PURE__ */ $constructor("ZodIntersection", (inst, def) => {
  $ZodIntersection.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => intersectionProcessor(inst, ctx, json, params);
});
function intersection(left, right) {
  return new ZodIntersection({
    type: "intersection",
    left,
    right
  });
}
var ZodRecord = /* @__PURE__ */ $constructor("ZodRecord", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodRecord.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => recordProcessor(inst, ctx, json, params);
  inst.keyType = def.keyType;
  inst.valueType = def.valueType;
});
function record(keyType, valueType, params) {
  if (!valueType || !valueType._zod) {
    return new ZodRecord({
      type: "record",
      keyType: string2(),
      valueType: keyType,
      ...normalizeParams(valueType)
    });
  }
  return new ZodRecord({
    type: "record",
    keyType,
    valueType,
    ...normalizeParams(params)
  });
}
var ZodEnum = /* @__PURE__ */ $constructor("ZodEnum", (inst, def) => {
  $ZodEnum.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => enumProcessor(inst, ctx, json, params);
  inst.enum = def.entries;
  inst.options = [...inst._zod.values];
  const keys = new Set(Object.keys(def.entries));
  inst.extract = (values, params) => {
    const newEntries = {};
    for (const value of values) {
      if (keys.has(value)) {
        newEntries[value] = def.entries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
  inst.exclude = (values, params) => {
    const newEntries = { ...def.entries };
    for (const value of values) {
      if (keys.has(value)) {
        delete newEntries[value];
      } else
        throw new Error(`Key ${value} not found in enum`);
    }
    return new ZodEnum({
      ...def,
      checks: [],
      ...normalizeParams(params),
      entries: newEntries
    });
  };
});
function _enum(values, params) {
  const entries = Array.isArray(values) ? Object.fromEntries(values.map((v) => [v, v])) : values;
  return new ZodEnum({
    type: "enum",
    entries,
    ...normalizeParams(params)
  });
}
var ZodLiteral = /* @__PURE__ */ $constructor("ZodLiteral", (inst, def) => {
  $ZodLiteral.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => literalProcessor(inst, ctx, json, params);
  inst.values = new Set(def.values);
  Object.defineProperty(inst, "value", {
    get() {
      if (def.values.length > 1) {
        throw new Error("This schema contains multiple valid literal values. Use `.values` instead.");
      }
      return def.values[0];
    }
  });
});
function literal(value, params) {
  return new ZodLiteral({
    type: "literal",
    values: Array.isArray(value) ? value : [value],
    ...normalizeParams(params)
  });
}
var ZodTransform = /* @__PURE__ */ $constructor("ZodTransform", (inst, def) => {
  _ensureDefaultMemoizer();
  $ZodTransform.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => transformProcessor(inst, ctx, json, params);
  inst._zod.parse = (payload, _ctx) => {
    if (_ctx.direction === "backward") {
      throw new $ZodEncodeError(inst.constructor.name);
    }
    payload.addIssue = (issue2) => {
      if (typeof issue2 === "string") {
        payload.issues.push(issue(issue2, payload.value, def));
      } else {
        const _issue = issue2;
        if (_issue.fatal)
          _issue.continue = false;
        _issue.code ?? (_issue.code = "custom");
        if (!("input" in _issue))
          _issue.input = payload.value;
        _issue.inst ?? (_issue.inst = inst);
        payload.issues.push(issue(_issue));
      }
    };
    const output = def.transform(payload.value, payload);
    if (output instanceof Promise) {
      return output.then((output) => {
        payload.value = output;
        return payload;
      });
    }
    payload.value = output;
    return payload;
  };
});
function transform(fn) {
  return new ZodTransform({
    type: "transform",
    transform: fn
  });
}
var ZodOptional = /* @__PURE__ */ $constructor("ZodOptional", (inst, def) => {
  $ZodOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function optional(innerType) {
  return new ZodOptional({
    type: "optional",
    innerType
  });
}
var ZodExactOptional = /* @__PURE__ */ $constructor("ZodExactOptional", (inst, def) => {
  $ZodExactOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => optionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function exactOptional(innerType) {
  return new ZodExactOptional({
    type: "optional",
    innerType
  });
}
var ZodNullable = /* @__PURE__ */ $constructor("ZodNullable", (inst, def) => {
  $ZodNullable.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nullableProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nullable(innerType) {
  return new ZodNullable({
    type: "nullable",
    innerType
  });
}
var ZodDefault = /* @__PURE__ */ $constructor("ZodDefault", (inst, def) => {
  $ZodDefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => defaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeDefault = inst.unwrap;
});
function _default(innerType, defaultValue) {
  return new ZodDefault({
    type: "default",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
var ZodPrefault = /* @__PURE__ */ $constructor("ZodPrefault", (inst, def) => {
  $ZodPrefault.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => prefaultProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function prefault(innerType, defaultValue) {
  return new ZodPrefault({
    type: "prefault",
    innerType,
    get defaultValue() {
      return typeof defaultValue === "function" ? defaultValue() : shallowClone(defaultValue);
    }
  });
}
var ZodNonOptional = /* @__PURE__ */ $constructor("ZodNonOptional", (inst, def) => {
  $ZodNonOptional.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => nonoptionalProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function nonoptional(innerType, params) {
  return new ZodNonOptional({
    type: "nonoptional",
    innerType,
    ...normalizeParams(params)
  });
}
var ZodCatch = /* @__PURE__ */ $constructor("ZodCatch", (inst, def) => {
  $ZodCatch.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => catchProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
  inst.removeCatch = inst.unwrap;
});
function _catch(innerType, catchValue) {
  return new ZodCatch({
    type: "catch",
    innerType,
    catchValue: typeof catchValue === "function" ? catchValue : constantCatch(catchValue)
  });
}
var ZodPipe = /* @__PURE__ */ $constructor("ZodPipe", (inst, def) => {
  $ZodPipe.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => pipeProcessor(inst, ctx, json, params);
  inst.in = def.in;
  inst.out = def.out;
});
function pipe(in_, out) {
  return new ZodPipe({
    type: "pipe",
    in: in_,
    out
  });
}
var ZodReadonly = /* @__PURE__ */ $constructor("ZodReadonly", (inst, def) => {
  $ZodReadonly.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => readonlyProcessor(inst, ctx, json, params);
  inst.unwrap = () => inst._zod.def.innerType;
});
function readonly(innerType) {
  return new ZodReadonly({
    type: "readonly",
    innerType
  });
}
var ZodCustom = /* @__PURE__ */ $constructor("ZodCustom", (inst, def) => {
  $ZodCustom.init(inst, def);
  ZodType.init(inst, def);
  inst._zod.processJSONSchema = (ctx, json, params) => customProcessor(inst, ctx, json, params);
});
function refine(fn, _params = {}) {
  return _refine(ZodCustom, fn, _params);
}
function superRefine(fn, params) {
  return _superRefine(fn, params);
}
// ../../packages/shared/src/schema/primitives.ts
var countSchema = number2().int().min(0);
var positiveSchema = number2().int().min(1);
function listOf(key, item) {
  const shape = { [key]: array(item) };
  return object(shape);
}

// ../../packages/shared/src/storage/pages.ts
var MAX_PAGE_BYTES = 1500000;
var MAX_PAGE_TITLE = 200;
var PAGE_TICKET = /^[A-Za-z0-9][A-Za-z0-9._-]{0,99}$/;
var PAGE_NAME = /^[A-Za-z0-9][A-Za-z0-9._-]{0,199}$/;
var PAGE_TAB = /^[A-Za-z0-9_-]{1,64}$/;
var PAGE_SLOT = /^[a-z0-9][a-z0-9_-]{0,63}$/;
var pageSlotSchema = string2().regex(PAGE_SLOT);
var LINK_ID = /^[A-Za-z0-9:._-]{1,200}$/;
var MEDIA_CONTENT_TYPES = {
  ".mp4": "video/mp4",
  ".webm": "video/webm",
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".gif": "image/gif",
  ".webp": "image/webp",
  ".txt": "text/plain; charset=utf-8",
  ".json": "application/json; charset=utf-8",
  ".md": "text/markdown; charset=utf-8"
};
function mediaContentType(name) {
  const dot = name.lastIndexOf(".");
  if (dot <= 0)
    return null;
  return MEDIA_CONTENT_TYPES[name.slice(dot).toLowerCase()] ?? null;
}
function isDocumentKey(value) {
  const parts = value.split("/");
  const ticket = parts[0] ?? "";
  const name = parts[1] ?? "";
  return parts.length === 2 && PAGE_TICKET.test(ticket) && PAGE_NAME.test(name);
}
var pageRowSchema = object({
  ticket: string2().regex(PAGE_TICKET),
  name: string2().regex(PAGE_NAME),
  title: string2().min(1),
  stepId: string2(),
  bytes: number2(),
  created: string2().min(1),
  kind: _enum(["html", "diff", "media"]).optional(),
  slot: pageSlotSchema.optional(),
  storage: _enum(["cloud", "local"]).optional(),
  localPath: string2().min(1).max(1000).optional(),
  localHost: string2().min(1).max(200).optional(),
  flowId: string2().regex(LINK_ID).optional(),
  linkedTo: array(string2().refine(isDocumentKey)).optional()
});
var localMediaInputSchema = object({
  localPath: string2().trim().min(1).max(1000),
  bytes: number2().int().min(0),
  title: string2().trim().min(1).max(MAX_PAGE_TITLE).optional(),
  stepId: string2().trim().max(128).optional(),
  slot: pageSlotSchema.optional(),
  flowId: string2().regex(LINK_ID).optional(),
  localHost: string2().trim().min(1).max(200).optional()
});
var pageListResponseSchema = listOf("pages", pageRowSchema).extend({
  nextCursor: string2().nullable().optional()
});

// src/flow.ts
import { createHash as createHash2, randomUUID as randomUUID4 } from "node:crypto";
import { readFile as readFile6, stat as stat2 } from "node:fs/promises";

// ../../packages/shared/src/packet.ts
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
function failure2(error) {
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
    return failure2("packet must be an object");
  const record = input;
  const title = readTitle(record);
  if (title === null)
    return failure2("title must be 1..200 characters");
  const files = readFiles(record);
  if (typeof files === "string")
    return failure2(files);
  let totalBytes = 0;
  for (const file of files) {
    totalBytes += byteLength(file.content);
  }
  if (totalBytes > MAX_PACKET_BYTES)
    return failure2("packet exceeds 256 KiB");
  const serializedBytes = serializedByteLength({ title, files });
  if (serializedBytes > MAX_SERIALIZED_BYTES) {
    return failure2("packet exceeds 384 KiB after JSON encoding");
  }
  return { ok: true, packet: { title, files, totalBytes } };
}

// ../../packages/shared/src/lifecycle.ts
var LIFECYCLE_STATES = ["idle", "queued", "running"];
var LIFECYCLE_OUTCOMES = ["complete", "blocked", "errored", "terminated"];
var lifecycleStateSchema = _enum(LIFECYCLE_STATES);
var lifecycleOutcomeSchema = _enum(LIFECYCLE_OUTCOMES);
var BLOCK_REASONS = [
  "spec_failed",
  "implement_failed",
  "checks_failed",
  "standing_findings",
  "usage_cap",
  "merge_rejected",
  "approval_timeout",
  "merge_ready_timeout",
  "checks_after_rebase"
];

// ../../packages/shared/src/schema/label.ts
var LABEL_NAME = /^[a-z0-9][a-z0-9-]{0,31}$/;
var MAX_FLOW_LABELS = 200;
var labelColorSchema = _enum(["slate", "blue", "green", "amber", "red", "violet"]);
var labelSchema = object({
  name: string2().regex(LABEL_NAME),
  color: labelColorSchema
});
var labelListSchema = object({ labels: array(labelSchema) });
var flowLabelsInputSchema = object({ labels: array(string2().regex(LABEL_NAME)).max(MAX_FLOW_LABELS) });

// ../../packages/shared/src/schema/flow.ts
var FLOW_PRIORITIES = ["urgent", "high", "medium", "low"];
var prioritySchema = _enum(FLOW_PRIORITIES);
var flowNameSchema = string2().trim().min(1).max(80);
var flowDueSchema = string2().regex(/^\d{4}-\d{2}-\d{2}$/);
var updateFlowInputSchema = object({
  name: flowNameSchema.nullable().optional(),
  due: flowDueSchema.nullable().optional(),
  priority: prioritySchema.nullable().optional(),
  labels: flowLabelsInputSchema.shape.labels.optional()
});

// ../../packages/shared/src/schema/runtime/provider.ts
var CLI_DRIVERS = ["claude", "antigravity", "codex"];
var CLOUD_SESSION_DRIVERS = ["anthropic-routine", "webhook", "gemini-interactions"];
var PROVIDER_DRIVERS = ["pi", ...CLI_DRIVERS, ...CLOUD_SESSION_DRIVERS];
var AUTH_MODES = ["api-key", "oauth-file"];
var STEP_RUNTIMES = ["durable", "vm", "cloud_session", "local"];
var providerDriverSchema = _enum(PROVIDER_DRIVERS);
var authModeSchema = _enum(AUTH_MODES);
var stepRuntimeSchema = _enum(STEP_RUNTIMES);
var ID_PATTERN = /^[A-Za-z0-9][A-Za-z0-9._-]{0,63}$/;
var ENV_KEY = /^[A-Za-z_][A-Za-z0-9_]{0,63}$/;
var providerInstanceInputSchema = object({
  label: string2().min(1).max(120).optional(),
  provider: providerDriverSchema,
  authKind: authModeSchema.default("api-key"),
  secretName: string2().min(1).max(200).optional(),
  baseUrl: string2().url().max(500).optional(),
  env: record(string2().regex(ENV_KEY), string2().max(500)).default({}),
  defaultModel: string2().min(1).max(120).optional(),
  routineId: string2().min(1).max(120).optional(),
  fallbackInstanceId: string2().regex(ID_PATTERN).optional(),
  enabled: boolean2().default(true)
});
var providerInstanceSchema = providerInstanceInputSchema.extend({
  id: string2().regex(ID_PATTERN),
  updatedAt: number2().int().min(0)
});
var scopePolicySchema = object({
  scopeId: string2().min(1).max(200),
  allowOperatorFallback: boolean2(),
  updatedAt: number2().int().min(0)
});
var instanceCooldownSchema = object({
  instanceId: string2().regex(ID_PATTERN),
  until: number2().int().min(0),
  reason: string2().max(300)
});
var providerCooldownStatusSchema = object({
  until: number2().int().min(0),
  reason: string2().max(300)
});
var providerWithStatusSchema = providerInstanceSchema.extend({
  cooldown: providerCooldownStatusSchema.nullable()
});
var providerListResponseSchema = object({
  providers: array(providerWithStatusSchema)
});

// ../../packages/shared/src/schema/flow/config.ts
var childConfigSchema = object({
  tools: array(string2()),
  secrets: array(string2()),
  hosts: array(string2()),
  mcpServers: array(string2()),
  runtime: stepRuntimeSchema.optional(),
  providerInstanceId: string2().min(1).max(64).optional(),
  vmProfileId: string2().min(1).max(64).optional()
});
var flowConfigSchema = object({
  mergeApproval: _enum(["human", "auto"]),
  checks: array(string2()),
  usageCap: number2().int().positive().nullable(),
  children: record(string2(), childConfigSchema).default({}),
  scopeId: string2().min(1).max(200).optional(),
  providerInstanceId: string2().min(1).max(64).optional(),
  vmProfileId: string2().min(1).max(64).optional()
});

// ../../packages/shared/src/schema/flow/slice.ts
var flowTargetSchema = object({
  repo: string2(),
  base: string2(),
  landed: array(string2()),
  ticket: string2().nullable().optional(),
  ticketUrl: string2().nullable().optional()
});
var proofRowSchema = object({
  file: string2(),
  name: string2(),
  command: string2()
});
var flowSpecNodeSchema = object({
  id: string2(),
  behavior: string2(),
  files: array(string2()),
  estimate: string2(),
  hazards: string2(),
  blockedBy: array(string2()),
  proof: array(proofRowSchema),
  config: childConfigSchema
});
var flowSliceSchema = object({
  target: flowTargetSchema,
  config: flowConfigSchema,
  spec: flowSpecNodeSchema
});

// ../../packages/shared/src/schema/flow/status.ts
var flowStatusSchema = _enum([
  "queued",
  "running",
  "complete",
  "blocked",
  "errored",
  "terminated"
]);
var flowPhaseSchema = _enum([
  "queued",
  "running",
  "draft",
  "mergeGate",
  "complete"
]);
var stepKindSchema = _enum(["agent", "command", "approval", "call"]);
var agentRoleSchema = _enum(["review", "spec", "build"]);
var stepStatusSchema = _enum([
  "queued",
  "running",
  "complete",
  "errored",
  "rejected"
]);

// ../../packages/shared/src/review-report.ts
var findingSeveritySchema = _enum(["P1", "P2", "P3"]);
var findingSchema = object({
  file: string2(),
  line: number2().int(),
  evidence: string2(),
  severity: findingSeveritySchema.optional(),
  correction: string2().optional()
});
var reviewReportSchema = object({
  findings: array(findingSchema),
  verdict: _enum(["PASS", "FAIL"])
});

// ../../packages/shared/src/schema/flow/step/usage.ts
var MAX_RAW_BYTES = 64 * 1024;
var usageSchema = object({
  inputTokens: countSchema,
  outputTokens: countSchema,
  cachedInputTokens: countSchema.optional(),
  reasoningTokens: countSchema.optional()
});
var USAGE_KEYS = new Set(["inputTokens", "outputTokens", "cachedInputTokens", "reasoningTokens"]);

// ../../packages/shared/src/schema/flow/step/record.ts
var stepFileRefSchema = object({
  name: string2(),
  sha256: string2(),
  bytes: countSchema
});
var stepBaseSchema = object({
  id: string2().min(1),
  flowId: string2().min(1),
  attempt: positiveSchema.default(1),
  name: string2().default(""),
  startedAt: countSchema,
  endedAt: countSchema.nullable(),
  summary: string2().default(""),
  claimToken: string2().nullable().optional()
});
var agentStepSchema = stepBaseSchema.extend({
  kind: literal("agent"),
  role: agentRoleSchema,
  status: _enum(["queued", "running", "complete", "errored"]),
  providerInstanceId: string2().nullable().optional(),
  model: string2().nullable().default(null),
  files: array(stepFileRefSchema).default([]),
  verdict: _enum(["PASS", "FAIL"]).nullable().default(null),
  findings: array(findingSchema).default([]),
  output: string2().nullable().default(null),
  usage: usageSchema.nullable().default(null)
});
var commandStepSchema = stepBaseSchema.extend({
  kind: literal("command"),
  status: _enum(["queued", "running", "complete", "errored"]),
  command: string2().default(""),
  exitCode: number2().int().nullable().default(null),
  output: string2().nullable().default(null),
  providerInstanceId: string2().nullable().optional(),
  model: string2().nullable().optional(),
  usage: usageSchema.nullable().optional()
});
var approvalStepSchema = stepBaseSchema.extend({
  kind: literal("approval"),
  status: _enum(["queued", "complete", "rejected"]),
  decision: _enum(["approve", "reject"]).nullable().default(null),
  actor: string2().nullable().default(null),
  decisionId: string2().nullable().default(null)
});
var errorDetailAtomSchema = union([string2(), number2(), boolean2(), _null3()]);
var errorDetailValueSchema = union([errorDetailAtomSchema, array(errorDetailAtomSchema)]);
var callStepErrorSchema = object({
  code: string2().min(1),
  message: string2(),
  retryable: boolean2().default(false),
  details: record(string2(), errorDetailValueSchema).nullable().optional()
});
var callStepSchema = stepBaseSchema.extend({
  kind: literal("call"),
  status: _enum(["queued", "running", "complete", "errored"]),
  call: string2().default(""),
  callVersion: positiveSchema.nullable().default(null),
  attempts: countSchema.default(1),
  output: string2().nullable().default(null),
  error: callStepErrorSchema.nullable().default(null)
});
var stepRecordSchema = discriminatedUnion("kind", [
  agentStepSchema,
  commandStepSchema,
  approvalStepSchema,
  callStepSchema
]);
function approvalDecisionForStatus(status) {
  if (status === "complete")
    return "approve";
  if (status === "rejected")
    return "reject";
  return null;
}

// ../../packages/shared/src/schema/flow/record.ts
var pullRequestSchema = object({
  url: string2(),
  number: positiveSchema,
  base: string2()
});
var FLOW_TAB_ID = /^[a-z0-9][a-z0-9_-]{0,63}$/;
var flowTabKindSchema = _enum(["artifacts", "steps", "diff", "ship"]);
var flowTabSchema = object({
  id: string2().regex(FLOW_TAB_ID),
  label: string2().trim().min(1).max(40),
  kind: flowTabKindSchema,
  slot: string2().regex(FLOW_TAB_ID).optional()
});
var flowDocSlotSchema = string2().regex(FLOW_TAB_ID);
var flowDocRefSchema = object({
  id: string2().min(1).max(160),
  ticket: string2().min(1).max(100),
  name: string2().min(1).max(200),
  title: string2().min(1).max(200),
  slot: flowDocSlotSchema.default("artifact"),
  stepId: string2().max(128).nullable().default(null),
  sha256: string2().max(128).nullable().default(null),
  bytes: countSchema.default(0),
  createdAt: countSchema
});
var flowEvidenceRefSchema = object({
  id: string2().min(1).max(160),
  ticket: string2().min(1).max(100),
  name: string2().min(1).max(200),
  title: string2().min(1).max(200),
  kind: _enum(["media", "html"]).default("media"),
  contentType: string2().max(128).nullable().default(null),
  stepId: string2().max(128).nullable().default(null),
  sha256: string2().max(128).nullable().default(null),
  bytes: countSchema.default(0),
  createdAt: countSchema
});
var flowDiffSummarySchema = object({
  base: string2().max(200),
  head: string2().max(200),
  ticket: string2().max(100).nullable().default(null),
  name: string2().max(200).nullable().default(null),
  files: array(string2().max(500)).max(500).default([]),
  migrations: array(string2().max(500)).max(200).default([]),
  additions: countSchema.default(0),
  deletions: countSchema.default(0),
  sha256: string2().max(128).nullable().default(null)
});
var flowShipMetaSchema = object({
  risk: string2().max(4000).nullable().default(null),
  deployOrder: string2().max(4000).nullable().default(null),
  notes: array(string2().max(1000)).max(50).default([])
});
var flowModeSchema = _enum(["spec", "review", "local", "yaml"]);
var flowRecordSchema = object({
  id: string2(),
  mode: flowModeSchema.default("spec"),
  parentId: string2().nullable().default(null),
  rootFlowId: string2(),
  attempt: positiveSchema.default(1),
  childFlowIds: array(string2()).default([]),
  blockedBy: array(string2()).default([]),
  flowHash: string2().nullable().default(null),
  idempotencyKey: string2().nullable().default(null),
  target: flowTargetSchema.nullable().default(null),
  workspace: string2().nullable().default(null),
  definitionName: string2().nullable().default(null),
  bundleSha: string2().nullable().default(null),
  scheduleId: string2().nullable().default(null),
  scheduleCron: string2().nullable().default(null),
  values: record(string2(), string2()).default({}),
  tabs: array(flowTabSchema).max(16).nullable().default(null),
  docs: array(flowDocRefSchema).default([]),
  evidence: array(flowEvidenceRefSchema).default([]),
  diffSummary: flowDiffSummarySchema.nullable().default(null),
  ship: flowShipMetaSchema.nullable().default(null),
  endState: string2().nullable().default(null),
  baseSha: string2().nullable().default(null),
  config: flowConfigSchema.nullable().default(null),
  slice: flowSliceSchema.nullable().default(null),
  steps: array(stepRecordSchema).default([]),
  labels: flowLabelsInputSchema.shape.labels.default([]),
  name: string2().max(80).nullable().default(null),
  due: flowDueSchema.nullable().default(null),
  priority: prioritySchema.nullable().default(null),
  spec: string2().nullable().default(null),
  branch: string2().nullable().default(null),
  sandboxId: string2().nullable().default(null),
  pr: pullRequestSchema.nullable().default(null),
  mergeSha: string2().nullable().default(null),
  diff: string2().nullable().default(null),
  diffTruncated: boolean2().default(false),
  reason: _enum(BLOCK_REASONS).nullable().default(null),
  round: countSchema.default(0),
  phase: flowPhaseSchema.default("queued"),
  version: positiveSchema,
  state: lifecycleStateSchema,
  outcome: lifecycleOutcomeSchema.nullable(),
  status: flowStatusSchema,
  clearedAt: countSchema.nullable().default(null),
  createdAt: countSchema,
  updatedAt: countSchema
});

// src/api/generated/nosta.ts
var getApproveFlowUrl = (flowId) => {
  return `/api/flow/${flowId}/approval`;
};
var getListFlowEventsUrl = (id) => {
  return `/api/flow/${id}/events`;
};
var getRunCloudStepUrl = (id) => {
  return `/api/flow/${id}/step`;
};

// src/gate/index.ts
import { randomUUID as randomUUID2 } from "node:crypto";
import { basename as basename3 } from "node:path";

// ../../packages/shared/src/schema/flow/step/event.ts
var stepEventStatusSchema = _enum([...flowStatusSchema.options, "rejected"]);
var stepEventSchema = object({
  seq: countSchema,
  at: countSchema,
  flowId: string2(),
  childFlowId: string2().nullable(),
  stepId: string2().nullable(),
  kind: stepKindSchema,
  status: stepEventStatusSchema,
  sourceVersion: countSchema.default(1),
  summary: string2(),
  usage: usageSchema.nullable()
});

// src/store.ts
import { randomUUID } from "node:crypto";
import { realpathSync } from "node:fs";
import { mkdir as mkdir3, readFile as readFile2, rename as rename2, writeFile as writeFile2 } from "node:fs/promises";
import { homedir as homedir2 } from "node:os";
import { join as join4, resolve as resolve2 } from "node:path";
function canonicalRoot(repoRoot) {
  const abs = resolve2(repoRoot);
  try {
    return realpathSync(abs);
  } catch {
    return abs;
  }
}
function branchIndexKey(repoRoot, branch) {
  return `${canonicalRoot(repoRoot)}::${branch.trim()}`;
}
function flowsDir(stateDir) {
  const root = stateDir ?? process.env.NOSTA_STATE_DIR ?? join4(homedir2(), ".nosta");
  return join4(root, "flows");
}
function safeFlowFile(flowId) {
  return `${flowId.replace(/[^A-Za-z0-9._-]/g, "_")}.json`;
}
async function readJsonFile(filePath) {
  try {
    const raw = await readFile2(filePath, "utf8");
    return JSON.parse(raw);
  } catch {
    return null;
  }
}
async function writeJsonAtomic(filePath, value) {
  const tmp = `${filePath}.${process.pid}.${randomUUID()}.tmp`;
  await writeFile2(tmp, `${JSON.stringify(value, null, 2)}
`, "utf8");
  await rename2(tmp, filePath);
}
async function readFlowIndex(stateDir) {
  const loaded = await readJsonFile(join4(flowsDir(stateDir), "index.json"));
  return {
    byBranch: loaded?.byBranch ? { ...loaded.byBranch } : {},
    byTicket: loaded?.byTicket ? { ...loaded.byTicket } : {}
  };
}
async function readLocalFlow(flowId, stateDir) {
  const loaded = await readJsonFile(join4(flowsDir(stateDir), safeFlowFile(flowId)));
  if (!loaded || typeof loaded.flowId !== "string")
    return null;
  return {
    ...loaded,
    docs: Array.isArray(loaded.docs) ? loaded.docs : [],
    evidence: Array.isArray(loaded.evidence) ? loaded.evidence : [],
    diffSummary: loaded.diffSummary ?? null,
    ship: loaded.ship ?? null
  };
}
async function resolveIndexedFlowId(input) {
  const index = await readFlowIndex(input.stateDir);
  if (input.repoRoot && input.branch) {
    const hit = index.byBranch[branchIndexKey(input.repoRoot, input.branch)];
    if (hit)
      return hit;
  }
  if (input.ticket) {
    const hit = index.byTicket[input.ticket.trim()];
    if (hit)
      return hit;
  }
  return null;
}
async function saveLocalFlow(state, stateDir) {
  const dir = flowsDir(stateDir);
  await mkdir3(dir, { recursive: true });
  const normalized = {
    ...state,
    ...state.repoRoot ? { repoRoot: canonicalRoot(state.repoRoot) } : {}
  };
  await writeJsonAtomic(join4(dir, safeFlowFile(normalized.flowId)), normalized);
  const index = await readFlowIndex(stateDir);
  if (normalized.repoRoot && normalized.branch) {
    index.byBranch[branchIndexKey(normalized.repoRoot, normalized.branch)] = normalized.flowId;
  }
  if (normalized.ticket) {
    index.byTicket[normalized.ticket.trim()] = normalized.flowId;
  }
  await writeJsonAtomic(join4(dir, "index.json"), index);
  return normalized;
}
function emptyLocalFlow(input) {
  return {
    flowId: input.flowId,
    ...input.repoRoot ? { repoRoot: canonicalRoot(input.repoRoot) } : {},
    ...input.branch ? { branch: input.branch } : {},
    ...input.base ? { base: input.base } : {},
    ...input.ticket ? { ticket: input.ticket } : {},
    ...input.title ? { title: input.title } : {},
    ...input.tabs !== undefined ? { tabs: input.tabs } : {},
    docs: [],
    evidence: [],
    diffSummary: null,
    ship: null,
    updatedAt: input.now ?? Date.now()
  };
}

// src/gate/git.ts
import { execFile } from "node:child_process";
import { realpathSync as realpathSync2 } from "node:fs";
import { readFile as readFile3 } from "node:fs/promises";
import { basename as basename2, dirname as dirname2, isAbsolute, join as join5, relative, resolve as resolve3, sep } from "node:path";
import { promisify } from "node:util";

// src/gate/policy.ts
import { basename } from "node:path";
var workflowConfigSchema = object({
  version: literal(1),
  nodes: array(string2().min(1)).min(1),
  approvalNodes: array(string2().min(1)).default(["go"]),
  allowBeforeGo: array(string2().min(1)).default([]),
  gateBeforeGo: array(string2().min(1)).default([]),
  prGateAfter: array(string2().min(1)).default([]),
  tabs: array(flowTabSchema).max(16).optional()
}).superRefine((data, ctx) => {
  const nodeSet = new Set(data.nodes);
  if (nodeSet.size !== data.nodes.length) {
    ctx.addIssue({ code: "custom", path: ["nodes"], message: "nodes must not contain duplicates" });
  }
  for (const node of data.approvalNodes) {
    if (!nodeSet.has(node)) {
      ctx.addIssue({ code: "custom", path: ["approvalNodes"], message: `approvalNode "${node}" is not in nodes` });
    }
  }
  for (const node of data.prGateAfter) {
    if (!nodeSet.has(node)) {
      ctx.addIssue({ code: "custom", path: ["prGateAfter"], message: `prGateAfter "${node}" is not in nodes` });
    }
  }
  if (data.tabs) {
    const seenTabs = new Set;
    for (const tab of data.tabs) {
      if (seenTabs.has(tab.id)) {
        ctx.addIssue({ code: "custom", path: ["tabs"], message: `duplicate tab id "${tab.id}"` });
      }
      seenTabs.add(tab.id);
    }
  }
});
var PR_GATE_TOOLS = new Set(["pull_request_create", "mcp_t3-code_pull_request_create", "mcp__t3-code__pull_request_create"]);
var WRITE_TOOLS = new Set(["Write", "Edit", "MultiEdit", "write_file", "edit_file"]);
var SHELL_TOOLS = new Set(["Bash", "run_command"]);
var MUTATING_SHELL_CMDS = new Set(["tee", "rm", "mv", "cp", "touch", "truncate", "sed"]);
function commandSegments(command) {
  return command.split(/(?:&&|\|\||[;|\n])/).map((seg) => seg.trim().split(/\s+/).filter(Boolean)).filter((tokens) => tokens.length > 0);
}
function stripQuotes(token) {
  return token.replace(/^['"]|['"]$/g, "");
}
function isGhPrMutate(command) {
  for (const tokens of commandSegments(command)) {
    const cmd = basename(stripQuotes(tokens[0]));
    if (cmd !== "gh")
      continue;
    const prIdx = tokens.indexOf("pr", 1);
    const sub = prIdx !== -1 ? tokens[prIdx + 1] : undefined;
    if (sub === "create" || sub === "ready")
      return true;
  }
  return false;
}
function isGitCommit(command) {
  for (const tokens of commandSegments(command)) {
    const cmd = basename(stripQuotes(tokens[0]));
    if (cmd === "git" && tokens.slice(1).includes("commit"))
      return true;
  }
  return false;
}
function shellMutatedPaths(command) {
  const paths = [];
  for (const match of command.matchAll(/(?:^|[\s0-9&])>>?\s*([^\s;|&]+)/g)) {
    if (match[1])
      paths.push(stripQuotes(match[1]));
  }
  for (const tokens of commandSegments(command)) {
    const cmd = basename(stripQuotes(tokens[0]));
    if (!MUTATING_SHELL_CMDS.has(cmd))
      continue;
    if (cmd === "sed" && !tokens.some((t) => t === "-i" || t.startsWith("-i")))
      continue;
    for (const token of tokens.slice(1)) {
      if (token.startsWith("-") || token.includes(">"))
        continue;
      paths.push(stripQuotes(token));
    }
  }
  return paths;
}
function globCharPattern(normalized, index) {
  const ch = normalized[index];
  if (ch === "*") {
    if (normalized[index + 1] !== "*")
      return { chunk: "[^/]*", advance: 1 };
    return normalized[index + 2] === "/" ? { chunk: "(?:.*/)?", advance: 3 } : { chunk: ".*", advance: 2 };
  }
  if (ch === "?")
    return { chunk: "[^/]", advance: 1 };
  if ("\\^$.|+()[]{}".includes(ch))
    return { chunk: `\\${ch}`, advance: 1 };
  return { chunk: ch, advance: 1 };
}
function globToRegExp(pattern) {
  const normalized = pattern.replace(/\\/g, "/").replace(/^\.\//, "");
  let out = "^";
  for (let i = 0;i < normalized.length; ) {
    const { chunk, advance } = globCharPattern(normalized, i);
    out += chunk;
    i += advance;
  }
  return new RegExp(`${out}$`);
}
function matchesAnyGlob(relativePath, patterns) {
  const normalized = relativePath.replace(/\\/g, "/").replace(/^\.\//, "");
  return patterns.some((pattern) => globToRegExp(pattern).test(normalized));
}
function mapEventStatus(status) {
  if (status === "complete")
    return "complete";
  if (status === "running")
    return "active";
  if (status === "errored" || status === "terminated")
    return "errored";
  if (status === "rejected")
    return "rejected";
  return null;
}
function computeNextNode(config, nodes) {
  for (const id of config.nodes) {
    if (nodes[id]?.status !== "complete")
      return id;
  }
  return null;
}
function advanceCurrentNode(binding, now) {
  const next = computeNextNode(binding.config, binding.nodes);
  binding.currentNode = next;
  if (next && binding.nodes[next]?.status === "pending") {
    binding.nodes[next].status = "active";
    binding.nodes[next].updatedAt = now;
  }
  binding.updatedAt = now;
}
function describeNextAction(binding) {
  const current = binding.currentNode;
  if (!current)
    return "All workflow nodes are complete.";
  if (binding.config.approvalNodes.includes(current)) {
    return `Request owner approval via nosta_flow_approve(node: "${current}") before editing gated product files.`;
  }
  return `Complete "${current}" and call nosta_flow_advance(node: "${current}", summary: "...").`;
}
function toStepReportStatus(status) {
  if (status === "active")
    return "running";
  if (status === "complete" || status === "errored" || status === "rejected")
    return status;
  return "queued";
}
function toStepReport(binding, id) {
  const state = binding.nodes[id];
  const kind = binding.config.approvalNodes.includes(id) ? "approval" : "agent";
  const status = toStepReportStatus(state?.status);
  const parts = [
    state?.summary,
    state?.artifactUrl,
    state?.prUrl,
    state?.commitSha ? `commit:${state.commitSha}` : undefined,
    state?.proof ? `proof:${state.proof}` : undefined,
    state?.approvedBy ? `approvedBy:${state.approvedBy}` : undefined
  ].filter((v) => typeof v === "string" && v.length > 0);
  return {
    id,
    name: id,
    kind,
    status,
    ...state?.summary ? { summary: state.summary } : {},
    ...kind === "approval" && state?.approvedBy ? { actor: state.approvedBy } : {},
    ...kind === "approval" ? { decision: approvalDecisionForStatus(status) } : {},
    ...state?.usage ? { usage: state.usage } : {},
    output: parts.join(" | ")
  };
}
function buildCloudReport(binding, now) {
  const steps = binding.config.nodes.map((id) => toStepReport(binding, id));
  const hasError = Object.values(binding.nodes).some((n) => n.status === "errored");
  const status = hasError ? "errored" : binding.currentNode === null ? "complete" : "running";
  const values = binding.values && Object.keys(binding.values).length > 0 ? binding.values : undefined;
  return { status, finishedAt: status === "running" ? null : now, steps, ...values ? { values } : {} };
}
function cloneBinding(binding) {
  const nodes = {};
  for (const [k, v] of Object.entries(binding.nodes))
    nodes[k] = { ...v };
  return { ...binding, nodes, ...binding.values ? { values: { ...binding.values } } : {} };
}
function checkGatedPath(input) {
  const { binding, config, targetPath, toRelative } = input;
  const rel = toRelative(targetPath);
  if (rel !== null && matchesAnyGlob(rel, config.gateBeforeGo) && !matchesAnyGlob(rel, config.allowBeforeGo)) {
    return {
      decision: "deny",
      reason: `Editing "${rel}" is blocked before owner approval (flow ${binding.flowId}, current node: ${binding.currentNode ?? "none"}). ${describeNextAction(binding)}`,
      flowId: binding.flowId,
      currentNode: binding.currentNode
    };
  }
  return null;
}
function evaluatePrAction(binding, config) {
  const missing = config.prGateAfter.filter((id) => binding.nodes[id]?.status !== "complete");
  if (missing.length > 0) {
    return {
      decision: "deny",
      reason: `PR creation/ready is blocked until [${missing.join(", ")}] complete (flow ${binding.flowId}, current node: ${binding.currentNode ?? "complete"}).`,
      flowId: binding.flowId,
      currentNode: binding.currentNode
    };
  }
  return { decision: "allow", reason: "prGateAfter nodes are complete", flowId: binding.flowId, currentNode: binding.currentNode };
}
function evaluatePreApproval(input) {
  const { binding, config, tool, path, command, toRelative } = input;
  if (WRITE_TOOLS.has(tool) && path) {
    const blocked = checkGatedPath({ binding, config, targetPath: path, toRelative });
    if (blocked)
      return blocked;
  }
  if (!SHELL_TOOLS.has(tool) || command.length === 0)
    return null;
  if (isGitCommit(command)) {
    return {
      decision: "deny",
      reason: `git commit is blocked before owner approval (flow ${binding.flowId}, current node: ${binding.currentNode ?? "none"}). ${describeNextAction(binding)}`,
      flowId: binding.flowId,
      currentNode: binding.currentNode
    };
  }
  for (const target of shellMutatedPaths(command)) {
    const blocked = checkGatedPath({ binding, config, targetPath: target, toRelative });
    if (blocked)
      return blocked;
  }
  return null;
}
function evaluatePolicy(input) {
  const { binding, config, tool, command } = input;
  if (PR_GATE_TOOLS.has(tool) || SHELL_TOOLS.has(tool) && isGhPrMutate(command)) {
    return evaluatePrAction(binding, config);
  }
  const approvalsDone = config.approvalNodes.every((id) => binding.nodes[id]?.status === "complete");
  if (!approvalsDone) {
    const blocked = evaluatePreApproval(input);
    if (blocked)
      return blocked;
  }
  return { decision: "allow", reason: "action permitted by active workflow phase", flowId: binding.flowId, currentNode: binding.currentNode };
}
function evaluateStopDecision(input) {
  const { binding, config, bypassActive } = input;
  if (bypassActive) {
    return { decision: "allow", reason: "temporary bypass active", flowId: binding.flowId, currentNode: binding.currentNode };
  }
  if (!binding.currentNode) {
    return { decision: "allow", reason: "all workflow nodes complete", flowId: binding.flowId, currentNode: null };
  }
  if (config.approvalNodes.includes(binding.currentNode)) {
    return { decision: "allow", reason: `waiting for owner approval on "${binding.currentNode}"`, flowId: binding.flowId, currentNode: binding.currentNode };
  }
  const hasEvidence = binding.observed.some((ev) => ev.node === binding.currentNode);
  if (!hasEvidence) {
    return {
      decision: "deny",
      reason: `Active node "${binding.currentNode}" has no recorded evidence yet (flow ${binding.flowId}). ${describeNextAction(binding)}`,
      flowId: binding.flowId,
      currentNode: binding.currentNode
    };
  }
  return { decision: "allow", reason: `evidence recorded for active node "${binding.currentNode}"`, flowId: binding.flowId, currentNode: binding.currentNode };
}

// src/gate/git.ts
var execFileAsync = promisify(execFile);
function resolveRealPath(targetPath) {
  const abs = resolve3(targetPath);
  const tail = [];
  let cursor = abs;
  while (true) {
    try {
      const real = realpathSync2(cursor);
      return tail.length > 0 ? join5(real, ...tail.reverse()) : real;
    } catch {
      const parent = dirname2(cursor);
      if (parent === cursor)
        return abs;
      tail.push(basename2(cursor));
      cursor = parent;
    }
  }
}
function canonicalRepoRoot(repoRoot) {
  return resolveRealPath(repoRoot);
}
function bindingKey(repoRoot, branch) {
  return `${canonicalRepoRoot(repoRoot)}::${branch.trim()}`;
}
async function runGit(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd, timeout: 3000 });
    const trimmed = stdout.trim();
    return trimmed.length > 0 ? trimmed : null;
  } catch {
    return null;
  }
}
async function resolveRepoBranch(input) {
  if (input.repoRoot && input.branch) {
    return { repoRoot: canonicalRepoRoot(input.repoRoot), branch: input.branch.trim() };
  }
  const cwd = input.repoRoot ?? process.cwd();
  const root = await runGit(cwd, ["rev-parse", "--show-toplevel"]);
  if (!root)
    throw new Error("could not resolve git repository context; pass { repoRoot, branch }");
  const branch = input.branch?.trim() || await runGit(cwd, ["symbolic-ref", "--short", "HEAD"]) || await runGit(cwd, ["rev-parse", "--abbrev-ref", "HEAD"]) || await runGit(cwd, ["rev-parse", "--short", "HEAD"]) || "HEAD";
  return { repoRoot: input.repoRoot ? canonicalRepoRoot(input.repoRoot) : canonicalRepoRoot(root), branch };
}
async function loadWorkflowConfig(repoRoot) {
  const filePath = join5(canonicalRepoRoot(repoRoot), ".nosta", "workflow.json");
  let text;
  try {
    text = await readFile3(filePath, "utf8");
  } catch (error) {
    if (error.code === "ENOENT")
      return null;
    throw error;
  }
  let raw;
  try {
    raw = JSON.parse(text);
  } catch (error) {
    throw new Error(`invalid JSON in ${filePath}: ${error instanceof Error ? error.message : String(error)}`);
  }
  const parsed = workflowConfigSchema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`invalid .nosta/workflow.json: ${parsed.error.issues.map((i) => i.message).join("; ")}`);
  }
  return parsed.data;
}
function toRepoRelativePath(repoRoot, targetPath) {
  const root = canonicalRepoRoot(repoRoot);
  const absTarget = isAbsolute(targetPath) ? resolve3(targetPath) : resolve3(root, targetPath);
  const realTarget = resolveRealPath(absTarget);
  const rel = relative(root, realTarget);
  if (rel.startsWith("..") || isAbsolute(rel))
    return null;
  return rel.split(sep).join("/");
}

// src/gate/stream.ts
function parseSseBlock(block) {
  let id = null;
  let event = "message";
  const dataLines = [];
  for (const rawLine of block.split(/\r?\n/)) {
    if (rawLine.length === 0 || rawLine.startsWith(":"))
      continue;
    const colon = rawLine.indexOf(":");
    const field = colon === -1 ? rawLine : rawLine.slice(0, colon);
    const rawValue = colon === -1 ? "" : rawLine.slice(colon + 1);
    const value = rawValue.startsWith(" ") ? rawValue.slice(1) : rawValue;
    if (field === "id") {
      const parsed = Number(value.trim());
      if (Number.isSafeInteger(parsed) && parsed > 0)
        id = parsed;
    } else if (field === "event") {
      if (value.trim().length > 0)
        event = value.trim();
    } else if (field === "data") {
      dataLines.push(value);
    }
  }
  if (dataLines.length === 0)
    return null;
  const rawData = dataLines.join(`
`);
  let data = rawData;
  try {
    data = JSON.parse(rawData);
  } catch {
    data = rawData;
  }
  return { id, event, data };
}
function waitAbortable(ms, signal) {
  if (signal.aborted)
    return Promise.resolve(false);
  return new Promise((resolve) => {
    const timer = setTimeout(() => {
      signal.removeEventListener("abort", onAbort);
      resolve(true);
    }, ms);
    const onAbort = () => {
      clearTimeout(timer);
      resolve(false);
    };
    signal.addEventListener("abort", onAbort, { once: true });
  });
}
var MAX_SSE_BUFFER_BYTES = 1024 * 1024;
function connectFlowStream(options) {
  const fetchFn = options.fetchImpl ?? fetch;
  const baseDelayMs = options.baseDelayMs ?? 250;
  const maxDelayMs = options.maxDelayMs ?? 15000;
  const controller = new AbortController;
  let lastId = options.initialLastEventId ?? 0;
  async function consumeStream(body) {
    const reader = body.getReader();
    const decoder = new TextDecoder;
    let buffer = "";
    try {
      while (!controller.signal.aborted) {
        const { done, value } = await reader.read();
        if (done)
          break;
        buffer += decoder.decode(value, { stream: true });
        if (Buffer.byteLength(buffer, "utf8") > MAX_SSE_BUFFER_BYTES) {
          throw new Error("SSE frame buffer exceeded 1 MiB");
        }
        let boundary = buffer.indexOf(`

`);
        while (boundary !== -1) {
          const block = buffer.slice(0, boundary);
          buffer = buffer.slice(boundary + 2);
          const frame = parseSseBlock(block);
          if (frame) {
            if (frame.id !== null && frame.id > lastId)
              lastId = frame.id;
            options.onEvent(frame);
          }
          boundary = buffer.indexOf(`

`);
        }
      }
    } finally {
      reader.releaseLock();
    }
  }
  async function loop() {
    let attempt = 0;
    while (!controller.signal.aborted) {
      try {
        const headers = {
          accept: "text/event-stream"
        };
        if (options.token)
          headers.authorization = `Bearer ${options.token}`;
        if (lastId > 0)
          headers["last-event-id"] = String(lastId);
        const response = await fetchFn(options.url, {
          method: "GET",
          headers,
          signal: controller.signal
        });
        if (!response.ok || !response.body) {
          throw new Error(`SSE stream answered ${response.status}`);
        }
        attempt = 0;
        await consumeStream(response.body);
      } catch (error) {
        if (controller.signal.aborted)
          return;
        options.onError?.(error);
      }
      if (controller.signal.aborted)
        return;
      const delay = Math.min(maxDelayMs, baseDelayMs * 2 ** attempt);
      attempt += 1;
      const shouldContinue = await waitAbortable(delay, controller.signal);
      if (!shouldContinue)
        return;
    }
  }
  loop();
  return {
    close: () => {
      controller.abort();
    },
    lastEventId: () => lastId
  };
}

// src/gate/index.ts
var hydratedFlowResponseSchema = object({
  flow: object({
    id: string2().min(1),
    mode: string2().optional(),
    workspace: string2().nullable().optional(),
    branch: string2().nullable().optional(),
    values: record(string2(), string2()).optional(),
    steps: array(object({
      id: string2().min(1),
      status: string2().optional(),
      summary: string2().optional()
    })).optional()
  })
});

class WorkflowGate {
  bindings = new Map;
  bypasses = new Map;
  flowIndex = new Map;
  streams = new Map;
  backend;
  now;
  fetchImpl;
  enableStream;
  streamBackoff;
  constructor(options) {
    this.backend = options.backend;
    this.now = options.now ?? (() => Date.now());
    this.fetchImpl = options.fetchImpl;
    this.enableStream = options.enableStream ?? true;
    this.streamBackoff = options.streamBackoff;
  }
  async start(input) {
    const { repoRoot, branch } = await resolveRepoBranch(input);
    const config = await loadWorkflowConfig(repoRoot);
    if (!config)
      throw new Error(`no .nosta/workflow.json found in ${repoRoot}`);
    const workspace = basename3(repoRoot) || "workspace";
    const name = (input.title?.trim() || `${workspace}:${branch}`).slice(0, 80);
    const tabs = input.tabs ?? config.tabs;
    const body = {
      mode: "local",
      ...input.parentId ? { parentId: input.parentId } : {},
      name,
      workspace,
      repo: workspace,
      ...input.base ? { base: input.base } : {},
      branch,
      ticket: input.ticket ?? null,
      ticketUrl: input.ticketUrl ?? null,
      ...tabs ? { tabs } : {},
      ...input.endState ? { endState: input.endState } : {},
      ...input.spec ? { spec: input.spec } : {},
      ...input.values ? { values: input.values } : {}
    };
    const raw = await this.backend.request("/api/flow", {
      method: "POST",
      headers: { "content-type": "application/json", "Idempotency-Key": randomUUID2() },
      body: JSON.stringify(body)
    });
    const parsed = JSON.parse(raw);
    const flowId = parsed.flow?.id;
    if (!flowId)
      throw new Error("backend did not return flow.id");
    const binding = this.attachBinding({ repoRoot, branch, flowId, config });
    const existing = await readLocalFlow(flowId);
    await saveLocalFlow(existing ?? emptyLocalFlow({
      flowId,
      repoRoot,
      branch,
      base: input.base,
      ticket: input.ticket,
      title: name,
      ...tabs ? { tabs } : {},
      now: this.now()
    }));
    return { flow: parsed.flow, binding, nextAction: describeNextAction(binding) };
  }
  async status(input) {
    if (input.flowId) {
      const raw = await this.backend.request(`/api/flow/${encodeURIComponent(input.flowId)}`);
      const payload = JSON.parse(raw);
      const binding = this.getByFlowId(input.flowId);
      return binding ? { ...payload, binding, nextAction: describeNextAction(binding) } : payload;
    }
    const binding = await this.resolveBinding(input);
    const raw = await this.backend.request(`/api/flow/${encodeURIComponent(binding.flowId)}`);
    const payload = JSON.parse(raw);
    return { ...payload, binding, nextAction: describeNextAction(binding) };
  }
  async advance(input) {
    const binding = await this.resolveBinding(input);
    if (binding.config.approvalNodes.includes(input.node)) {
      throw new Error(`node "${input.node}" requires owner approval via nosta_flow_approve`);
    }
    if (binding.currentNode !== input.node) {
      throw new Error(`cannot advance "${input.node}": current active node is "${binding.currentNode ?? "complete"}"`);
    }
    const updated = await this.persistAndCommit(binding, (draft, now) => {
      const state = draft.nodes[input.node];
      state.status = "complete";
      state.summary = input.summary;
      if (input.artifactUrl)
        state.artifactUrl = input.artifactUrl;
      if (input.prUrl)
        state.prUrl = input.prUrl;
      if (input.commitSha)
        state.commitSha = input.commitSha;
      if (input.proof)
        state.proof = input.proof;
      if (input.usage)
        state.usage = input.usage;
      if (input.values || input.commitSha) {
        draft.values = {
          ...draft.values ?? {},
          ...input.values ?? {},
          ...input.commitSha ? { commitSha: input.commitSha } : {}
        };
      }
      state.updatedAt = now;
      advanceCurrentNode(draft, now);
    });
    return { flowId: updated.flowId, binding: updated, nextAction: describeNextAction(updated) };
  }
  async approve(input) {
    const binding = await this.resolveBinding(input);
    if (!binding.config.approvalNodes.includes(input.node)) {
      throw new Error(`node "${input.node}" is not an approval node; use nosta_flow_advance instead`);
    }
    if (binding.currentNode !== input.node) {
      throw new Error(`cannot approve "${input.node}": current active node is "${binding.currentNode ?? "complete"}"`);
    }
    const decision = input.decision ?? "approve";
    const updated = await this.persistAndCommit(binding, (draft, now) => {
      const state = draft.nodes[input.node];
      if (decision === "reject") {
        state.status = "rejected";
        state.summary = input.summary ?? "rejected by owner";
        state.updatedAt = now;
        draft.updatedAt = now;
      } else {
        state.status = "complete";
        state.approvedBy = input.approvedBy ?? "owner";
        state.summary = input.summary ?? "approved by owner";
        state.updatedAt = now;
        advanceCurrentNode(draft, now);
      }
    });
    return { flowId: updated.flowId, decision, binding: updated, nextAction: describeNextAction(updated) };
  }
  async bypass(input) {
    const reason = input.reason.trim();
    if (reason.length === 0)
      throw new Error("bypass reason is required");
    const target = await this.resolveTarget(input);
    const minutes = Math.min(240, Math.max(1, Math.floor(input.durationMinutes ?? 30)));
    const now = this.now();
    const until = now + minutes * 60000;
    this.bypasses.set(bindingKey(target.repoRoot, target.branch), { until, reason });
    const binding = this.bindings.get(bindingKey(target.repoRoot, target.branch)) ?? null;
    if (binding) {
      binding.bypassUntil = until;
      binding.bypassReason = reason;
      binding.updatedAt = now;
      binding.observed.push({
        id: randomUUID2(),
        node: binding.currentNode,
        kind: "bypass",
        summary: `bypass enabled for ${minutes}m: ${reason}`,
        createdAt: now
      });
      this.flushReportAsync(binding);
    }
    return { bypassed: true, flowId: binding?.flowId ?? null, repoRoot: target.repoRoot, branch: target.branch, bypassUntil: until, reason };
  }
  async context(input) {
    const repoRoot = canonicalRepoRoot(input.repoRoot);
    const branch = input.branch.trim();
    const binding = await this.lookupOrRehydrate(repoRoot, branch);
    const config = binding?.config ?? await loadWorkflowConfig(repoRoot);
    if (!config) {
      return {
        enforced: false,
        bound: false,
        repoRoot,
        branch,
        flowId: null,
        currentNode: null,
        nodes: {},
        bypassActive: false,
        bypassUntil: null,
        nextAction: "Repository has no .nosta/workflow.json; workflow gate is inactive."
      };
    }
    const bypass = this.activeBypass(repoRoot, branch);
    if (!binding) {
      return {
        enforced: true,
        bound: false,
        repoRoot,
        branch,
        flowId: null,
        currentNode: null,
        nodes: {},
        bypassActive: bypass !== null,
        bypassUntil: bypass?.until ?? null,
        nextAction: `No active flow bound for (${repoRoot}, ${branch}). Call nosta_flow_start({ repoRoot: "${repoRoot}", branch: "${branch}" }) first.`
      };
    }
    return {
      enforced: true,
      bound: true,
      repoRoot,
      branch,
      flowId: binding.flowId,
      currentNode: binding.currentNode,
      nodes: binding.nodes,
      bypassActive: bypass !== null,
      bypassUntil: bypass?.until ?? null,
      nextAction: describeNextAction(binding)
    };
  }
  async check(input) {
    const repoRoot = canonicalRepoRoot(input.repoRoot);
    const branch = input.branch.trim();
    const binding = await this.lookupOrRehydrate(repoRoot, branch);
    const config = binding?.config ?? await loadWorkflowConfig(repoRoot);
    if (!config)
      return { decision: "allow", reason: "repo is not workflow-enforced" };
    const bypass = this.activeBypass(repoRoot, branch);
    if (bypass) {
      return {
        decision: "allow",
        reason: `Temporary bypass active until ${new Date(bypass.until).toISOString()}`,
        flowId: binding?.flowId,
        currentNode: binding?.currentNode ?? null
      };
    }
    if (!binding) {
      return {
        decision: "deny",
        reason: `Workflow enforcement active for ${repoRoot} (${branch}), but no Flow is bound. Start one with nosta_flow_start.`
      };
    }
    return evaluatePolicy({
      binding,
      config,
      tool: input.tool,
      path: input.path,
      command: input.command ?? "",
      toRelative: (target) => toRepoRelativePath(binding.repoRoot, target)
    });
  }
  observe(input) {
    const binding = this.bindings.get(bindingKey(input.repoRoot, input.branch)) ?? null;
    if (!binding)
      return { recorded: false };
    const now = this.now();
    const event = {
      id: randomUUID2(),
      node: binding.currentNode,
      kind: input.kind,
      summary: input.summary,
      createdAt: now
    };
    binding.observed.push(event);
    binding.updatedAt = now;
    this.flushReportAsync(binding);
    return { recorded: true, event };
  }
  async stop(input) {
    const repoRoot = canonicalRepoRoot(input.repoRoot);
    const branch = input.branch.trim();
    const binding = await this.lookupOrRehydrate(repoRoot, branch);
    const config = binding?.config ?? await loadWorkflowConfig(repoRoot);
    if (!config || !binding)
      return { decision: "allow", reason: "no active enforced flow binding" };
    return evaluateStopDecision({
      binding,
      config,
      bypassActive: this.activeBypass(repoRoot, branch) !== null
    });
  }
  close() {
    for (const handle of this.streams.values())
      handle.close();
    this.streams.clear();
  }
  getByFlowId(flowId) {
    const key = this.flowIndex.get(flowId);
    return key ? this.bindings.get(key) ?? null : null;
  }
  async resolveTarget(input) {
    if (input.flowId) {
      const byId = this.getByFlowId(input.flowId);
      if (byId)
        return { repoRoot: byId.repoRoot, branch: byId.branch };
      if (!input.repoRoot && !input.branch) {
        throw new Error(`no local flow binding found for flowId "${input.flowId}"`);
      }
    }
    return resolveRepoBranch(input);
  }
  async lookupOrRehydrate(repoRoot, branch) {
    const existing = this.bindings.get(bindingKey(repoRoot, branch));
    if (existing)
      return existing;
    const indexedFlowId = await resolveIndexedFlowId({ repoRoot, branch });
    if (!indexedFlowId)
      return null;
    try {
      return await this.rehydrateByFlowId({ flowId: indexedFlowId, repoRoot, branch });
    } catch {
      return null;
    }
  }
  async resolveBinding(input) {
    if (input.flowId) {
      const byId = this.getByFlowId(input.flowId);
      if (byId)
        return byId;
      return this.rehydrateByFlowId({ flowId: input.flowId, repoRoot: input.repoRoot, branch: input.branch });
    }
    const { repoRoot, branch } = await this.resolveTarget(input);
    const binding = this.bindings.get(bindingKey(repoRoot, branch));
    if (binding)
      return binding;
    const indexedFlowId = await resolveIndexedFlowId({ repoRoot, branch });
    if (indexedFlowId)
      return this.rehydrateByFlowId({ flowId: indexedFlowId, repoRoot, branch });
    throw new Error(`no local flow binding found for (${repoRoot}, ${branch})`);
  }
  async rehydrateByFlowId(input) {
    const raw = await this.backend.request(`/api/flow/${encodeURIComponent(input.flowId)}`);
    const parsed = hydratedFlowResponseSchema.safeParse(JSON.parse(raw));
    if (!parsed.success) {
      throw new Error(`invalid flow response while rehydrating "${input.flowId}"`);
    }
    const flow = parsed.data.flow;
    if (flow.mode !== "local") {
      throw new Error(`cannot bind flow "${input.flowId}": expected mode "local", got "${flow.mode ?? "unknown"}"`);
    }
    const requestedBranch = input.branch?.trim();
    if (requestedBranch && flow.branch && requestedBranch !== flow.branch) {
      throw new Error(`flow "${flow.id}" is bound to branch "${flow.branch}", not "${requestedBranch}"`);
    }
    const { repoRoot, branch } = await resolveRepoBranch({ repoRoot: input.repoRoot, branch: requestedBranch || flow.branch || undefined });
    const repoName = basename3(repoRoot);
    if (flow.workspace && repoName !== flow.workspace) {
      throw new Error(`flow "${flow.id}" belongs to workspace "${flow.workspace}", not "${repoName}"`);
    }
    const config = await loadWorkflowConfig(repoRoot);
    if (!config)
      throw new Error(`no .nosta/workflow.json found in ${repoRoot}`);
    const binding = this.attachBinding({ repoRoot, branch, flowId: flow.id, config });
    const hydrated = this.applyHydratedFlow(binding, flow);
    if (!await readLocalFlow(flow.id)) {
      await saveLocalFlow(emptyLocalFlow({ flowId: flow.id, repoRoot, branch, now: this.now() }));
    }
    return hydrated;
  }
  applyHydratedFlow(binding, flow) {
    const now = this.now();
    if (flow.values && Object.keys(flow.values).length > 0) {
      binding.values = { ...flow.values };
    }
    for (const step of flow.steps ?? []) {
      const nodeState = Object.hasOwn(binding.nodes, step.id) ? binding.nodes[step.id] : undefined;
      if (nodeState) {
        const mapped = step.status ? mapEventStatus(step.status) : null;
        if (mapped)
          nodeState.status = mapped;
        if (step.summary)
          nodeState.summary = step.summary;
        nodeState.updatedAt = now;
      }
    }
    advanceCurrentNode(binding, now);
    return binding;
  }
  attachBinding(input) {
    const key = bindingKey(input.repoRoot, input.branch);
    const now = this.now();
    const nodes = {};
    input.config.nodes.forEach((id, idx) => {
      nodes[id] = { id, status: idx === 0 ? "active" : "pending", updatedAt: now };
    });
    const binding = {
      repoRoot: input.repoRoot,
      branch: input.branch,
      flowId: input.flowId,
      config: input.config,
      currentNode: input.config.nodes[0] ?? null,
      nodes,
      bypassUntil: null,
      bypassReason: null,
      observed: [],
      lastEventSeq: 0,
      updatedAt: now
    };
    const existing = this.bindings.get(key);
    if (existing) {
      this.streams.get(existing.flowId)?.close();
      this.streams.delete(existing.flowId);
      this.flowIndex.delete(existing.flowId);
    }
    this.bindings.set(key, binding);
    this.flowIndex.set(input.flowId, key);
    this.startBindingStream(input.flowId);
    return binding;
  }
  startBindingStream(flowId) {
    if (!this.enableStream || !this.backend.streamUrl)
      return;
    const streamUrl = this.backend.streamUrl(`/api/flow/${encodeURIComponent(flowId)}/stream`);
    const handle = connectFlowStream({
      url: streamUrl,
      token: this.backend.token ?? "",
      fetchImpl: this.fetchImpl,
      baseDelayMs: this.streamBackoff?.baseDelayMs,
      maxDelayMs: this.streamBackoff?.maxDelayMs,
      onEvent: (frame) => this.applyStreamFrame(flowId, frame),
      onError: (error) => {
        console.error(JSON.stringify({
          level: "error",
          component: "nosta-gate",
          event: "sse_stream_error",
          flowId,
          streamUrl,
          lastEventSeq: this.getByFlowId(flowId)?.lastEventSeq ?? 0,
          error: error instanceof Error ? error.message : String(error)
        }));
      }
    });
    this.streams.set(flowId, handle);
  }
  applyStreamFrame(flowId, frame) {
    const binding = this.getByFlowId(flowId);
    if (!binding)
      return;
    const parsed = stepEventSchema.safeParse(frame.data);
    if (!parsed.success)
      return;
    const event = parsed.data;
    const eventSeq = event.seq > 0 ? event.seq : frame.id ?? 0;
    if (eventSeq > 0 && eventSeq <= binding.lastEventSeq)
      return;
    if (eventSeq > 0)
      binding.lastEventSeq = eventSeq;
    const stepId = event.stepId;
    const mapped = mapEventStatus(event.status);
    if (!stepId || !mapped || !Object.hasOwn(binding.nodes, stepId))
      return;
    if (binding.config.approvalNodes.includes(stepId) && mapped === "complete")
      return;
    if (mapped === "complete" && binding.currentNode !== stepId)
      return;
    const now = this.now();
    const target = binding.nodes[stepId];
    target.status = mapped;
    if (event.summary.length > 0)
      target.summary = event.summary;
    target.updatedAt = now;
    advanceCurrentNode(binding, now);
  }
  async persistAndCommit(binding, mutate) {
    const key = bindingKey(binding.repoRoot, binding.branch);
    const draft = cloneBinding(binding);
    const now = this.now();
    mutate(draft, now);
    const report = buildCloudReport(draft, now);
    await this.backend.request(`/api/flow/${encodeURIComponent(binding.flowId)}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report)
    });
    const current = this.bindings.get(key);
    if (current !== binding) {
      throw new Error(`flow binding for (${binding.repoRoot}, ${binding.branch}) changed before commit`);
    }
    const nextBinding = {
      ...current,
      nodes: draft.nodes,
      ...draft.values ? { values: draft.values } : {},
      currentNode: draft.currentNode,
      updatedAt: draft.updatedAt
    };
    this.bindings.set(key, nextBinding);
    return nextBinding;
  }
  flushReportAsync(binding) {
    const report = buildCloudReport(binding, this.now());
    this.backend.request(`/api/flow/${encodeURIComponent(binding.flowId)}/report`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(report)
    }).catch((error) => {
      console.error(JSON.stringify({
        level: "error",
        component: "nosta-gate",
        event: "report_flush_error",
        flowId: binding.flowId,
        error: error instanceof Error ? error.message : String(error)
      }));
    });
  }
  activeBypass(repoRoot, branch) {
    const key = bindingKey(repoRoot, branch);
    const entry = this.bypasses.get(key);
    if (!entry)
      return null;
    if (this.now() >= entry.until) {
      this.bypasses.delete(key);
      return null;
    }
    return entry;
  }
}

// src/packet.ts
import { readFile as readFile4, realpath, stat } from "node:fs/promises";
import { basename as basename4, relative as relative2, sep as sep2 } from "node:path";

// ../../packages/shared/src/runtime/hybrid.ts
var MAX_STEP_ARTIFACTS = 64;
var MAX_STEP_ARTIFACT_BYTES = 32 * 1024 * 1024;
var REPO_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/i;
var WORKSPACE_NAME = /^[a-z0-9][a-z0-9._-]{0,63}$/;
var SHA256_HEX = /^[0-9a-f]{64}$/;
var COMMIT_HEX = /^[0-9a-f]{40}$/;
var SECRET_SUFFIXES = [".key", ".pem", ".p12", ".p8", ".pfx"];
var SECRET_BASENAMES = new Set(["secrets", ".dev.vars", "id_rsa", "id_ed25519", "id_ecdsa", "id_dsa"]);
function normalizeRelativePath(raw) {
  return raw.replaceAll("\\", "/").replace(/^(?:\.\/)+/, "").replace(/\/+$/, "");
}
function isSafeRelativePath(raw) {
  if (!raw || raw.includes("\x00"))
    return false;
  const slash = raw.replaceAll("\\", "/");
  if (slash.startsWith("/") || /^[A-Za-z]:/.test(slash))
    return false;
  const cleaned = normalizeRelativePath(slash);
  if (!cleaned || cleaned === ".")
    return false;
  const parts = cleaned.split("/");
  return parts.every((part) => part.length > 0 && part !== "." && part !== "..");
}
function isSafeMountPath(raw) {
  const cleaned = raw.replaceAll("\\", "/").replace(/\/+$/, "");
  if (cleaned === "" || cleaned === "." || cleaned === "./")
    return true;
  return isSafeRelativePath(cleaned);
}
function isSecretPath(raw) {
  const cleaned = normalizeRelativePath(raw);
  if (!cleaned)
    return false;
  const parts = cleaned.split("/");
  for (const part of parts) {
    const lower = part.toLowerCase();
    if (SECRET_BASENAMES.has(lower) || lower.startsWith(".env"))
      return true;
  }
  const base = (parts[parts.length - 1] ?? "").toLowerCase();
  return SECRET_SUFFIXES.some((suffix) => base.endsWith(suffix));
}
var bundleRepoManifestSchema = object({
  name: string2().regex(REPO_NAME),
  mountPath: string2().min(1).max(240).refine(isSafeMountPath, "unsafe mount path"),
  commitSha: string2().regex(COMMIT_HEX).optional(),
  branch: string2().min(1).max(200).optional(),
  dirty: boolean2(),
  patchPath: string2().min(1).max(240).refine(isSafeRelativePath, "unsafe patch path").optional(),
  patchApplied: boolean2().optional(),
  untrackedPaths: array(string2().refine(isSafeRelativePath, "unsafe untracked path")).optional(),
  deletedPaths: array(string2().refine(isSafeRelativePath, "unsafe deleted path")).optional()
});
var bundleManifestSchema = object({
  version: literal(1),
  workspace: string2().regex(WORKSPACE_NAME),
  primaryRepo: string2().regex(REPO_NAME),
  repos: array(bundleRepoManifestSchema).min(1).max(32)
});
var bundlePointerSchema = object({
  workspace: string2().regex(WORKSPACE_NAME),
  sha: string2().regex(SHA256_HEX),
  commitSha: string2(),
  bytes: number2().int().min(1),
  createdAt: number2().int().min(0),
  dirty: boolean2().optional(),
  repoCount: number2().int().min(1).optional()
});
var stepArtifactSchema = object({
  path: string2().refine(isSafeRelativePath, "unsafe artifact path"),
  contentBase64: string2(),
  bytes: number2().int().min(0),
  sha256: string2().regex(SHA256_HEX)
});
var cloudStepRequestSchema = object({
  workspace: string2().min(1).max(64),
  workflowName: string2().min(1).max(64),
  stepId: string2().min(1).max(64),
  bundleSha: string2().regex(SHA256_HEX),
  force: boolean2().optional(),
  values: record(string2(), string2()).optional(),
  pullOutputs: boolean2().optional(),
  outputPaths: array(string2().refine(isSafeRelativePath, "unsafe output path")).max(MAX_STEP_ARTIFACTS).optional()
});
var cloudStepReplySchema = stepRecordSchema.and(object({
  values: record(string2(), string2()).optional(),
  artifacts: array(stepArtifactSchema).optional()
}));

// src/packet.ts
async function assertReadableWorkspaceFile(filePath, rootDir = process.env.NOSTA_WORKSPACE_ROOT || process.cwd()) {
  const [resolvedRoot, resolvedFile] = await Promise.all([realpath(rootDir), realpath(filePath)]);
  const rel = relative2(resolvedRoot, resolvedFile);
  if (!rel || rel.startsWith("..") || rel.startsWith(sep2)) {
    throw new Error(`path outside workspace root is not allowed: ${filePath}`);
  }
  const normalizedRel = rel.split(sep2).join("/");
  if (isSecretPath(normalizedRel)) {
    throw new Error(`secret path is not allowed: ${normalizedRel}`);
  }
  return resolvedFile;
}
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
  const safePaths = [];
  let totalBytes = 0;
  for (const path of paths) {
    const resolved = await assertReadableWorkspaceFile(path);
    totalBytes += (await stat(resolved)).size;
    if (totalBytes > MAX_PACKET_BYTES) {
      throw new Error("packet exceeds 256 KiB");
    }
    safePaths.push(resolved);
  }
  const files = [];
  for (const path of safePaths) {
    files.push({
      name: basename4(path),
      content: await readFile4(path, "utf8")
    });
  }
  const result = validatePacket({ title: args.title, files });
  if (!result.ok)
    throw new Error(result.error);
  return result.packet;
}

// src/sync.ts
import { createHash } from "node:crypto";
import { readFile as readFile5 } from "node:fs/promises";
import { basename as basename5 } from "node:path";

// src/transport.ts
import { randomUUID as randomUUID3 } from "node:crypto";

// ../../packages/shared/src/security.ts
function isLoopbackHost(hostname) {
  const lower = hostname.toLowerCase().replace(/^\[|\]$/g, "").replace(/\.+$/, "");
  return lower === "localhost" || lower === "127.0.0.1" || lower === "::1" || lower.endsWith(".localhost");
}

// src/transport.ts
var flowIdReplySchema = object({ flow: object({ id: string2() }) });
function validateBaseUrl(rawUrl) {
  const normalized = rawUrl.replace(/\/+$/, "");
  let parsed;
  try {
    parsed = new URL(normalized);
  } catch {
    throw new Error("NOSTA_BACKEND_URL must use https:// or http://");
  }
  if (parsed.protocol === "http:" && !isLoopbackHost(parsed.hostname)) {
    throw new Error("NOSTA_BACKEND_URL must use https:// for non-loopback hosts");
  }
  if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
    throw new Error("NOSTA_BACKEND_URL must use https:// or http://");
  }
  return normalized;
}
async function sendText(cfg, req) {
  const init = req.init ?? {};
  const headers = new Headers(init.headers);
  headers.set("authorization", `Bearer ${cfg.token}`);
  if (cfg.actor && !headers.has("x-nosta-actor"))
    headers.set("x-nosta-actor", cfg.actor);
  const method = (init.method ?? "GET").toUpperCase();
  const res = await cfg.fetch(`${cfg.baseUrl}${req.path}`, {
    ...init,
    headers,
    signal: init.signal ?? AbortSignal.timeout(cfg.timeoutMs)
  });
  const text = await res.text();
  if (!res.ok)
    throw new Error(`nosta ${method} ${req.path} failed (${res.status}): ${text.slice(0, 300)}`);
  return text;
}
async function sendJson(cfg, req) {
  const headers = {
    authorization: `Bearer ${cfg.token}`,
    ...cfg.actor ? { "x-nosta-actor": cfg.actor } : {},
    ...req.body !== undefined ? { "content-type": "application/json" } : {},
    ...req.headers ?? {}
  };
  const res = await cfg.fetch(`${cfg.baseUrl}${req.path}`, {
    method: req.method,
    headers,
    ...req.body !== undefined ? { body: JSON.stringify(req.body) } : {},
    signal: AbortSignal.timeout(cfg.timeoutMs)
  });
  if (req.allow404 && res.status === 404)
    return null;
  const text = await res.text();
  if (!res.ok)
    throw new Error(`nosta ${req.method} ${req.path} failed (${res.status}): ${text.slice(0, 300)}`);
  return text ? JSON.parse(text) : {};
}
function bundleHeaders(input) {
  return {
    "content-type": "application/gzip",
    "x-bundle-sha256": input.sha256,
    ...input.commitSha ? { "x-bundle-commit": input.commitSha } : {},
    ...input.dirty !== undefined ? { "x-bundle-dirty": input.dirty ? "1" : "0" } : {},
    ...input.repoCount !== undefined ? { "x-bundle-repos": String(input.repoCount) } : {}
  };
}
function createNostaTransport(config) {
  const cfg = {
    baseUrl: validateBaseUrl(config.baseUrl),
    token: config.token,
    actor: config.actor,
    timeoutMs: config.timeoutMs ?? 120000,
    fetch: config.fetch ?? fetch
  };
  return {
    baseUrl: cfg.baseUrl,
    token: cfg.token,
    streamUrl(path) {
      return `${cfg.baseUrl}${path}`;
    },
    request(path, init) {
      return sendText(cfg, { path, init });
    },
    requestJson(req) {
      return sendJson(cfg, req);
    },
    async getLatestBundle(workspace) {
      const raw = await sendJson(cfg, { method: "GET", path: `/api/bundles/${encodeURIComponent(workspace)}/latest`, allow404: true });
      return raw === null ? null : bundlePointerSchema.parse(raw);
    },
    async putBundle(input) {
      const text = await sendText(cfg, {
        path: `/api/bundles/${encodeURIComponent(input.workspace)}`,
        init: { method: "PUT", headers: bundleHeaders(input), body: Buffer.from(input.bytes) }
      });
      return bundlePointerSchema.parse(JSON.parse(text));
    },
    async createLocalFlow(input) {
      return flowIdReplySchema.parse(await sendJson(cfg, { method: "POST", path: "/api/flow", body: { mode: "local", ...input } }));
    },
    async reportFlow(input) {
      const { flowId, ...body } = input;
      return flowIdReplySchema.parse(await sendJson(cfg, { method: "POST", path: `/api/flow/${encodeURIComponent(flowId)}/report`, body }));
    },
    async runCloudStep(input) {
      const { flowId, ...body } = input;
      const raw = await sendJson(cfg, { method: "POST", path: getRunCloudStepUrl(encodeURIComponent(flowId)), body });
      return cloudStepReplySchema.parse(raw);
    },
    async startYamlFlow(input) {
      const { idempotencyKey, ...rest } = input;
      return flowIdReplySchema.parse(await sendJson(cfg, { method: "POST", path: "/api/flow", body: { mode: "yaml", ...rest }, headers: { "Idempotency-Key": idempotencyKey } }));
    },
    async getFlow(flowId) {
      return await sendJson(cfg, { method: "GET", path: `/api/flow/${encodeURIComponent(flowId)}` });
    },
    listFlowEvents(flowId) {
      return sendText(cfg, { path: getListFlowEventsUrl(encodeURIComponent(flowId)) });
    },
    approveFlow(input) {
      const { flowId, ...rest } = input;
      const decisionId = rest.decisionId && rest.decisionId.length > 0 ? rest.decisionId : randomUUID3();
      const body = { ...rest, decisionId };
      return sendText(cfg, {
        path: getApproveFlowUrl(encodeURIComponent(flowId)),
        init: { method: "POST", headers: { "content-type": "application/json", "Idempotency-Key": decisionId }, body: JSON.stringify(body) }
      });
    }
  };
}
function publishPage(backend, page) {
  const body = {
    ticket: page.ticket,
    name: page.name,
    title: page.title,
    stepId: page.stepId ?? "",
    html: page.html,
    ...page.slot ? { slot: page.slot } : {},
    ...page.flowId ? { flowId: page.flowId } : {},
    ...page.linkedTo && page.linkedTo.length > 0 ? { linkedTo: page.linkedTo } : {}
  };
  return backend.request("/api/pages", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify(body)
  });
}
function transportFromEnv(env = process.env) {
  return createNostaTransport({
    baseUrl: env.NOSTA_BACKEND_URL ?? "http://127.0.0.1:18086",
    token: env.NOSTA_PLUGIN_TOKEN ?? "",
    timeoutMs: 30000
  });
}

// src/sync.ts
var DATA_CHANGE_PATH = /(?:^|\/)(?:migrations\/|prisma\/migrations\/|drizzle\/|alembic\/versions\/|schema\.sql$|[^/]+\.sql$)/i;
var MAX_SYNC_DIFF_BYTES = 512 * 1024;
var syncDocInputSchema = object({
  id: string2().min(1).max(160),
  title: string2().min(1).max(200),
  slot: flowDocSlotSchema.optional(),
  name: string2().min(1).max(200).optional(),
  sourcePath: string2().min(1).optional(),
  html: string2().min(1).optional(),
  stepId: string2().max(128).optional()
});
var syncEvidenceInputSchema = object({
  id: string2().min(1).max(160),
  title: string2().min(1).max(200),
  name: string2().min(1).max(200).optional(),
  sourcePath: string2().min(1),
  stepId: string2().max(128).optional()
});
var syncCheckInputSchema = object({
  id: string2().min(1).max(100).optional(),
  command: string2().min(1).max(1000),
  exitCode: number2().int(),
  durationMs: number2().int().min(0).optional(),
  summary: string2().max(500).optional(),
  output: string2().optional()
});
var syncReviewInputSchema = object({
  id: string2().min(1).max(100).optional(),
  name: string2().min(1).max(160).optional(),
  model: string2().min(1).max(120).optional(),
  verdict: _enum(["PASS", "FAIL"]),
  findings: array(findingSchema).max(100).optional(),
  durationMs: number2().int().min(0).optional(),
  summary: string2().max(500).optional(),
  output: string2().optional(),
  usage: usageSchema.optional()
});
var syncDiffOptionSchema = union([
  boolean2(),
  object({
    base: string2().min(1).max(200).optional(),
    head: string2().min(1).max(200).optional()
  })
]);
var flowSyncInputSchema = object({
  flowId: string2().min(1).optional().describe("Existing Flow ID to sync. Resolved from repoRoot/branch or ticket if omitted."),
  repoRoot: string2().optional().describe("Git repository root for resolving the bound Flow or computing git diff."),
  branch: string2().optional().describe("Git branch name for resolving the bound Flow."),
  base: string2().optional().describe("Base branch/ref for git diff (defaults to main)."),
  ticket: string2().optional().describe("Ticket identifier for artifact storage and index lookup."),
  status: _enum(["running", "complete", "errored"]).optional().describe("Flow report status (default running)."),
  tabs: array(flowTabSchema).max(16).optional().describe("Optional custom modular Flow tabs for this flow."),
  docs: array(syncDocInputSchema).max(64).optional().describe("HTML documents to upload (by sha256) and attach to flow.docs."),
  evidence: array(syncEvidenceInputSchema).max(64).optional().describe("Media or HTML evidence files to upload and attach to flow.evidence."),
  checks: array(syncCheckInputSchema).max(64).optional().describe("Timed command gate runs recorded as kind=command steps."),
  review: syncReviewInputSchema.optional().describe("Review run recorded as kind=agent, role=review step."),
  diff: syncDiffOptionSchema.optional().describe("Compute and upload git diff + summary (files, migrations, +/- counts) in repoRoot."),
  pr: object({ url: string2().url(), number: number2().int().positive(), base: string2().min(1) }).optional(),
  ship: flowShipMetaSchema.partial().optional().describe("Optional ship risk, deployOrder, and notes."),
  values: record(string2(), string2()).optional().describe("Optional string metadata merged into flow.values."),
  endState: string2().optional(),
  spec: string2().optional()
});
function sha256Of(data) {
  return createHash("sha256").update(data).digest("hex");
}
function slugOf(raw, fallback) {
  const clean = raw.replace(/[^A-Za-z0-9._-]+/g, "-").replace(/^-+|-+$/g, "");
  return (clean || fallback).slice(0, 180);
}
function stepIdFor(prefix, seed) {
  const slug = slugOf(seed.toLowerCase(), prefix).slice(0, 48);
  const digest = sha256Of(seed).slice(0, 8);
  return `${prefix}-${slug}-${digest}`.slice(0, 100);
}
function upsertById(list, item) {
  const next = [...list];
  const idx = next.findIndex((entry) => entry.id === item.id);
  if (idx === -1)
    next.push(item);
  else
    next[idx] = item;
  return next;
}
function truncateDiff(raw) {
  if (!raw.trim())
    return { text: null, truncated: false };
  const encoded = Buffer.from(raw, "utf8");
  if (encoded.byteLength <= MAX_SYNC_DIFF_BYTES)
    return { text: raw, truncated: false };
  return { text: encoded.subarray(0, MAX_SYNC_DIFF_BYTES).toString("utf8"), truncated: true };
}
async function resolveTargetFlowId(input) {
  let repoRoot = input.args.repoRoot;
  let branch = input.args.branch;
  if (!repoRoot || !branch) {
    try {
      const resolved = await resolveRepoBranch({ repoRoot, branch });
      repoRoot = resolved.repoRoot;
      branch = resolved.branch;
    } catch {}
  }
  const flowId = input.args.flowId ?? await resolveIndexedFlowId({ repoRoot, branch, ticket: input.args.ticket, stateDir: input.stateDir });
  if (!flowId) {
    throw new Error("no flow bound for this repo/branch or ticket; pass flowId or start a flow with nosta_flow_start");
  }
  return { flowId, repoRoot, branch };
}
async function syncDocs(input) {
  let uploaded = 0;
  const refs = [];
  for (const doc of input.docs) {
    const html = doc.html ?? (doc.sourcePath ? await readFile5(await assertReadableWorkspaceFile(doc.sourcePath, input.state.repoRoot), "utf8") : "");
    if (!html)
      throw new Error(`doc "${doc.id}" requires either html or sourcePath`);
    const bytes = new TextEncoder().encode(html).byteLength;
    const sha256 = sha256Of(html);
    const name = slugOf(doc.name ?? doc.id, "doc");
    const slot = doc.slot ?? "artifact";
    const existing = input.state.docs.find((entry) => entry.id === doc.id);
    if (!existing || existing.sha256 !== sha256 || existing.title !== doc.title || existing.name !== name || existing.ticket !== input.ticket || existing.slot !== slot) {
      await publishPage(input.backend, {
        ticket: input.ticket,
        name,
        title: doc.title,
        stepId: doc.stepId ?? "",
        slot,
        html,
        flowId: input.state.flowId
      });
      uploaded += 1;
    }
    refs.push({
      id: doc.id,
      ticket: input.ticket,
      name,
      title: doc.title,
      slot,
      stepId: doc.stepId ?? null,
      sha256,
      bytes,
      createdAt: input.now
    });
  }
  return { refs, uploaded };
}
async function syncEvidence(input) {
  let uploaded = 0;
  const refs = [];
  for (const item of input.evidence) {
    const safePath = await assertReadableWorkspaceFile(item.sourcePath, input.state.repoRoot);
    const raw = await readFile5(safePath);
    const name = slugOf(item.name ?? basename5(safePath), "evidence.txt");
    const isHtml = name.toLowerCase().endsWith(".html") || name.toLowerCase().endsWith(".htm");
    const contentType = isHtml ? "text/html; charset=utf-8" : mediaContentType(name);
    if (!contentType)
      throw new Error(`unsupported evidence file extension: ${name}`);
    const sha256 = sha256Of(raw);
    const existing = input.state.evidence.find((entry) => entry.id === item.id);
    if (!existing || existing.sha256 !== sha256 || existing.title !== item.title || existing.name !== name || existing.ticket !== input.ticket) {
      if (isHtml) {
        await publishPage(input.backend, {
          ticket: input.ticket,
          name,
          title: item.title,
          stepId: item.stepId ?? "",
          slot: "evidence",
          html: raw.toString("utf8"),
          flowId: input.state.flowId
        });
      } else {
        const qs = new URLSearchParams({ title: item.title, flowId: input.state.flowId, slot: "evidence" });
        if (item.stepId)
          qs.set("stepId", item.stepId);
        await input.backend.request(`/api/media/${encodeURIComponent(input.ticket)}/${encodeURIComponent(name)}?${qs.toString()}`, {
          method: "PUT",
          headers: { "content-type": contentType },
          body: new Uint8Array(raw)
        });
      }
      uploaded += 1;
    }
    refs.push({
      id: item.id,
      ticket: input.ticket,
      name,
      title: item.title,
      kind: isHtml ? "html" : "media",
      contentType,
      stepId: item.stepId ?? null,
      sha256,
      bytes: raw.byteLength,
      createdAt: input.now
    });
  }
  return { refs, uploaded };
}
async function computeDiff(input) {
  const mergeBase = await runGit(input.repoRoot, ["merge-base", input.base, input.head]) ?? input.base;
  const numstat = await runGit(input.repoRoot, ["diff", "--numstat", `${mergeBase}..${input.head}`]) ?? "";
  const rawDiff = await runGit(input.repoRoot, ["diff", `${mergeBase}..${input.head}`]) ?? "";
  const headSha = await runGit(input.repoRoot, ["rev-parse", input.head]) ?? input.head;
  const files = [];
  const migrations = [];
  let additions = 0;
  let deletions = 0;
  for (const line of numstat.split(/\r?\n/)) {
    if (!line.trim())
      continue;
    const [rawAdd, rawDel, ...rest] = line.split("\t");
    const file = rest.join("\t").trim();
    if (!file)
      continue;
    files.push(file);
    if (DATA_CHANGE_PATH.test(file))
      migrations.push(file);
    const add = Number(rawAdd);
    const del = Number(rawDel);
    if (Number.isFinite(add))
      additions += add;
    if (Number.isFinite(del))
      deletions += del;
  }
  const { text: diff, truncated: diffTruncated } = truncateDiff(rawDiff);
  return {
    summary: {
      base: input.base,
      head: headSha,
      ticket: null,
      name: null,
      files: files.slice(0, 500),
      migrations: migrations.slice(0, 200),
      additions,
      deletions,
      sha256: sha256Of(`${mergeBase}:${headSha}:${numstat}`)
    },
    diff,
    diffTruncated
  };
}
function buildSteps(args, now) {
  const steps = [];
  for (const check of args.checks ?? []) {
    steps.push({
      id: check.id ?? stepIdFor("gate", check.command),
      name: check.command.slice(0, 160),
      kind: "command",
      status: check.exitCode === 0 ? "complete" : "errored",
      command: check.command,
      exitCode: check.exitCode,
      durationMs: check.durationMs ?? null,
      summary: check.summary ?? `${check.exitCode === 0 ? "PASS" : `exit ${check.exitCode}`}`,
      output: check.output ?? ""
    });
  }
  if (args.review) {
    const rev = args.review;
    steps.push({
      id: rev.id ?? stepIdFor("review", `${rev.name ?? "review"}-${rev.model ?? "agent"}-${now}`),
      name: rev.name ?? "Code review",
      kind: "agent",
      role: "review",
      status: "complete",
      model: rev.model ?? null,
      verdict: rev.verdict,
      findings: rev.findings ?? [],
      durationMs: rev.durationMs ?? null,
      summary: rev.summary ?? `${rev.verdict} (${rev.findings?.length ?? 0} findings)`,
      output: rev.output ?? "",
      ...rev.usage ? { usage: rev.usage } : {}
    });
  }
  return steps;
}
function mergeShip(existing, incoming) {
  if (!incoming)
    return existing;
  return {
    risk: incoming.risk ?? existing?.risk ?? null,
    deployOrder: incoming.deployOrder ?? existing?.deployOrder ?? null,
    notes: [...new Set([...existing?.notes ?? [], ...incoming.notes ?? []])]
  };
}
function mergeRefs(existing, incoming) {
  let out = existing;
  for (const ref of incoming)
    out = upsertById(out, ref);
  return out;
}
async function resolveComputedDiff(input) {
  if (!input.args.diff)
    return null;
  const repoRoot = input.repoRoot ?? input.existing.repoRoot;
  if (!repoRoot)
    throw new Error("diff sync requires a git repository (pass repoRoot)");
  const diffOpts = typeof input.args.diff === "object" ? input.args.diff : {};
  const base = diffOpts.base ?? input.args.base ?? input.existing.base ?? "main";
  const head = diffOpts.head ?? "HEAD";
  return computeDiff({ repoRoot, base, head });
}
async function attachPublishedArtifact(input) {
  const now = input.now ?? Date.now();
  const sha256 = sha256Of(input.html);
  const existing = await readLocalFlow(input.flowId, input.stateDir) ?? emptyLocalFlow({ flowId: input.flowId, ticket: input.ticket, now });
  const isEvidence = input.slot === "evidence";
  const docRef = isEvidence ? null : {
    id: input.name,
    ticket: input.ticket,
    name: input.name,
    title: input.title,
    slot: input.slot,
    stepId: input.stepId || null,
    sha256,
    bytes: input.bytes,
    createdAt: now
  };
  const evidenceRef = isEvidence ? {
    id: input.name,
    ticket: input.ticket,
    name: input.name,
    title: input.title,
    kind: "html",
    contentType: "text/html; charset=utf-8",
    stepId: input.stepId || null,
    sha256,
    bytes: input.bytes,
    createdAt: now
  } : null;
  await input.backend.request(`/api/flow/${encodeURIComponent(input.flowId)}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status: "running",
      finishedAt: null,
      steps: [],
      ...docRef ? { docs: [docRef] } : {},
      ...evidenceRef ? { evidence: [evidenceRef] } : {}
    })
  });
  await saveLocalFlow({
    ...existing,
    ticket: existing.ticket ?? input.ticket,
    docs: docRef ? mergeRefs(existing.docs, [docRef]) : existing.docs,
    evidence: evidenceRef ? mergeRefs(existing.evidence, [evidenceRef]) : existing.evidence,
    updatedAt: now
  }, input.stateDir);
}
async function syncFlow(input) {
  const now = (input.now ?? Date.now)();
  const resolved = await resolveTargetFlowId({ args: input.args, stateDir: input.stateDir });
  const existing = await readLocalFlow(resolved.flowId, input.stateDir) ?? emptyLocalFlow({ flowId: resolved.flowId, repoRoot: resolved.repoRoot, branch: resolved.branch, base: input.args.base, ticket: input.args.ticket, now });
  const ticket = input.args.ticket ?? existing.ticket ?? resolved.flowId;
  const docOut = input.args.docs ? await syncDocs({ state: existing, docs: input.args.docs, ticket, backend: input.backend, now }) : { refs: [], uploaded: 0 };
  const evOut = input.args.evidence ? await syncEvidence({ state: existing, evidence: input.args.evidence, ticket, backend: input.backend, now }) : { refs: [], uploaded: 0 };
  const computedDiff = await resolveComputedDiff({ args: input.args, existing, repoRoot: resolved.repoRoot });
  const diffSummary = computedDiff ? computedDiff.summary : existing.diffSummary;
  const ship = mergeShip(existing.ship, input.args.ship);
  const steps = buildSteps(input.args, now);
  const status = input.args.status ?? "running";
  const tabs = input.args.tabs !== undefined ? input.args.tabs : existing.tabs;
  await input.backend.request(`/api/flow/${encodeURIComponent(resolved.flowId)}/report`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      status,
      finishedAt: status === "running" ? null : now,
      steps,
      ...docOut.refs.length > 0 ? { docs: docOut.refs } : {},
      ...evOut.refs.length > 0 ? { evidence: evOut.refs } : {},
      ...computedDiff ? { diffSummary: computedDiff.summary, diff: computedDiff.diff, diffTruncated: computedDiff.diffTruncated } : {},
      ...input.args.tabs !== undefined ? { tabs: input.args.tabs } : {},
      ...input.args.ship ? { ship } : {},
      ...input.args.pr ? { pr: input.args.pr } : {},
      ...input.args.values ? { values: input.args.values } : {},
      ...input.args.endState !== undefined ? { endState: input.args.endState } : {},
      ...input.args.spec !== undefined ? { spec: input.args.spec } : {},
      ...resolved.branch ? { branch: resolved.branch } : {}
    })
  });
  await saveLocalFlow({
    ...existing,
    ...resolved.repoRoot ? { repoRoot: resolved.repoRoot } : {},
    ...resolved.branch ? { branch: resolved.branch } : {},
    ...input.args.base ? { base: input.args.base } : {},
    ...tabs !== undefined ? { tabs } : {},
    ticket,
    docs: mergeRefs(existing.docs, docOut.refs),
    evidence: mergeRefs(existing.evidence, evOut.refs),
    diffSummary,
    ship,
    updatedAt: now
  }, input.stateDir);
  return {
    flowId: resolved.flowId,
    uploadedDocs: docOut.uploaded,
    uploadedEvidence: evOut.uploaded,
    stepsReported: steps.length,
    diffSummary,
    ...tabs !== undefined ? { tabs } : {},
    flowUrl: `${input.backend.baseUrl}/flows/${encodeURIComponent(resolved.flowId)}`
  };
}

// src/flow.ts
function trimmed(value) {
  if (typeof value !== "string")
    return;
  const clean = value.trim();
  return clean.length > 0 ? clean : undefined;
}
var flowStartInputSchema = object({
  mode: _enum(["spec", "review", "local"]).optional().describe("Optional explicit flow mode."),
  path: string2().optional().describe("Absolute path of a local spec file (spec mode)."),
  baseSha: string2().optional().describe("40-hex Git SHA from the caller's checkout (spec mode)."),
  ticketUrl: string2().optional().describe("HTTPS URL of the ticket this flow runs for."),
  paths: array(string2()).optional().describe("Absolute paths of 1..32 text files to review, 256 KiB total (review mode)."),
  title: string2().optional().describe("Optional flow title (review or local mode)."),
  parentId: string2().optional().describe("Optional parent flow ID to attach this local flow to."),
  repoRoot: string2().optional().describe("Git repository root containing .nosta/workflow.json (local mode)."),
  branch: string2().optional().describe("Git branch name to bind (local mode; defaults to current branch)."),
  base: string2().optional().describe("Optional base branch name (local mode)."),
  ticket: string2().optional().describe("Optional ticket key/identifier (local mode)."),
  endState: string2().optional().describe("Optional target end state summary (local mode)."),
  spec: string2().optional().describe("Optional inline spec markdown text (local mode)."),
  tabs: array(flowTabSchema).max(16).optional().describe("Optional custom modular Flow tabs (local mode; defaults to workflow.json tabs or standard lifecycle tabs)."),
  values: record(string2(), string2()).optional().describe("Optional string key/value metadata map (local mode).")
}).superRefine((data, ctx) => {
  const hasSpec = data.path !== undefined;
  const hasReview = data.paths !== undefined;
  const isLocal = data.mode === "local" || !hasSpec && !hasReview && (data.repoRoot !== undefined || data.branch !== undefined);
  if (hasSpec && hasReview) {
    ctx.addIssue({ code: "custom", message: "provide either { path, baseSha, ticketUrl } or { paths }, not both" });
    return;
  }
  if (data.mode !== "local" && hasSpec) {
    if (!data.path)
      ctx.addIssue({ code: "custom", path: ["path"], message: "path must be a string" });
    if (!data.baseSha)
      ctx.addIssue({ code: "custom", path: ["baseSha"], message: "baseSha must be a string" });
    if (!data.ticketUrl)
      ctx.addIssue({ code: "custom", path: ["ticketUrl"], message: "ticketUrl must be a string" });
    return;
  }
  if (!isLocal && !hasSpec && !hasReview) {
    ctx.addIssue({
      code: "custom",
      message: "provide { path, baseSha, ticketUrl } for a spec flow, { paths } for a review flow, or { mode: 'local', repoRoot, branch } for a local ticket flow"
    });
  }
});
var flowStatusInputSchema = object({
  flowId: string2().optional().describe("ID from nosta_flow_start."),
  repoRoot: string2().optional().describe("Git repository root to look up a bound local Ticket Flow."),
  branch: string2().optional().describe("Git branch to look up a bound local Ticket Flow.")
});
var flowLogInputSchema = object({
  flowId: string2().min(1).describe("ID from nosta_flow_start.")
});
var flowAdvanceInputSchema = object({
  node: string2().min(1).describe("Name of the active non-approval node to complete."),
  summary: string2().min(1).describe("Evidence summary for this node."),
  flowId: string2().optional().describe("Bound flow ID (optional if repoRoot/branch is provided)."),
  repoRoot: string2().optional().describe("Git repository root (optional if flowId is provided)."),
  branch: string2().optional().describe("Git branch name (optional if flowId is provided)."),
  artifactUrl: string2().optional().describe("Optional artifact/spec/diff URL."),
  prUrl: string2().optional().describe("Optional PR URL."),
  commitSha: string2().optional().describe("Optional Git commit SHA produced by this node."),
  proof: string2().optional().describe("Optional verification proof summary or command result."),
  usage: usageSchema.optional().describe("Optional token usage recorded for this node."),
  values: record(string2(), string2()).optional().describe("Optional metadata merged onto flow values.")
});
var flowApproveInputSchema = object({
  flowId: string2().optional().describe("Flow ID waiting at its approval gate."),
  decision: _enum(["approve", "reject"]).optional(),
  version: number2().int().min(1).optional().describe("Flow version the caller read (cloud merge gate)."),
  attempt: number2().int().min(1).optional().describe("Flow attempt the caller read (cloud merge gate)."),
  decisionId: string2().optional().describe("Optional caller-supplied idempotency key for this decision."),
  node: string2().optional().describe("Approval node name for a local Ticket Flow (e.g. 'go')."),
  repoRoot: string2().optional().describe("Git repository root (local approval node)."),
  branch: string2().optional().describe("Git branch name (local approval node)."),
  approvedBy: string2().optional().describe("Optional approver identifier."),
  summary: string2().optional().describe("Optional approval note.")
}).superRefine((data, ctx) => {
  const node = trimmed(data.node);
  const hasCloudGateArgs = data.version !== undefined || data.attempt !== undefined;
  if (node && hasCloudGateArgs) {
    ctx.addIssue({
      code: "custom",
      message: "provide either { node } for a local approval node or { flowId, decision, version, attempt } for a cloud merge gate, not both"
    });
    return;
  }
  if (!node) {
    if (!data.flowId)
      ctx.addIssue({ code: "custom", path: ["flowId"], message: "flowId must be a string" });
    if (!data.decision)
      ctx.addIssue({ code: "custom", path: ["decision"], message: "decision must be approve or reject" });
    if (data.version === undefined)
      ctx.addIssue({ code: "custom", path: ["version"], message: "version must be a positive integer" });
    if (data.attempt === undefined)
      ctx.addIssue({ code: "custom", path: ["attempt"], message: "attempt must be a positive integer" });
  }
});
var flowBypassInputSchema = object({
  reason: string2().min(1).describe("Mandatory explanation for the temporary workflow bypass."),
  durationMinutes: number2().int().min(1).optional().describe("Bypass duration in minutes (default 30, max 240)."),
  flowId: string2().optional().describe("Bound flow ID (optional if repoRoot/branch is provided)."),
  repoRoot: string2().optional().describe("Git repository root (optional if flowId is provided)."),
  branch: string2().optional().describe("Git branch name (optional if flowId is provided).")
});
function stripSafeIntMax(node) {
  if (Array.isArray(node))
    return node.map(stripSafeIntMax);
  if (!node || typeof node !== "object")
    return node;
  const out = {};
  for (const [key, value] of Object.entries(node)) {
    if (key === "maximum" && value === Number.MAX_SAFE_INTEGER)
      continue;
    if (key === "minimum" && value === Number.MIN_SAFE_INTEGER)
      continue;
    out[key] = stripSafeIntMax(value);
  }
  return out;
}
function toMcpInputSchema(schema) {
  const raw = toJSONSchema(schema, { target: "draft-07" });
  const cleaned = stripSafeIntMax(raw);
  delete cleaned.$schema;
  if (cleaned.additionalProperties === false)
    delete cleaned.additionalProperties;
  return cleaned;
}
var FLOW_TOOLS = [
  {
    name: "nosta_flow_start",
    description: "Start one Nosta flow. Pass { path, baseSha, ticketUrl } for a spec flow, { paths, title? } for a 1-step review flow, or { mode: 'local', repoRoot?, branch?, title?, ticket?, ticketUrl? } to start a local workflow-enforced Ticket Flow.",
    inputSchema: toMcpInputSchema(flowStartInputSchema)
  },
  {
    name: "nosta_flow_status",
    description: "Get one flow with its direct steps, child flow records, and local gate binding status.",
    inputSchema: toMcpInputSchema(flowStatusInputSchema)
  },
  {
    name: "nosta_flow_log",
    description: "Get one flow's ordered step events.",
    inputSchema: toMcpInputSchema(flowLogInputSchema)
  },
  {
    name: "nosta_flow_advance",
    description: "Mark the current non-approval node of a bound local Ticket Flow complete with evidence and report progress to Nosta. Rejects approval nodes and out-of-order jumps.",
    inputSchema: toMcpInputSchema(flowAdvanceInputSchema)
  },
  {
    name: "nosta_flow_approve",
    description: "Approve or reject a cloud flow merge gate ({ flowId, decision, version, attempt }) or record owner approval for an approval node in a bound local Ticket Flow ({ node, decision?, flowId?, repoRoot?, branch?, summary? }).",
    inputSchema: toMcpInputSchema(flowApproveInputSchema)
  },
  {
    name: "nosta_flow_bypass",
    description: "Temporarily unlock gated writes for a (repoRoot, branch) for a bounded duration with a mandatory reason. Always requires explicit owner confirmation.",
    inputSchema: toMcpInputSchema(flowBypassInputSchema)
  },
  {
    name: "nosta_flow_sync",
    description: "Sync local docs, evidence files, command checks, review verdicts, git diff summary, PR link, and ship metadata into the bound Flow object (~/.nosta/flows/) and cloud Flow DO in one idempotent call.",
    inputSchema: toMcpInputSchema(flowSyncInputSchema)
  }
];
function formatZodError(error) {
  return error.issues.map((issue) => {
    const path = issue.path.join(".");
    return path && !issue.message.startsWith(path) ? `${path}: ${issue.message}` : issue.message;
  }).join("; ");
}
function parseToolArgs(schema, args) {
  const parsed = schema.safeParse(args);
  if (!parsed.success)
    throw new Error(formatZodError(parsed.error));
  return parsed.data;
}
async function callFlowTool(input) {
  const gate = input.gate ?? new WorkflowGate({ backend: input.backend, enableStream: false });
  if (input.name === "nosta_flow_start")
    return startFlow({ args: parseToolArgs(flowStartInputSchema, input.args), backend: input.backend, gate });
  if (input.name === "nosta_flow_status")
    return statusFlow({ args: parseToolArgs(flowStatusInputSchema, input.args), backend: input.backend, gate });
  if (input.name === "nosta_flow_log")
    return readLog(parseToolArgs(flowLogInputSchema, input.args), input.backend);
  if (input.name === "nosta_flow_advance")
    return advanceLocal(parseToolArgs(flowAdvanceInputSchema, input.args), gate);
  if (input.name === "nosta_flow_approve")
    return approveFlow({ args: parseToolArgs(flowApproveInputSchema, input.args), backend: input.backend, gate });
  if (input.name === "nosta_flow_bypass")
    return bypassLocal(parseToolArgs(flowBypassInputSchema, input.args), gate);
  if (input.name === "nosta_flow_sync") {
    const result = await syncFlow({ args: parseToolArgs(flowSyncInputSchema, input.args), backend: input.backend });
    return JSON.stringify(result);
  }
  return null;
}
function enrichFlowReply(raw, baseUrl) {
  let parsed;
  try {
    parsed = JSON.parse(raw);
  } catch (error) {
    console.error(`[nosta-mcp] non-JSON flow reply: ${error instanceof Error ? error.message : String(error)}`);
    return raw;
  }
  if (!parsed || typeof parsed !== "object" || Array.isArray(parsed))
    return raw;
  const record2 = parsed;
  const flowObj = record2.flow && typeof record2.flow === "object" ? record2.flow : null;
  const flowId = typeof flowObj?.id === "string" ? flowObj.id : typeof record2.id === "string" ? record2.id : null;
  if (!flowId)
    return raw;
  return JSON.stringify({
    ...record2,
    flowUrl: `${baseUrl}/flows/${encodeURIComponent(flowId)}`
  });
}
async function resolveReviewParentId(args) {
  const explicit = trimmed(args.parentId);
  if (explicit)
    return explicit;
  try {
    const { repoRoot, branch } = await resolveRepoBranch({ repoRoot: trimmed(args.repoRoot), branch: trimmed(args.branch) });
    return await resolveIndexedFlowId({ repoRoot, branch, ticket: trimmed(args.ticket) }) ?? undefined;
  } catch {
    return trimmed(args.ticket) ? await resolveIndexedFlowId({ ticket: trimmed(args.ticket) }) ?? undefined : undefined;
  }
}
async function startReviewFlow(args, backend) {
  const packet = await buildPacket({ paths: args.paths, title: args.title });
  const parentId = await resolveReviewParentId(args);
  const raw = await backend.request("/api/flow", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": randomUUID4() },
    body: JSON.stringify({ mode: "review", title: packet.title, files: packet.files, ...parentId ? { parentId } : {} })
  });
  return enrichFlowReply(raw, backend.baseUrl);
}
async function startSpecFlow(args, backend) {
  const safePath = await assertReadableWorkspaceFile(args.path);
  if ((await stat2(safePath)).size > MAX_PACKET_BYTES) {
    throw new Error("spec exceeds 256 KiB");
  }
  const spec = await readFile6(safePath, "utf8");
  const baseSha = args.baseSha;
  const ticketUrl = args.ticketUrl;
  const key = createHash2("sha256").update(JSON.stringify({ baseSha, ticketUrl, spec })).digest("hex");
  const raw = await backend.request("/api/flow", {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": key },
    body: JSON.stringify({ mode: "spec", spec, baseSha, ticketUrl })
  });
  return enrichFlowReply(raw, backend.baseUrl);
}
async function startFlow(input) {
  const { args, backend, gate } = input;
  const hasSpec = args.path !== undefined;
  const hasReview = args.paths !== undefined;
  const isLocal = args.mode === "local" || !hasSpec && !hasReview && (args.repoRoot !== undefined || args.branch !== undefined);
  if (isLocal) {
    const raw = JSON.stringify(await gate.start({
      parentId: trimmed(args.parentId),
      repoRoot: trimmed(args.repoRoot),
      branch: trimmed(args.branch),
      base: trimmed(args.base),
      title: trimmed(args.title),
      ticket: trimmed(args.ticket),
      ticketUrl: trimmed(args.ticketUrl),
      endState: trimmed(args.endState),
      spec: trimmed(args.spec),
      tabs: args.tabs,
      values: args.values
    }));
    return enrichFlowReply(raw, backend.baseUrl);
  }
  if (hasReview)
    return startReviewFlow(args, backend);
  return startSpecFlow(args, backend);
}
function readLog(args, backend) {
  return backend.request(getListFlowEventsUrl(encodeURIComponent(args.flowId)));
}
async function statusFlow(input) {
  const raw = JSON.stringify(await input.gate.status({
    flowId: trimmed(input.args.flowId),
    repoRoot: trimmed(input.args.repoRoot),
    branch: trimmed(input.args.branch)
  }));
  return enrichFlowReply(raw, input.backend.baseUrl);
}
async function advanceLocal(args, gate) {
  return JSON.stringify(await gate.advance({
    node: args.node,
    summary: args.summary,
    flowId: trimmed(args.flowId),
    repoRoot: trimmed(args.repoRoot),
    branch: trimmed(args.branch),
    artifactUrl: trimmed(args.artifactUrl),
    prUrl: trimmed(args.prUrl),
    commitSha: trimmed(args.commitSha),
    proof: trimmed(args.proof),
    usage: args.usage,
    values: args.values
  }));
}
async function approveFlow(input) {
  const { args, backend, gate } = input;
  const node = trimmed(args.node);
  if (node) {
    return JSON.stringify(await gate.approve({
      node,
      decision: args.decision ?? "approve",
      flowId: trimmed(args.flowId),
      repoRoot: trimmed(args.repoRoot),
      branch: trimmed(args.branch),
      approvedBy: trimmed(args.approvedBy),
      summary: trimmed(args.summary)
    }));
  }
  const decisionId = args.decisionId && args.decisionId.length > 0 ? args.decisionId : randomUUID4();
  const body = {
    decision: args.decision,
    version: args.version,
    attempt: args.attempt,
    decisionId
  };
  const raw = await backend.request(getApproveFlowUrl(encodeURIComponent(args.flowId)), {
    method: "POST",
    headers: { "content-type": "application/json", "Idempotency-Key": decisionId },
    body: JSON.stringify(body)
  });
  return enrichFlowReply(raw, backend.baseUrl);
}
async function bypassLocal(args, gate) {
  return JSON.stringify(await gate.bypass({
    reason: args.reason,
    durationMinutes: args.durationMinutes,
    flowId: trimmed(args.flowId),
    repoRoot: trimmed(args.repoRoot),
    branch: trimmed(args.branch)
  }));
}

// src/artifacts/guides.ts
var ARTIFACT_GUIDE_MODULES = ["spec", "diagram", "diagnostics", "chart", "interactive"];
var CORE_GUIDE = `# Nosta Artifact Design System (Core)

You are authoring fragments for \`nosta_artifact_publish\`. The host shell automatically wraps your tabs to match \`app.nosta.dev\`'s calm monochrome warm-neutral palette, Inter + JetBrains Mono typography, dark/light theme sync, and tab-hash persistence.

## Hard Rules
- Pass **inner HTML fragments only** per tab. Never include \`<!doctype>\`, \`<html>\`, \`<head>\`, or \`<body>\`.
- Never write raw hex colors for surfaces or text; rely on Nosta CSS variables (\`var(--ground)\`, \`var(--surface)\`, \`var(--ink)\`, \`var(--muted)\`, \`var(--line)\`).
- **Keep cards, KPIs, and containers monochrome neutral.** Never color-code sibling cards or KPI boxes. Reserve semantic classes (\`.c-sage\` for pass, \`.c-amber\` for warn, \`.c-terracotta\` for fail) strictly for status badges, trace borders, and progress bars.
- Use Inter for all prose, headings, labels, and KPI values; reserve \`<code>\` / \`.num\` (JetBrains Mono) strictly for code, SHAs, and numeric columns.
- Avoid generic AI slop: no unmotivated gradients, no rainbow card grids, no emoji bullet lists. Optimize for clarity, density, and primary-source links.

## Style Presets (\`style\` param)
- \`nosta-editorial\` (default): Specs, RFCs, alignment docs, and design reviews.
- \`nosta-diagnostic\`: Traces, gate runs, perf profiles, and verification reports.
- \`nosta-blueprint\`: Architecture diagrams, ERDs, and state machines with a subtle dot-grid \`.diagram-stage\`.

## Semantic Status Classes
Use strictly on \`.badge\`, \`.pill\`, \`.trace-row\`, \`.bar-meter\`, or a single lead \`.callout\`:
- \`.c-stone\` / neutral (default): structure, cards, KPIs, queued
- \`.c-ochre\`: subtle primary callout or active accent
- \`.c-sage\`: pass, healthy
- \`.c-amber\`: warning, latency, caution
- \`.c-terracotta\`: fail, error, blocker

## Layout Primitives
\`.stack\`, \`.prose\` (74ch), \`.grid-2\`, \`.grid-3\`, \`.grid-4\`, \`.split\`, \`.card\`, \`.callout\`, \`.badge\`, \`.kpi-grid\` > \`.kpi\` (\`.kpi-label\`, \`.kpi-value\`, \`.kpi-delta\`), \`.table-wrap\` > \`table.data-table\` (\`td.num\`).`;
var MODULE_GUIDES = {
  spec: `## Module: spec
Use \`style: "nosta-editorial"\`.
- Lead the first tab with a one-sentence summary in \`.callout.c-ochre\`, followed by a compact \`.kpi-grid\` or decision table.
- Keep prose inside \`.prose\` (\`74ch\`), breaking long sections with \`<h2>\`, tables (\`.table-wrap > table.data-table\`), and diagrams rather than walls of text.
- Cite every evidence claim with a clickable link and date/version.
- Tab order: newest/executive summary first (\`overview\`), architecture/design second (\`architecture\`), verification/risks/open questions next.`,
  diagram: `## Module: diagram
Choose **inline SVG** for custom layouts, timelines, and annotated schematics; choose **Mermaid** (\`libs: ["mermaid"]\`) for standard C4, Crow's Foot ERDs, state machines, and sequence diagrams.

### Inline SVG Rules
- Wrap in \`<div class="diagram-stage">\` and output \`<svg class="svg-diagram" viewBox="0 0 680 H" width="100%">\`.
- Keep \`viewBox\` width fixed at \`680\` so 1 SVG unit = 1 CSS px; never hardcode a full-canvas background \`<rect>\`.
- Define an arrowhead marker once:
  \`<defs><marker id="nosta-arrow" viewBox="0 0 10 10" refX="8" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M2 1L8 5L2 9" fill="none" stroke="currentColor" stroke-width="1.5"/></marker></defs>\`
- Use \`<g class="node c-slate"><rect x="..." y="..." width="..." height="..."/><text class="t" x="..." y="...">Title</text><text class="ts" x="..." y="...">Subtitle</text></g>\`.
- Use \`<path class="arr" marker-end="url(#nosta-arrow)" d="..."/>\` and \`<line class="leader" .../>\`.

### Mermaid Rules (\`libs: ["mermaid"]\`)
- Wrap in \`<div class="diagram-stage"><pre class="mermaid">...</pre></div>\`.
- **Hard column caps (enforced at publish time):** Never exceed **4 horizontal columns** (\`flowchart LR\` max 4 hops deep; \`flowchart TD\` / \`stateDiagram-v2\` / \`erDiagram\` max 4 nodes wide at any rank) and **max 3 participants for \`sequenceDiagram\`** so sequence labels stay readable on mobile. Prefer \`flowchart TD\` by default or split wide diagrams into multiple focused diagrams.
- On mobile (\`< 640px\`), the shell automatically switches \`LR\`/\`RL\` flowcharts to \`TD\`, scales SVGs to fit 100% of the screen width with \`wrappingWidth: 160\`, and attaches a \`− / 100% / + / Expand\` zoom toolbar to every \`.diagram-stage\`.
- Use \`\\n\` inside quoted labels (never \`<br/>\`) and keep labels concise.
- The shell auto-themes Mermaid for dark and light modes and re-renders on theme toggle.`,
  diagnostics: `## Module: diagnostics
Use \`style: "nosta-diagnostic"\`.
- Start with a \`.kpi-grid\` summarizing totals, pass/fail counts, p95/wall-clock duration, and regressions.
- Add a \`.filter-bar\` with a search \`<input>\` and status \`<select>\` wired to filter \`.trace-row\` elements via data attributes (\`data-status\`, \`data-text\`).
- Render spans/checks/logs as collapsible rows:
  \`<div class="trace-list"><details class="trace-row c-sage" data-status="pass"><summary><span>step name</span><span>142 ms</span></summary><pre><code>...</code></pre></details></div>\`
- Use \`.bar-meter\` (\`<div class="bar-meter c-amber"><span style="width:68%"></span></div>\`) inside tables for relative timing/size comparisons and \`.num\` on every numeric column.`,
  chart: `## Module: chart
Pass \`libs: ["echarts"]\` (Apache ECharts 5, Apache-2.0).
- Place each chart in \`<div id="chart-..." class="chart-box" style="height:320px"></div>\`.
- Register a render callback with \`window.nostaCharts.register(el, (theme) => option)\`:
  \`\`\`html
  <div id="latency-chart" class="chart-box"></div>
  <script>
    window.nostaCharts.register("#latency-chart", (theme) => ({
      tooltip: { trigger: "axis" },
      xAxis: { type: "category", data: ["v1", "v2", "v3"] },
      yAxis: { type: "value", name: "ms" },
      series: [{ name: "p95", type: "bar", data: [240, 118, 42] }]
    }));
  </script>
  \`\`\`
- The shell automatically initializes ECharts with \`nosta-dark\` or \`nosta-light\`, resizes on viewport change, resizes when hidden tabs become visible, and re-themes live when the user toggles dark/light.`,
  interactive: `## Module: interactive
- Keep interactivity vanilla JS inside inline \`<script>\` blocks (runs inside \`sandbox="allow-scripts"\`).
- Use \`window.nostaSelectTab(tabId)\` to jump between tabs from buttons or diagram nodes.
- Add \`libs: ["lucide"]\` for icons (\`<i data-lucide="check-circle"></i>\`, auto-rendered on boot) or \`libs: ["highlight"]\` for syntax-highlighted \`<pre><code class="language-ts">\` blocks.
- Keep state local to the tab container and use event delegation so scripts stay small and resilient.`
};
function renderArtifactGuide(modules) {
  const unique = [...new Set(modules)];
  return [CORE_GUIDE, ...unique.map((mod) => MODULE_GUIDES[mod])].join(`

---

`);
}

// src/artifacts/mermaid.ts
var MAX_MERMAID_COLUMNS = 4;
var MAX_SEQUENCE_ACTORS = 3;
var MERMAID_BLOCK_RE = /<pre\b[^>]*\bclass\s*=\s*["'][^"']*\bmermaid\b[^"']*["'][^>]*>([\s\S]*?)<\/pre>/gi;
var FLOW_ARROW_RE = /\s*(?:<-->|o--o|x--x|-\.->|-\.-|==>|<--|-->|---|--)\s*(?:\|[^|]*\|)?\s*/;
var SEQ_ARROW_RE = /^([A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*)\s*(?:-->>|->>|-->|->|--x|-x|--\)|-\))\s*[+-]?([A-Za-z0-9_]+(?:[.-][A-Za-z0-9_]+)*)\s*:/;
var ER_REL_RE = /^([A-Za-z0-9_-]+)\s+[|}o][|.o-]{1,3}--[|.o-]{1,3}[|{o]\s+([A-Za-z0-9_-]+)\s*:/;
var CLASS_REL_RE = /^([A-Za-z0-9_]+)\s+(?:<\|--|\*--|o--|<--|-->|\.\.>|\.\.\|>|--\|>|--\*|--o|--)\s+([A-Za-z0-9_]+)/;
var STATE_ARROW_RE = /^(\[\*\]|[A-Za-z0-9_-]+)\s*-->\s*(\[\*\]|[A-Za-z0-9_-]+)/;
var FLOW_IGNORE_RE = /^(?:subgraph|end|direction|classDef|class\s|style|linkStyle|click|%%)/i;
function decodeBasicEntities(raw) {
  return raw.replaceAll("&lt;", "<").replaceAll("&gt;", ">").replaceAll("&amp;", "&").replaceAll("&quot;", '"').replaceAll("&#39;", "'");
}
function cleanLines(source) {
  return decodeBasicEntities(source).replace(/%%\{[\s\S]*?\}%%/g, "").split(/\r?\n/).map((line) => line.replace(/%%.*$/, "").trim()).filter((line) => line.length > 0);
}
function nodeIdOf(piece) {
  const cleaned = piece.replace(/:::[A-Za-z0-9_-]+/g, "").trim();
  return /^([A-Za-z0-9_-]+)/.exec(cleaned)?.[1] ?? "";
}
function stripBackEdges(nodes, edges) {
  const adj = new Map;
  for (const node of nodes)
    adj.set(node, []);
  for (const [from, to] of edges) {
    if (from !== to)
      adj.get(from)?.push(to);
  }
  const state = new Map;
  const kept = [];
  function visit(u) {
    state.set(u, 1);
    for (const v of adj.get(u) ?? []) {
      const s = state.get(v) ?? 0;
      if (s === 1)
        continue;
      kept.push([u, v]);
      if (s === 0)
        visit(v);
    }
    state.set(u, 2);
  }
  for (const node of nodes) {
    if ((state.get(node) ?? 0) === 0)
      visit(node);
  }
  return kept;
}
function computeGraphDimensions(nodes, edges) {
  if (nodes.size === 0)
    return { maxDepth: 0, maxBreadth: 0 };
  const dagEdges = stripBackEdges(nodes, edges);
  const rank = new Map;
  for (const node of nodes)
    rank.set(node, 0);
  for (let pass = 0;pass < nodes.size; pass += 1) {
    let changed = false;
    for (const [from, to] of dagEdges) {
      const nextRank = (rank.get(from) ?? 0) + 1;
      if (nextRank > (rank.get(to) ?? 0)) {
        rank.set(to, nextRank);
        changed = true;
      }
    }
    if (!changed)
      break;
  }
  const perRank = new Map;
  let maxDepth = 0;
  for (const r of rank.values()) {
    if (r + 1 > maxDepth)
      maxDepth = r + 1;
    perRank.set(r, (perRank.get(r) ?? 0) + 1);
  }
  let maxBreadth = 0;
  for (const count of perRank.values()) {
    if (count > maxBreadth)
      maxBreadth = count;
  }
  return { maxDepth, maxBreadth };
}
function measureSequence(body) {
  const actors = new Set;
  for (const line of body) {
    const decl = /^(?:participant|actor)\s+([A-Za-z0-9_.-]+)/i.exec(line);
    if (decl?.[1]) {
      actors.add(decl[1]);
      continue;
    }
    const msg = SEQ_ARROW_RE.exec(line);
    if (msg?.[1] && msg?.[2]) {
      actors.add(msg[1]);
      actors.add(msg[2]);
    }
  }
  return { kind: "sequenceDiagram", direction: "horizontal", columns: actors.size };
}
function measureFlowchart(kind, dirToken, body) {
  const isHorizontal = dirToken === "LR" || dirToken === "RL";
  const nodes = new Set;
  const edges = [];
  for (const line of body) {
    if (FLOW_IGNORE_RE.test(line))
      continue;
    const parts = line.split(FLOW_ARROW_RE).map((part) => part.trim()).filter(Boolean);
    if (parts.length === 1) {
      const id = nodeIdOf(parts[0] ?? "");
      if (id)
        nodes.add(id);
      continue;
    }
    const groups = parts.map((part) => part.split(/\s*&\s*/).map(nodeIdOf).filter(Boolean));
    for (const group of groups) {
      for (const id of group)
        nodes.add(id);
    }
    for (let i = 0;i < groups.length - 1; i += 1) {
      for (const from of groups[i] ?? []) {
        for (const to of groups[i + 1] ?? [])
          edges.push([from, to]);
      }
    }
  }
  const { maxDepth, maxBreadth } = computeGraphDimensions(nodes, edges);
  return { kind, direction: isHorizontal ? "horizontal" : "vertical", columns: isHorizontal ? maxDepth : maxBreadth };
}
function measureState(kind, body) {
  let isHorizontal = false;
  const nodes = new Set;
  const edges = [];
  for (const line of body) {
    if (/^direction\s+(?:LR|RL)\b/i.test(line)) {
      isHorizontal = true;
      continue;
    }
    const match = STATE_ARROW_RE.exec(line);
    if (!match?.[1] || !match?.[2])
      continue;
    if (match[1] !== "[*]")
      nodes.add(match[1]);
    if (match[2] !== "[*]")
      nodes.add(match[2]);
    if (match[1] !== "[*]" && match[2] !== "[*]")
      edges.push([match[1], match[2]]);
  }
  const { maxDepth, maxBreadth } = computeGraphDimensions(nodes, edges);
  return { kind, direction: isHorizontal ? "horizontal" : "vertical", columns: isHorizontal ? maxDepth : maxBreadth };
}
function measureRelations(kind, body) {
  const nodes = new Set;
  const edges = [];
  const relRe = kind === "erDiagram" ? ER_REL_RE : CLASS_REL_RE;
  for (const line of body) {
    const match = relRe.exec(line);
    if (!match?.[1] || !match?.[2])
      continue;
    nodes.add(match[1]);
    nodes.add(match[2]);
    edges.push([match[1], match[2]]);
  }
  const { maxBreadth } = computeGraphDimensions(nodes, edges);
  return { kind, direction: "vertical", columns: maxBreadth };
}
function measureMermaidColumns(source) {
  const lines = cleanLines(source);
  const tokens = (lines[0] ?? "").split(/\s+/);
  const kind = tokens[0] ?? "unknown";
  const body = lines.slice(1);
  if (kind === "sequenceDiagram")
    return measureSequence(body);
  if (kind === "flowchart" || kind === "graph")
    return measureFlowchart(kind, (tokens[1] ?? "TD").toUpperCase(), body);
  if (kind === "stateDiagram" || kind === "stateDiagram-v2")
    return measureState(kind, body);
  if (kind === "erDiagram" || kind === "classDiagram")
    return measureRelations(kind, body);
  return { kind, direction: "vertical", columns: 1 };
}
function extractMermaidBlocks(html) {
  const blocks = [];
  for (const match of html.matchAll(MERMAID_BLOCK_RE)) {
    const content = (match[1] ?? "").trim();
    if (content)
      blocks.push(content);
  }
  return blocks;
}
function validateMermaidHtml(tabId, html) {
  extractMermaidBlocks(html).forEach((block, index) => {
    const measured = measureMermaidColumns(block);
    const limit = measured.kind === "sequenceDiagram" ? MAX_SEQUENCE_ACTORS : MAX_MERMAID_COLUMNS;
    if (measured.columns <= limit)
      return;
    let hint = "reduce parallel fan-out per level or split into smaller diagrams";
    if (measured.kind === "sequenceDiagram")
      hint = `reduce to at most ${MAX_SEQUENCE_ACTORS} participants so it stays readable on mobile, or split into smaller diagrams`;
    else if (measured.direction === "horizontal")
      hint = "switch to vertical (flowchart TD) or split into smaller diagrams";
    throw new Error(`tab "${tabId}" mermaid block #${index + 1} (${measured.kind}) has ${measured.columns} horizontal columns (max ${limit}); ${hint}`);
  });
}

// src/artifacts/tokens.ts
var ARTIFACT_STYLES = ["nosta-editorial", "nosta-diagnostic", "nosta-blueprint"];
var ARTIFACT_THEMES = ["auto", "dark", "light"];
var FONTSOURCE_STYLESHEETS = [
  "https://cdn.jsdelivr.net/npm/@fontsource-variable/inter@5.2.5/index.min.css",
  "https://cdn.jsdelivr.net/npm/@fontsource-variable/jetbrains-mono@5.2.5/index.min.css"
];
var ARTIFACT_PALETTE = {
  light: {
    ground: "#f8f7f4",
    surface: "#fbfaf7",
    surface2: "#f2f0ea",
    panel: "#fbfaf7",
    panel2: "#efece5",
    ink: "#3b2e10",
    ink2: "rgba(59, 46, 16, 0.8)",
    muted: "rgba(59, 46, 16, 0.62)",
    muted2: "rgba(59, 46, 16, 0.42)",
    line: "rgba(59, 46, 16, 0.12)",
    lineSoft: "rgba(59, 46, 16, 0.08)",
    lineStrong: "rgba(59, 46, 16, 0.24)",
    accentText: "#6e4f1d",
    good: "#2d6a4f",
    warn: "#9a5b13",
    bad: "#9b2c2c",
    info: "#5c5342",
    stone: "#787162"
  },
  dark: {
    ground: "#11110f",
    surface: "#181815",
    surface2: "#20201b",
    panel: "#1b1b17",
    panel2: "#161613",
    ink: "#f0efea",
    ink2: "rgba(240, 239, 234, 0.78)",
    muted: "rgba(240, 239, 234, 0.6)",
    muted2: "rgba(240, 239, 234, 0.38)",
    line: "rgba(240, 239, 234, 0.11)",
    lineSoft: "rgba(240, 239, 234, 0.08)",
    lineStrong: "rgba(240, 239, 234, 0.24)",
    accentText: "#d8c39a",
    good: "#7bc89c",
    warn: "#e3b469",
    bad: "#e89292",
    info: "#b8b1a3",
    stone: "#a8a293"
  }
};
function buildEchartsTheme(mode) {
  const p = ARTIFACT_PALETTE[mode];
  return {
    backgroundColor: "transparent",
    color: [p.accentText, p.good, p.stone, p.warn, p.bad, p.info],
    textStyle: { color: p.ink2, fontFamily: '"Inter Variable", Inter, system-ui, sans-serif', fontSize: 12 },
    title: { textStyle: { color: p.ink, fontWeight: 600 }, subtextStyle: { color: p.muted } },
    legend: { textStyle: { color: p.ink2 } },
    tooltip: { backgroundColor: p.panel, borderColor: p.lineStrong, textStyle: { color: p.ink, fontSize: 12 } },
    categoryAxis: {
      axisLine: { lineStyle: { color: p.lineStrong } },
      axisTick: { lineStyle: { color: p.lineStrong } },
      axisLabel: { color: p.muted },
      splitLine: { lineStyle: { color: p.lineSoft } }
    },
    valueAxis: {
      axisLine: { show: false },
      axisTick: { show: false },
      axisLabel: { color: p.muted },
      splitLine: { lineStyle: { color: p.lineSoft } }
    }
  };
}
var NOSTA_ECHARTS_THEMES = {
  dark: buildEchartsTheme("dark"),
  light: buildEchartsTheme("light")
};
function cssVarsOf(mode) {
  const p = ARTIFACT_PALETTE[mode];
  return [
    `--ground: ${p.ground};`,
    `--surface: ${p.surface};`,
    `--surface-2: ${p.surface2};`,
    `--panel: ${p.panel};`,
    `--panel-2: ${p.panel2};`,
    `--ink: ${p.ink};`,
    `--ink-2: ${p.ink2};`,
    `--muted: ${p.muted};`,
    `--muted-2: ${p.muted2};`,
    `--line: ${p.line};`,
    `--line-soft: ${p.lineSoft};`,
    `--line-strong: ${p.lineStrong};`,
    `--accent-text: ${p.accentText};`,
    `--good: ${p.good};`,
    `--warn: ${p.warn};`,
    `--bad: ${p.bad};`,
    `--info: ${p.info};`,
    `color-scheme: ${mode};`
  ].join(`
  `);
}
var NOSTA_ARTIFACT_CSS = `
:root,
:root[data-theme="light"] {
  ${cssVarsOf("light")}
  --radius: 10px;
  --radius-sm: 6px;
  --ease: cubic-bezier(0.2, 0.7, 0.2, 1);
  --font-sans: "Inter Variable", "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  --font-mono: "JetBrains Mono Variable", "JetBrains Mono", ui-monospace, SFMono-Regular, Menlo, monospace;
  --c-bg: var(--surface-2);
  --c-border: var(--line);
  --c-text: var(--ink-2);
  --c-accent: var(--accent-text);
}

:root[data-theme="dark"] {
  ${cssVarsOf("dark")}
  --c-bg: var(--surface-2);
  --c-border: var(--line);
  --c-text: var(--ink-2);
  --c-accent: var(--accent-text);
}

/* Restrained semantic tokens: monochrome neutral surfaces, color only for status text & accents */
.c-stone { --c-bg: var(--surface-2); --c-border: var(--line); --c-text: var(--muted); --c-accent: var(--line-strong); }
.c-ochre { --c-bg: var(--surface-2); --c-border: var(--line); --c-text: var(--accent-text); --c-accent: var(--accent-text); }
.c-sage { --c-bg: var(--surface-2); --c-border: var(--line); --c-text: var(--good); --c-accent: var(--good); }
.c-amber { --c-bg: var(--surface-2); --c-border: var(--line); --c-text: var(--warn); --c-accent: var(--warn); }
.c-terracotta { --c-bg: var(--surface-2); --c-border: var(--line); --c-text: var(--bad); --c-accent: var(--bad); }
.c-slate { --c-bg: var(--surface-2); --c-border: var(--line); --c-text: var(--ink-2); --c-accent: var(--line-strong); }

*, *::before, *::after { box-sizing: border-box; }

html, body {
  margin: 0;
  min-height: 100%;
  background: var(--ground);
  color: var(--ink);
  font: 13.5px/1.6 var(--font-sans);
  letter-spacing: -0.008em;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
  text-rendering: optimizeLegibility;
}

a { color: var(--accent-text); text-decoration: underline; text-decoration-color: var(--line-strong); text-underline-offset: 3px; }
a:hover { color: var(--ink); text-decoration-color: currentColor; }

.nosta-header {
  position: sticky;
  top: 0;
  z-index: 40;
  background: color-mix(in srgb, var(--ground) 94%, transparent);
  backdrop-filter: blur(8px);
  border-bottom: 1px solid var(--line);
}
.nosta-header-inner { max-width: var(--nosta-max-w, 1080px); margin: 0 auto; padding: 14px 24px; }
.nosta-header-inner:has(.nosta-tabs) { padding-bottom: 0; }
.nosta-title-row { display: flex; align-items: flex-start; justify-content: space-between; gap: 16px; }
.nosta-title { margin: 0; font: 600 18px/1.3 var(--font-sans); letter-spacing: -0.02em; color: var(--ink); }
.nosta-subtitle { margin: 3px 0 0; font-size: 13px; color: var(--muted); }
body[data-style="nosta-diagnostic"] { --nosta-max-w: 1200px; font-size: 13px; }
body[data-style="nosta-blueprint"] { --nosta-max-w: 1160px; }

/* When embedded inside app.nosta.dev FullscreenBox, drop duplicate title bar and theme toggle */
:root[data-embedded="true"] .nosta-title-row { display: none; }
:root[data-embedded="true"] .nosta-header:not(:has(.nosta-tabs)) { display: none; }
:root[data-embedded="true"] .nosta-header-inner { padding: 0 20px; }
:root[data-embedded="true"] .nosta-tabs { margin-top: 0; }
:root[data-embedded="true"] .nosta-main { padding: 20px; }

.nosta-theme-btn {
  flex-shrink: 0;
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--ink-2);
  border-radius: var(--radius-sm);
  padding: 5px 10px;
  font: 500 12px/1 var(--font-sans);
  cursor: pointer;
  transition: border-color 140ms var(--ease), color 140ms var(--ease);
}
.nosta-theme-btn:hover { border-color: var(--line-strong); color: var(--ink); }

.nosta-tabs { display: flex; gap: 4px; margin-top: 10px; overflow-x: auto; scrollbar-width: none; }
.nosta-tabs::-webkit-scrollbar { display: none; }
.nosta-tab {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  border: 0;
  border-bottom: 2px solid transparent;
  background: transparent;
  color: var(--muted);
  padding: 9px 12px;
  font: 500 13px/1.2 var(--font-sans);
  cursor: pointer;
  white-space: nowrap;
  transition: color 140ms var(--ease), border-color 140ms var(--ease);
}
.nosta-tab:hover { color: var(--ink); }
.nosta-tab[aria-selected="true"] { color: var(--ink); border-bottom-color: var(--ink); }
.nosta-tab-badge {
  font: 500 11px/1 var(--font-sans);
  padding: 2px 6px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--muted);
}

.nosta-main { max-width: var(--nosta-max-w, 1080px); margin: 0 auto; padding: 24px; }
.nosta-panel[hidden] { display: none; }

h1, h2, h3, h4 { font-family: var(--font-sans); font-weight: 600; color: var(--ink); letter-spacing: -0.02em; margin: 1.35em 0 0.5em; line-height: 1.3; }
h1:first-child, h2:first-child, h3:first-child { margin-top: 0; }
h1 { font-size: 19px; }
h2 { font-size: 16px; padding-bottom: 6px; border-bottom: 1px solid var(--line-soft); }
h3 { font-size: 14px; }
p { margin: 0.6em 0; color: var(--ink-2); }
ul, ol { margin: 0.6em 0; padding-left: 1.35em; color: var(--ink-2); }
li { margin: 0.25em 0; }
code {
  font-family: var(--font-mono);
  font-size: 12px;
  background: var(--panel-2);
  border: 1px solid var(--line);
  border-radius: 5px;
  padding: 0.1em 0.35em;
  color: var(--ink);
}
pre {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-radius: var(--radius);
  padding: 12px 14px;
  overflow: auto;
  margin: 0.8em 0;
}
pre code { background: none; border: 0; padding: 0; font-size: 12px; line-height: 1.55; }

/* Theme-aware Highlight.js tokens */
.hljs { color: var(--ink); background: transparent; }
.hljs-comment, .hljs-quote { color: var(--muted); font-style: italic; }
.hljs-keyword, .hljs-selector-tag, .hljs-subst { color: var(--accent-text); font-weight: 500; }
.hljs-string, .hljs-doctag, .hljs-regexp { color: var(--good); }
.hljs-number, .hljs-literal, .hljs-variable, .hljs-attr { color: var(--warn); }
.hljs-title, .hljs-section, .hljs-type, .hljs-built_in { color: var(--ink); font-weight: 500; }
.hljs-deletion { color: var(--bad); }
.hljs-addition { color: var(--good); }

.stack { display: flex; flex-direction: column; gap: 16px; }
.prose { max-width: 74ch; }
.grid-2 { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 12px; }
.grid-3 { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.grid-4 { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 12px; }
.split { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(0, 1fr); gap: 16px; }
@media (max-width: 760px) {
  .grid-2, .grid-3, .grid-4, .split { grid-template-columns: 1fr; }
  .nosta-header-inner, .nosta-main { padding-left: 16px; padding-right: 16px; }
}

.card { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px 16px; color: var(--ink-2); }
.callout {
  background: var(--surface-2);
  border: 1px solid var(--line);
  border-left: 2px solid var(--c-accent, var(--accent-text));
  border-radius: var(--radius);
  padding: 11px 14px;
  color: var(--ink-2);
}
.callout strong { color: var(--ink); }
.badge, .pill {
  display: inline-flex;
  align-items: center;
  gap: 5px;
  font: 500 11.5px/1.2 var(--font-sans);
  padding: 2px 8px;
  border-radius: 999px;
  background: var(--surface-2);
  border: 1px solid var(--line);
  color: var(--c-text, var(--ink-2));
  white-space: nowrap;
}

.kpi-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(150px, 1fr)); gap: 12px; }
.kpi { background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px 14px; }
.kpi-label { font-size: 11.5px; color: var(--muted); }
.kpi-value { margin-top: 4px; font: 600 18px/1.2 var(--font-sans); font-variant-numeric: tabular-nums; letter-spacing: -0.02em; color: var(--ink); }
.kpi-delta { margin-top: 3px; font-size: 11.5px; line-height: 1.3; color: var(--muted); }

.table-wrap { overflow-x: auto; border: 1px solid var(--line); border-radius: var(--radius); background: var(--surface); }
.data-table { width: 100%; border-collapse: collapse; font-size: 13px; }
.data-table th, .data-table td { padding: 9px 12px; border-bottom: 1px solid var(--line-soft); text-align: left; vertical-align: top; color: var(--ink-2); }
.data-table th { background: var(--surface-2); color: var(--muted); font-weight: 500; font-size: 12px; }
.data-table tr:last-child td { border-bottom: 0; }
.data-table td.num, .data-table th.num { text-align: right; font-family: var(--font-mono); font-size: 12px; font-variant-numeric: tabular-nums; }

.filter-bar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  padding: 10px 12px;
  background: var(--surface);
  border: 1px solid var(--line);
  border-radius: var(--radius);
}
.filter-bar input, .filter-bar select {
  background: var(--surface-2);
  color: var(--ink);
  border: 1px solid var(--line);
  border-radius: var(--radius-sm);
  padding: 6px 10px;
  font: 12.5px var(--font-sans);
}
.trace-list { display: flex; flex-direction: column; gap: 6px; }
.trace-row {
  background: var(--surface);
  border: 1px solid var(--line);
  border-left: 2px solid var(--c-accent, var(--line-strong));
  border-radius: var(--radius-sm);
  padding: 8px 12px;
}
.trace-row summary {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  cursor: pointer;
  list-style: none;
  font: 500 12.5px/1.3 var(--font-sans);
  color: var(--ink);
}
.trace-row summary span:last-child { font-family: var(--font-mono); font-size: 11.5px; color: var(--muted); }
.trace-row summary::-webkit-details-marker { display: none; }
.bar-meter { height: 5px; background: var(--surface-2); border-radius: 999px; overflow: hidden; }
.bar-meter > span { display: block; height: 100%; background: var(--c-accent, var(--accent-text)); border-radius: 999px; }

.diagram-stage { background: var(--panel); border: 1px solid var(--line); border-radius: var(--radius); padding: 14px; overflow: hidden; }
.diagram-stage.is-expanded {
  position: fixed;
  inset: 12px;
  z-index: 80;
  display: flex;
  flex-direction: column;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.55);
}
.diagram-toolbar {
  display: flex;
  align-items: center;
  justify-content: flex-end;
  gap: 4px;
  margin-bottom: 8px;
}
.diagram-toolbar button {
  border: 1px solid var(--line);
  background: var(--surface);
  color: var(--muted);
  border-radius: var(--radius-sm);
  padding: 3px 8px;
  font: 500 11px/1.2 var(--font-sans);
  cursor: pointer;
}
.diagram-toolbar button:hover { border-color: var(--line-strong); color: var(--ink); }
.diagram-viewport { overflow: auto; -webkit-overflow-scrolling: touch; flex: 1; }
.diagram-zoom { width: 100%; transition: width 120ms var(--ease); }
.diagram-stage pre.mermaid { margin: 0; background: transparent; border: 0; padding: 0; overflow: visible; }
.diagram-stage pre.mermaid svg { width: 100% !important; max-width: none !important; height: auto !important; display: block; margin: 0 auto; }
.diagram-stage pre.mermaid svg .relationshipLabelBox,
.diagram-stage pre.mermaid svg .labelBkg,
.diagram-stage pre.mermaid svg .edgeLabel rect { fill: var(--panel) !important; background-color: var(--panel) !important; opacity: 1 !important; }
.diagram-stage pre.mermaid svg .relationshipLabel,
.diagram-stage pre.mermaid svg .edgeLabel text,
.diagram-stage pre.mermaid svg .edgeLabel span,
.diagram-stage pre.mermaid svg .edgeLabel p { fill: var(--ink) !important; color: var(--ink) !important; }
@media (max-width: 640px) {
  .diagram-stage { padding: 12px; }
}
body[data-style="nosta-blueprint"] .diagram-stage {
  background-image: radial-gradient(var(--line) 1px, transparent 1px);
  background-size: 18px 18px;
}
.chart-box { width: 100%; height: 320px; background: var(--surface); border: 1px solid var(--line); border-radius: var(--radius); padding: 12px; }

svg.svg-diagram { display: block; width: 100%; height: auto; font-family: var(--font-sans); }
svg.svg-diagram .node rect,
svg.svg-diagram rect.node { fill: var(--surface); stroke: var(--line-strong); stroke-width: 1.25; rx: 8; }
svg.svg-diagram .arr { fill: none; stroke: var(--line-strong); stroke-width: 1.5; }
svg.svg-diagram .leader { fill: none; stroke: var(--muted-2); stroke-width: 1; stroke-dasharray: 4 3; }
svg.svg-diagram .t { fill: var(--ink); font-size: 13.5px; font-weight: 600; font-family: var(--font-sans); }
svg.svg-diagram .th { fill: var(--ink); font-size: 13px; font-weight: 600; font-family: var(--font-sans); }
svg.svg-diagram .ts { fill: var(--muted); font-size: 12px; font-weight: 400; font-family: var(--font-sans); }
svg.svg-diagram .tm { fill: var(--ink-2); font-size: 11.5px; font-family: var(--font-mono); }
`.trim();

// src/artifacts/shell.ts
var ARTIFACT_LIBS = ["echarts", "mermaid", "lucide", "highlight"];
var LIB_CDN = {
  echarts: "https://cdn.jsdelivr.net/npm/echarts@5.6.0/dist/echarts.min.js",
  mermaid: "https://cdn.jsdelivr.net/npm/mermaid@11.6.0/dist/mermaid.min.js",
  lucide: "https://cdn.jsdelivr.net/npm/lucide@0.475.0/dist/umd/lucide.min.js",
  highlight: "https://cdn.jsdelivr.net/npm/@highlightjs/cdn-assets@11.11.1/highlight.min.js"
};
function escapeHtml(value) {
  return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;").replaceAll("'", "&#39;");
}
function renderLibTags(libs) {
  return [...new Set(libs)].map((lib) => `<script src="${LIB_CDN[lib]}"></script>`).join(`
`);
}
function buildRuntimeScript(input) {
  const hasEcharts = input.libs.includes("echarts");
  const hasMermaid = input.libs.includes("mermaid");
  const hasLucide = input.libs.includes("lucide");
  const hasHighlight = input.libs.includes("highlight");
  return `
(function() {
  var DEFAULT_THEME = ${JSON.stringify(input.theme)};
  var TAB_IDS = ${JSON.stringify(input.tabIds)};
  var ECHARTS_THEMES = ${hasEcharts ? JSON.stringify(NOSTA_ECHARTS_THEMES) : "null"};

  function resolveInitialTheme() {
    if (window.__nostaTheme === "dark" || window.__nostaTheme === "light") return window.__nostaTheme;
    var q = new URLSearchParams(location.search).get("theme");
    if (q === "dark" || q === "light") return q;
    if (DEFAULT_THEME === "dark" || DEFAULT_THEME === "light") return DEFAULT_THEME;
    return window.matchMedia && window.matchMedia("(prefers-color-scheme: light)").matches ? "light" : "dark";
  }

  try {
    if (window.self !== window.top) document.documentElement.setAttribute("data-embedded", "true");
  } catch (_) {
    document.documentElement.setAttribute("data-embedded", "true");
  }

  var currentTheme = resolveInitialTheme();
  var themeListeners = [];
  var booted = false;

  function applyTheme(next) {
    currentTheme = next === "light" ? "light" : "dark";
    document.documentElement.setAttribute("data-theme", currentTheme);
    var btn = document.getElementById("nosta-theme-toggle");
    if (btn) btn.textContent = currentTheme === "dark" ? "Light" : "Dark";
    themeListeners.forEach(function(fn) { try { fn(currentTheme); } catch (_) {} });
  }

  window.addEventListener("message", function(e) {
    if (e && e.data && e.data.type === "nosta-theme" && (e.data.theme === "dark" || e.data.theme === "light")) {
      applyTheme(e.data.theme);
    }
  });

  document.documentElement.setAttribute("data-theme", currentTheme);

  var chartEntries = [];
  function mountChart(entry) {
    if (!window.echarts || !ECHARTS_THEMES) return;
    if (!window.__nostaEchartsRegistered) {
      window.echarts.registerTheme("nosta-dark", ECHARTS_THEMES.dark);
      window.echarts.registerTheme("nosta-light", ECHARTS_THEMES.light);
      window.__nostaEchartsRegistered = true;
    }
    if (entry.instance) entry.instance.dispose();
    var themeName = currentTheme === "light" ? "nosta-light" : "nosta-dark";
    entry.instance = window.echarts.init(entry.el, themeName);
    var opt = entry.buildOption(currentTheme);
    if (opt) entry.instance.setOption(opt);
  }

  window.nostaCharts = {
    register: function(target, buildOption) {
      var el = typeof target === "string" ? document.querySelector(target) : target;
      if (!el) return;
      var entry = { el: el, buildOption: buildOption, instance: null };
      chartEntries.push(entry);
      if (booted && window.echarts) mountChart(entry);
    },
    resizeAll: function() {
      chartEntries.forEach(function(entry) {
        if (entry.instance) entry.instance.resize();
      });
    }
  };

  ${hasEcharts ? `themeListeners.push(function() { chartEntries.forEach(mountChart); });
  window.addEventListener("resize", function() { window.nostaCharts.resizeAll(); });` : ""}

  ${hasMermaid ? `var MOBILE_BREAKPOINT = 640;
  function isMobileViewport() {
    return window.innerWidth < MOBILE_BREAKPOINT;
  }
  function adaptMermaidForViewport(src, mobile) {
    if (!mobile) return src;
    return src
      .replace(/^(\\s*(?:flowchart|graph)\\s+)(?:LR|RL)\\b/im, "$1TD")
      .replace(/^(\\s*direction\\s+)(?:LR|RL)\\b/gim, "$1TB");
  }
  function attachDiagramToolbar(stage) {
    if (!stage || stage.dataset.zoomWired === "1") return;
    stage.dataset.zoomWired = "1";
    var viewport = document.createElement("div");
    viewport.className = "diagram-viewport";
    var zoom = document.createElement("div");
    zoom.className = "diagram-zoom";
    while (stage.firstChild) zoom.appendChild(stage.firstChild);
    viewport.appendChild(zoom);
    var bar = document.createElement("div");
    bar.className = "diagram-toolbar";
    var btnOut = document.createElement("button");
    btnOut.type = "button";
    btnOut.textContent = "−";
    btnOut.setAttribute("aria-label", "Zoom out");
    var btnReset = document.createElement("button");
    btnReset.type = "button";
    btnReset.textContent = "100%";
    btnReset.setAttribute("aria-label", "Reset zoom");
    var btnIn = document.createElement("button");
    btnIn.type = "button";
    btnIn.textContent = "+";
    btnIn.setAttribute("aria-label", "Zoom in");
    var btnExpand = document.createElement("button");
    btnExpand.type = "button";
    btnExpand.textContent = "Expand";
    bar.appendChild(btnOut);
    bar.appendChild(btnReset);
    bar.appendChild(btnIn);
    bar.appendChild(btnExpand);
    stage.appendChild(bar);
    stage.appendChild(viewport);
    var scale = 1;
    function setScale(next) {
      scale = Math.max(0.75, Math.min(2.5, Math.round(next * 100) / 100));
      zoom.style.width = Math.round(scale * 100) + "%";
      btnReset.textContent = Math.round(scale * 100) + "%";
    }
    btnIn.addEventListener("click", function() { setScale(scale + 0.25); });
    btnOut.addEventListener("click", function() { setScale(scale - 0.25); });
    btnReset.addEventListener("click", function() { setScale(1); });
    btnExpand.addEventListener("click", function() {
      var expanded = stage.classList.toggle("is-expanded");
      btnExpand.textContent = expanded ? "Close" : "Expand";
    });
  }
  function renderMermaid(theme, scope) {
    if (!window.mermaid) return;
    var root = scope || document;
    var mobile = isMobileViewport();
    var modeKey = theme + ":" + (mobile ? "m" : "d");
    var candidates = root.querySelectorAll("pre.mermaid");
    var visible = [];
    candidates.forEach(function(el) {
      if (!el.dataset.mermaidSrc) el.dataset.mermaidSrc = el.textContent || "";
      attachDiagramToolbar(el.closest(".diagram-stage"));
      var panel = el.closest(".nosta-panel");
      if (panel && panel.hidden) {
        el.dataset.mermaidMode = "";
        return;
      }
      if (el.dataset.mermaidMode === modeKey && el.getAttribute("data-processed") === "true") return;
      el.dataset.mermaidMode = modeKey;
      el.removeAttribute("data-processed");
      el.textContent = adaptMermaidForViewport(el.dataset.mermaidSrc, mobile);
      visible.push(el);
    });
    if (!visible.length) return;
    var isLight = theme === "light";
    window.mermaid.initialize({
      startOnLoad: false,
      theme: "base",
      securityLevel: "loose",
      themeVariables: isLight
        ? {
            darkMode: false,
            background: "transparent",
            fontFamily: '"Inter Variable", Inter, system-ui, sans-serif',
            fontSize: "13px",
            primaryColor: "#f2f0ea",
            primaryTextColor: "#3b2e10",
            primaryBorderColor: "rgba(59, 46, 16, 0.24)",
            secondaryColor: "#fbfaf7",
            tertiaryColor: "#efece5",
            lineColor: "#787162",
            textColor: "#3b2e10",
            edgeLabelBackground: "#fbfaf7",
            clusterBkg: "#f2f0ea",
            clusterBorder: "rgba(59, 46, 16, 0.16)",
            actorBkg: "#fbfaf7",
            actorBorder: "rgba(59, 46, 16, 0.24)",
            actorTextColor: "#3b2e10",
            signalColor: "#3b2e10",
            signalTextColor: "#3b2e10",
            labelBoxBkgColor: "#f2f0ea",
            labelBoxBorderColor: "rgba(59, 46, 16, 0.16)",
            labelTextColor: "#3b2e10",
            attributeBackgroundColorOdd: "#fbfaf7",
            attributeBackgroundColorEven: "#f2f0ea",
          }
        : {
            darkMode: true,
            background: "transparent",
            fontFamily: '"Inter Variable", Inter, system-ui, sans-serif',
            fontSize: "13px",
            primaryColor: "#1b1b17",
            primaryTextColor: "#f0efea",
            primaryBorderColor: "rgba(240, 239, 234, 0.24)",
            secondaryColor: "#181815",
            tertiaryColor: "#20201b",
            lineColor: "#a8a293",
            textColor: "#f0efea",
            edgeLabelBackground: "#1b1b17",
            clusterBkg: "#181815",
            clusterBorder: "rgba(240, 239, 234, 0.16)",
            actorBkg: "#1b1b17",
            actorBorder: "rgba(240, 239, 234, 0.24)",
            actorTextColor: "#f0efea",
            signalColor: "#d8c39a",
            signalTextColor: "#f0efea",
            labelBoxBkgColor: "#20201b",
            labelBoxBorderColor: "rgba(240, 239, 234, 0.16)",
            labelTextColor: "#f0efea",
            attributeBackgroundColorOdd: "#181815",
            attributeBackgroundColorEven: "#20201b",
          },
      flowchart: { useMaxWidth: true, htmlLabels: false, wrappingWidth: 160, nodeSpacing: 32, rankSpacing: 40 },
      sequence: { useMaxWidth: true, wrap: true, actorMargin: mobile ? 16 : 40, width: mobile ? 122 : 140, messageMargin: 28 },
      er: { useMaxWidth: true },
      state: { useMaxWidth: true },
      class: { useMaxWidth: true }
    });
    window.mermaid.run({ nodes: visible });
  }
  themeListeners.push(function(theme) { renderMermaid(theme); });
  var lastMobileState = isMobileViewport();
  window.addEventListener("resize", function() {
    var nextMobile = isMobileViewport();
    if (nextMobile !== lastMobileState) {
      lastMobileState = nextMobile;
      renderMermaid(currentTheme);
    }
  });` : ""}

  function selectTab(id, notify) {
    var target = TAB_IDS.indexOf(id) >= 0 ? id : TAB_IDS[0];
    if (!target) return;
    var activePanel = null;
    document.querySelectorAll(".nosta-tab").forEach(function(btn) {
      var active = btn.getAttribute("data-tab") === target;
      btn.setAttribute("aria-selected", active ? "true" : "false");
    });
    document.querySelectorAll(".nosta-panel").forEach(function(panel) {
      var isTarget = panel.getAttribute("data-panel") === target;
      panel.hidden = !isTarget;
      if (isTarget) activePanel = panel;
    });
    if (notify) {
      try {
        if (location.hash !== "#" + target) history.replaceState(null, "", "#" + target);
      } catch (_) {}
      try {
        if (window.__nostaDoc && window.parent && window.parent !== window) {
          window.parent.postMessage({ type: "nosta-tab", doc: window.__nostaDoc, key: target }, "*");
        }
      } catch (_) {}
    }
    ${hasMermaid ? "if (activePanel) renderMermaid(currentTheme, activePanel);" : ""}
    setTimeout(function() { window.nostaCharts.resizeAll(); }, 20);
  }
  window.nostaSelectTab = function(id) { selectTab(id, true); };

  function resolveInitialTab() {
    if (window.__nostaTab && TAB_IDS.indexOf(window.__nostaTab) >= 0) return window.__nostaTab;
    var hashTab = (location.hash || "").replace(/^#/, "");
    if (TAB_IDS.indexOf(hashTab) >= 0) return hashTab;
    return TAB_IDS[0];
  }

  function boot() {
    booted = true;
    applyTheme(currentTheme);
    var toggle = document.getElementById("nosta-theme-toggle");
    if (toggle) {
      toggle.addEventListener("click", function() {
        applyTheme(currentTheme === "dark" ? "light" : "dark");
      });
    }
    document.querySelectorAll(".nosta-tab").forEach(function(btn) {
      btn.addEventListener("click", function() {
        selectTab(btn.getAttribute("data-tab"), true);
      });
    });
    selectTab(resolveInitialTab(), false);
    ${hasLucide ? "if (window.lucide && window.lucide.createIcons) window.lucide.createIcons();" : ""}
    ${hasHighlight ? "if (window.hljs && window.hljs.highlightAll) window.hljs.highlightAll();" : ""}
  }

  if (document.readyState === "loading") {
    document.addEventListener("DOMContentLoaded", boot);
  } else {
    boot();
  }
})();
`.trim();
}
function compileArtifactHtml(input) {
  const showTabs = input.tabs.length > 1;
  const tabButtons = input.tabs.map((tab, index) => {
    const badge = tab.badge ? `<span class="nosta-tab-badge">${escapeHtml(tab.badge)}</span>` : "";
    return `<button type="button" class="nosta-tab" role="tab" data-tab="${escapeHtml(tab.id)}" aria-selected="${index === 0 ? "true" : "false"}">${escapeHtml(tab.label)}${badge}</button>`;
  }).join(`
        `);
  const panels = input.tabs.map((tab, index) => `<section class="nosta-panel" role="tabpanel" data-panel="${escapeHtml(tab.id)}"${index === 0 ? "" : " hidden"}>
${tab.html}
</section>`).join(`
    `);
  const subtitle = input.subtitle ? `<p class="nosta-subtitle">${escapeHtml(input.subtitle)}</p>` : "";
  const fontLinks = FONTSOURCE_STYLESHEETS.map((href) => `<link rel="stylesheet" href="${href}">`).join(`
`);
  const libTags = renderLibTags(input.libs);
  const runtime = buildRuntimeScript({
    theme: input.theme,
    tabIds: input.tabs.map((tab) => tab.id),
    libs: input.libs
  });
  return [
    "<!doctype html>",
    `<html lang="en" data-theme="${input.theme === "light" ? "light" : "dark"}">`,
    "<head>",
    '<meta charset="utf-8">',
    '<meta name="viewport" content="width=device-width, initial-scale=1">',
    `<title>${escapeHtml(input.title)}</title>`,
    fontLinks,
    `<style>
${NOSTA_ARTIFACT_CSS}
</style>`,
    libTags,
    `<script>
${runtime}
</script>`,
    "</head>",
    `<body data-style="${escapeHtml(input.style)}">`,
    '  <header class="nosta-header">',
    '    <div class="nosta-header-inner">',
    '      <div class="nosta-title-row">',
    "        <div>",
    `          <h1 class="nosta-title">${escapeHtml(input.title)}</h1>`,
    subtitle ? `          ${subtitle}` : "",
    "        </div>",
    '        <button type="button" id="nosta-theme-toggle" class="nosta-theme-btn" aria-label="Toggle color theme">Light</button>',
    "      </div>",
    showTabs ? `      <nav class="nosta-tabs" role="tablist">
        ${tabButtons}
      </nav>` : "",
    "    </div>",
    "  </header>",
    '  <main class="nosta-main">',
    `    ${panels}`,
    "  </main>",
    "</body>",
    "</html>"
  ].filter((line) => line.length > 0).join(`
`);
}

// src/artifacts/index.ts
var ALLOWED_EXTERNAL_HOSTS = new Set(["cdn.jsdelivr.net", "unpkg.com", "cdnjs.cloudflare.com"]);
var FORBIDDEN_DOC_WRAPPER = /<(?:!doctype|html|head|body)\b/i;
var EXTERNAL_ASSET_RE = /<(?:script|link)\b[^>]*(?:src|href)\s*=\s*["']([^"']+)["']/gi;
var artifactGuideInputSchema = object({
  modules: array(_enum(ARTIFACT_GUIDE_MODULES)).min(1).describe("Design modules to load before calling nosta_artifact_publish.")
});
var artifactTabSchema = object({
  id: string2().regex(PAGE_TAB, "tab id must match [A-Za-z0-9_-]{1,64}").describe("URL hash & tab key, e.g. 'overview'."),
  label: string2().trim().min(1).max(60).describe("Short tab label."),
  badge: string2().trim().max(24).optional().describe("Optional count or status pill on the tab."),
  html: string2().trim().min(1).describe("Inner HTML/SVG fragment for this tab (no <html>/<body> wrapper).")
});
var artifactPublishInputSchema = object({
  ticket: string2().regex(PAGE_TICKET, "ticket must match [A-Za-z0-9][A-Za-z0-9._-]{0,99}").describe("Ticket or session slug."),
  name: string2().regex(PAGE_NAME, "name must match [A-Za-z0-9][A-Za-z0-9._-]{0,199}").describe("Artifact slug within ticket."),
  title: string2().trim().min(1).max(MAX_PAGE_TITLE).describe("Human-readable artifact title."),
  subtitle: string2().trim().max(240).optional().describe("Optional one-line subtitle shown under the title."),
  slot: string2().regex(PAGE_SLOT, "slot must match [a-z0-9][a-z0-9_-]{0,63}").default("artifact").describe("Target Flow tab slot: 'alignment', 'spec', 'evidence', 'artifact' (Artifacts drawer only), or a custom flow tab id."),
  style: _enum(ARTIFACT_STYLES).default("nosta-editorial"),
  theme: _enum(ARTIFACT_THEMES).default("auto"),
  tabs: array(artifactTabSchema).min(1).max(16).describe("One or more content tabs rendered inside the Nosta shell."),
  libs: array(_enum(ARTIFACT_LIBS)).optional().describe("Optional allowlisted CDN libraries to load on demand."),
  flowId: string2().regex(LINK_ID, "flowId must match [A-Za-z0-9:._-]{1,200}").optional().describe("Optional Nosta flow ID to link and sync this artifact to (auto-resolved from ~/.nosta/flows/index.json when omitted)."),
  repoRoot: string2().trim().min(1).optional().describe("Optional git repo root for auto-resolving the bound flow."),
  branch: string2().trim().min(1).optional().describe("Optional git branch for auto-resolving the bound flow."),
  stepId: string2().trim().max(128).optional().describe("Optional step ID."),
  linkedTo: array(string2().refine(isDocumentKey, "linkedTo entries must be ticket/name")).optional().describe("Optional related document keys (ticket/name)."),
  guideRead: literal(true).describe("Must be true; requires calling nosta_artifact_guide first in this session."),
  dryRunPath: string2().trim().min(1).optional().describe("Optional absolute local file path to write HTML without uploading.")
});
function createArtifactSessionState() {
  return { readModules: new Set };
}
var ARTIFACT_TOOLS = [
  {
    name: "nosta_artifact_guide",
    description: "Load Nosta's warm editorial design tokens, 6 semantic ramps, layout primitives, and recipes for the requested artifact modules before calling nosta_artifact_publish.",
    inputSchema: toMcpInputSchema(artifactGuideInputSchema)
  },
  {
    name: "nosta_artifact_publish",
    description: "Validate, wrap in Nosta's native monochrome warm-neutral shell (Inter + JetBrains Mono, auto theme sync, tab persistence, optional ECharts/Mermaid/Lucide/Highlight.js), publish a tabbed HTML artifact to Nosta, and sync it into the bound Flow object under the requested tab slot.",
    inputSchema: toMcpInputSchema(artifactPublishInputSchema)
  }
];
function validateTabFragments(tabs) {
  const seen = new Set;
  for (const tab of tabs) {
    if (seen.has(tab.id)) {
      throw new Error(`duplicate tab id: ${tab.id}`);
    }
    seen.add(tab.id);
    if (FORBIDDEN_DOC_WRAPPER.test(tab.html)) {
      throw new Error(`tab "${tab.id}" must contain an inner HTML fragment, not <html>/<body>/<!doctype>`);
    }
    for (const match of tab.html.matchAll(EXTERNAL_ASSET_RE)) {
      const rawUrl = match[1] ?? "";
      if (!/^https?:\/\//i.test(rawUrl))
        continue;
      let host = "";
      try {
        host = new URL(rawUrl).hostname.toLowerCase();
      } catch {
        throw new Error(`tab "${tab.id}" has invalid external asset URL: ${rawUrl}`);
      }
      if (!ALLOWED_EXTERNAL_HOSTS.has(host)) {
        throw new Error(`tab "${tab.id}" references disallowed external asset host "${host}"; use libs or allowlisted CDNs`);
      }
    }
    validateMermaidHtml(tab.id, tab.html);
  }
}
async function resolveBoundFlowId(input) {
  if (input.explicitFlowId)
    return input.explicitFlowId;
  let repoRoot = input.repoRoot;
  let branch = input.branch;
  if (repoRoot || branch) {
    try {
      const resolved = await resolveRepoBranch({ repoRoot, branch });
      repoRoot = resolved.repoRoot;
      branch = resolved.branch;
    } catch {}
  }
  const indexed = await resolveIndexedFlowId({ repoRoot, branch, ticket: input.ticket, stateDir: input.stateDir });
  return indexed ?? undefined;
}
async function callArtifactTool(input) {
  if (input.name === "nosta_artifact_guide") {
    const parsed = parseToolArgs(artifactGuideInputSchema, input.args);
    for (const mod of parsed.modules) {
      input.session.readModules.add(mod);
    }
    return renderArtifactGuide(parsed.modules);
  }
  if (input.name !== "nosta_artifact_publish")
    return null;
  if (input.session.readModules.size === 0) {
    throw new Error("call nosta_artifact_guide with the modules you need (spec, diagram, diagnostics, chart, interactive) before calling nosta_artifact_publish");
  }
  const parsed = parseToolArgs(artifactPublishInputSchema, input.args);
  validateTabFragments(parsed.tabs);
  const libs = [...new Set(parsed.libs ?? [])];
  const html = compileArtifactHtml({
    title: parsed.title,
    subtitle: parsed.subtitle,
    style: parsed.style,
    theme: parsed.theme,
    tabs: parsed.tabs,
    libs
  });
  const bytes = Buffer.byteLength(html, "utf8");
  if (bytes > MAX_PAGE_BYTES) {
    throw new Error(`compiled artifact is ${bytes} bytes; the limit is ${MAX_PAGE_BYTES}`);
  }
  const route = `/artifacts/${encodeURIComponent(parsed.ticket)}/${encodeURIComponent(parsed.name)}`;
  const summary = {
    ticket: parsed.ticket,
    name: parsed.name,
    title: parsed.title,
    slot: parsed.slot,
    style: parsed.style,
    theme: parsed.theme,
    libs,
    tabs: parsed.tabs.map((tab) => tab.id),
    bytes,
    route
  };
  if (parsed.dryRunPath) {
    await mkdir4(dirname3(parsed.dryRunPath), { recursive: true });
    await writeFile3(parsed.dryRunPath, html, "utf8");
    return JSON.stringify({ dryRun: true, path: parsed.dryRunPath, ...summary });
  }
  const flowId = await resolveBoundFlowId({
    explicitFlowId: parsed.flowId,
    ticket: parsed.ticket,
    repoRoot: parsed.repoRoot,
    branch: parsed.branch,
    stateDir: input.stateDir
  });
  await publishPage(input.backend, {
    ticket: parsed.ticket,
    name: parsed.name,
    title: parsed.title,
    stepId: parsed.stepId ?? "",
    slot: parsed.slot,
    html,
    flowId,
    linkedTo: parsed.linkedTo
  });
  if (flowId) {
    await attachPublishedArtifact({
      flowId,
      ticket: parsed.ticket,
      name: parsed.name,
      title: parsed.title,
      slot: parsed.slot,
      stepId: parsed.stepId,
      html,
      bytes,
      backend: input.backend,
      stateDir: input.stateDir
    });
  }
  return JSON.stringify({
    ...summary,
    ...flowId ? { flowId, flowUrl: `${input.backend.baseUrl}/flows/${encodeURIComponent(flowId)}` } : {},
    url: `${input.backend.baseUrl}${route}`
  });
}

// src/gate/ipc.ts
import { randomBytes as randomBytes2, timingSafeEqual } from "node:crypto";
import { chmod, lstat, mkdir as mkdir5, readFile as readFile7, rename as rename3, rm, writeFile as writeFile4 } from "node:fs/promises";
import { createServer } from "node:http";
import { homedir as homedir3 } from "node:os";
import { join as join6 } from "node:path";
function defaultGateDir(env = process.env) {
  return env.NOSTA_GATE_DIR || join6(homedir3(), ".nosta", "gate");
}
function constantTimeTokenMatch(given, expected) {
  const a = Buffer.from(given, "utf8");
  const b = Buffer.from(expected, "utf8");
  if (a.length !== b.length)
    return false;
  return timingSafeEqual(a, b);
}
function readJsonBody(req) {
  return new Promise((resolve, reject) => {
    const chunks = [];
    let total = 0;
    req.on("data", (chunk) => {
      total += chunk.length;
      if (total > 256 * 1024) {
        reject(new Error("request body too large"));
        req.destroy();
        return;
      }
      chunks.push(chunk);
    });
    req.on("end", () => {
      const raw = Buffer.concat(chunks).toString("utf8").trim();
      if (!raw) {
        resolve({});
        return;
      }
      try {
        const parsed = JSON.parse(raw);
        if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) {
          reject(new Error("request body must be a JSON object"));
          return;
        }
        resolve(parsed);
      } catch {
        reject(new Error("invalid JSON body"));
      }
    });
    req.on("error", reject);
  });
}
function writeJson(res, status, payload) {
  const body = JSON.stringify(payload);
  res.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "content-length": Buffer.byteLength(body)
  });
  res.end(body);
}
function requiredString(value, field) {
  if (typeof value !== "string" || value.trim().length === 0) {
    throw new Error(`${field} must be a non-empty string`);
  }
  return value;
}
async function prepareGateDir(gateDir) {
  await mkdir5(gateDir, { recursive: true, mode: 448 });
  const dirStat = await lstat(gateDir);
  if (dirStat.isSymbolicLink() || !dirStat.isDirectory()) {
    throw new Error(`gateDir "${gateDir}" must be a real directory, not a symlink`);
  }
  if (typeof process.getuid === "function" && dirStat.uid !== process.getuid()) {
    throw new Error(`gateDir "${gateDir}" is not owned by the current user`);
  }
  await chmod(gateDir, 448).catch(() => {
    return;
  });
}
async function startGateIpcServer(options) {
  const gateDir = options.gateDir ?? defaultGateDir();
  const pid = options.pid ?? process.pid;
  const token = randomBytes2(32).toString("hex");
  const socketPath = join6(gateDir, `${pid}.sock`);
  const discoveryPath = join6(gateDir, "current.json");
  const startedAt = new Date().toISOString();
  await prepareGateDir(gateDir);
  await rm(socketPath, { force: true });
  const server = createServer((req, res) => {
    handleRequest({ req, res, expectedToken: token, gate: options.gate });
  });
  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(socketPath, () => {
      server.off("error", reject);
      resolve();
    });
  });
  await chmod(socketPath, 384).catch(() => {
    return;
  });
  const session = { pid, socketPath, token, startedAt };
  const tmpPath = join6(gateDir, `current.${pid}.tmp`);
  await writeFile4(tmpPath, `${JSON.stringify(session, null, 2)}
`, { encoding: "utf8", mode: 384 });
  await chmod(tmpPath, 384).catch(() => {
    return;
  });
  await rename3(tmpPath, discoveryPath);
  let closed = false;
  const close = async () => {
    if (closed)
      return;
    closed = true;
    await new Promise((resolve) => server.close(() => resolve()));
    await rm(socketPath, { force: true }).catch(() => {
      return;
    });
    try {
      const raw = await readFile7(discoveryPath, "utf8");
      const current = JSON.parse(raw);
      if (current.pid === pid && current.token === token) {
        await rm(discoveryPath, { force: true });
      }
    } catch {}
  };
  return { session, discoveryPath, close };
}
async function dispatchRoute(input) {
  const { method, url, req, gate } = input;
  if (method === "GET" && url.pathname === "/context") {
    const repoRoot = requiredString(url.searchParams.get("repoRoot"), "repoRoot");
    const branch = requiredString(url.searchParams.get("branch"), "branch");
    return { status: 200, payload: await gate.context({ repoRoot, branch }) };
  }
  if (method === "POST" && url.pathname === "/check") {
    const body = await readJsonBody(req);
    return {
      status: 200,
      payload: await gate.check({
        repoRoot: requiredString(body.repoRoot, "repoRoot"),
        branch: requiredString(body.branch, "branch"),
        tool: requiredString(body.tool, "tool"),
        path: typeof body.path === "string" ? body.path : undefined,
        command: typeof body.command === "string" ? body.command : undefined
      })
    };
  }
  if (method === "POST" && url.pathname === "/observe") {
    const body = await readJsonBody(req);
    return {
      status: 200,
      payload: gate.observe({
        repoRoot: requiredString(body.repoRoot, "repoRoot"),
        branch: requiredString(body.branch, "branch"),
        kind: requiredString(body.kind, "kind"),
        summary: requiredString(body.summary, "summary")
      })
    };
  }
  if (method === "POST" && url.pathname === "/stop") {
    const body = await readJsonBody(req);
    return {
      status: 200,
      payload: await gate.stop({
        repoRoot: requiredString(body.repoRoot, "repoRoot"),
        branch: requiredString(body.branch, "branch")
      })
    };
  }
  return { status: 404, payload: { error: "not_found" } };
}
async function handleRequest(input) {
  const auth = input.req.headers.authorization ?? "";
  const provided = auth.startsWith("Bearer ") ? auth.slice(7) : "";
  if (!provided || !constantTimeTokenMatch(provided, input.expectedToken)) {
    writeJson(input.res, 401, { error: "unauthorized" });
    return;
  }
  try {
    const url = new URL(input.req.url ?? "/", "http://localhost");
    const result = await dispatchRoute({ method: input.req.method ?? "GET", url, req: input.req, gate: input.gate });
    writeJson(input.res, result.status, result.payload);
  } catch (error) {
    writeJson(input.res, 400, { error: error instanceof Error ? error.message : String(error) });
  }
}

// src/prompts.ts
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
function requiredString2(args, name) {
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
  const path = requiredString2(args, "path");
  const ticketUrl = requiredString2(args, "ticketUrl");
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
  const flowId = requiredString2(args, "flowId");
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
  const flowId = requiredString2(args, "flowId");
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
  const paths = requiredString2(args, "paths");
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

// src/server.ts
var backend = transportFromEnv();
var gate = new WorkflowGate({ backend });
var artifactSession = createArtifactSessionState();
var TOOLS = [...FLOW_TOOLS, ...ARTIFACT_TOOLS];
async function callTool(name, args) {
  const flow = await callFlowTool({ name, args, backend, gate });
  if (flow !== null)
    return flow;
  const artifact = await callArtifactTool({ name, args, backend, session: artifactSession });
  if (artifact !== null)
    return artifact;
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
        serverInfo: { name: "nosta", version: "0.5.0" }
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
  const ipcReady = process.env.NOSTA_GATE_IPC !== "off" ? startGateIpcServer({ gate }).catch((error) => {
    console.error(`nosta-mcp: failed to start gate IPC: ${errorText(error)}`);
    return null;
  }) : Promise.resolve(null);
  let shutdownPromise = null;
  const shutdown = () => {
    if (!shutdownPromise) {
      shutdownPromise = (async () => {
        gate.close();
        const started = await ipcReady;
        if (started)
          await started.close();
      })();
    }
    return shutdownPromise;
  };
  process.once("SIGINT", () => {
    shutdown().finally(() => process.exit(0));
  });
  process.once("SIGTERM", () => {
    shutdown().finally(() => process.exit(0));
  });
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
  lines.on("close", () => {
    shutdown();
  });
}
if (false) {}

// src/bin.ts
async function readStdinText() {
  const chunks = [];
  for await (const chunk of process.stdin) {
    chunks.push(typeof chunk === "string" ? Buffer.from(chunk) : chunk);
  }
  return Buffer.concat(chunks).toString("utf8");
}
async function runFlowSyncCli(args) {
  let rawJson = null;
  for (let i = 0;i < args.length; i += 1) {
    const arg = args[i];
    if (arg === "--json") {
      const value = args[i + 1];
      if (!value)
        throw new Error("--json requires a JSON string argument");
      rawJson = value;
      i += 1;
    } else if (arg === "--file") {
      const filePath = args[i + 1];
      if (!filePath)
        throw new Error("--file requires a path argument");
      rawJson = await readFile8(filePath, "utf8");
      i += 1;
    }
  }
  const text = rawJson ?? await readStdinText();
  const parsed = flowSyncInputSchema.parse(JSON.parse(text));
  const result = await syncFlow({ args: parsed, backend: transportFromEnv() });
  process.stdout.write(`${JSON.stringify(result)}
`);
}
async function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) {
    startServer();
    return;
  }
  const command = args[0];
  if (command === "--help" || command === "-h") {
    process.stdout.write(`${usageText()}
`);
    return;
  }
  if (command === "install") {
    const options = parseInstallArgs({ argv: args.slice(1) });
    const result = await runInstall(options);
    process.stdout.write(formatInstallSummary(result));
    return;
  }
  if (command === "flow" && args[1] === "sync") {
    await runFlowSyncCli(args.slice(2));
    return;
  }
  throw new Error(`unknown command: ${command}
${usageText()}`);
}
main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Error: ${message}
`);
  process.exit(1);
});
