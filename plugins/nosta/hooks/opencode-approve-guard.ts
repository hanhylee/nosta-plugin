type ToolBeforeInput = {
  tool?: string;
};

type ToolBeforeOutput = {
  args?: Record<string, unknown>;
};

const APPROVE_SUFFIX = "approve_flow";
const TOOLKIT_APPROVE_SUFFIX = "flows_approve";
const TOOLKITS_CALL_SUFFIX = "toolkits_call";
const BYPASS_SUFFIX = "bypass_flow";

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInt(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

function resolveApprovalTarget(
  input: ToolBeforeInput,
  output: ToolBeforeOutput,
): {
  mode: "bypass" | "approve" | "toolkit_approve";
  args: Record<string, unknown>;
} | null {
  const tool = typeof input?.tool === "string" ? input.tool : "";
  const isToolkitsCall = tool.endsWith(TOOLKITS_CALL_SUFFIX);
  const isBypass = tool.endsWith(BYPASS_SUFFIX);
  const isToolkitApprove = tool.endsWith(TOOLKIT_APPROVE_SUFFIX);
  if (
    !tool.endsWith(APPROVE_SUFFIX) &&
    !isToolkitApprove &&
    !isBypass &&
    !isToolkitsCall
  ) {
    return null;
  }
  const raw = output?.args;
  const args =
    raw && typeof raw === "object" && !Array.isArray(raw) ? raw : null;
  if (!args) {
    throw new Error(
      `Nosta approval guard blocked ${tool}: missing arguments. Confirm flow approval or bypass explicitly with the user.`,
    );
  }
  if (isBypass) return { mode: "bypass", args };
  if (!isToolkitsCall) {
    return { mode: isToolkitApprove ? "toolkit_approve" : "approve", args };
  }
  const toolkit = typeof args.toolkit === "string" ? args.toolkit.trim() : "";
  const targetTool = typeof args.tool === "string" ? args.tool.trim() : "";
  if (!toolkit || !targetTool) {
    throw new Error(
      `Nosta approval guard blocked ${tool}: missing toolkit/tool target.`,
    );
  }
  if (toolkit !== "flows" || targetTool !== "approve") return null;
  const nested = args.arguments;
  if (!nested || typeof nested !== "object" || Array.isArray(nested)) {
    throw new Error(
      "Nosta approval guard blocked approve_flow: missing arguments. Confirm flow approval or bypass explicitly with the user.",
    );
  }
  return {
    mode: "toolkit_approve",
    args: nested as Record<string, unknown>,
  };
}

export function checkApproveGuard(
  input: ToolBeforeInput,
  output: ToolBeforeOutput,
): void {
  const target = resolveApprovalTarget(input, output);
  if (!target) return;

  if (target.mode === "bypass") {
    if (!nonEmptyString(target.args.reason)) {
      throw new Error(
        "Nosta approval guard blocked bypass_flow: a non-empty reason and explicit user confirmation are required.",
      );
    }
    return;
  }

  const useToolkitId = target.mode === "toolkit_approve";
  const isLocalNode = !useToolkitId && nonEmptyString(target.args.node);
  const flowTarget = useToolkitId ? target.args.id : target.args.flowId;
  const isCloudGate =
    nonEmptyString(flowTarget) &&
    (target.args.decision === "approve" || target.args.decision === "reject") &&
    positiveInt(target.args.version) &&
    positiveInt(target.args.attempt);

  if (!isLocalNode && !isCloudGate) {
    throw new Error(
      "Nosta approval guard blocked approve_flow: provide either { node } or fresh { flowId, decision, version, attempt } after explicit user confirmation.",
    );
  }
}

export async function NostaApproveGuardPlugin(): Promise<{
  "tool.execute.before": (
    input: ToolBeforeInput,
    output: ToolBeforeOutput,
  ) => Promise<void>;
}> {
  return {
    "tool.execute.before": async (input, output) => {
      checkApproveGuard(input, output);
    },
  };
}
