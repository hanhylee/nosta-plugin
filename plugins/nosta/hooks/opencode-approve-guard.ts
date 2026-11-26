type ToolBeforeInput = {
  tool?: string;
};

type ToolBeforeOutput = {
  args?: Record<string, unknown>;
};

const APPROVE_SUFFIX = "approve_flow";
const BYPASS_SUFFIX = "bypass_flow";

function nonEmptyString(value: unknown): boolean {
  return typeof value === "string" && value.trim().length > 0;
}

function positiveInt(value: unknown): boolean {
  return typeof value === "number" && Number.isInteger(value) && value >= 1;
}

export function checkApproveGuard(
  input: ToolBeforeInput,
  output: ToolBeforeOutput,
): void {
  const tool = typeof input?.tool === "string" ? input.tool : "";
  if (!tool.endsWith(APPROVE_SUFFIX) && !tool.endsWith(BYPASS_SUFFIX)) {
    return;
  }

  const args =
    output?.args && typeof output.args === "object" ? output.args : null;
  if (!args) {
    throw new Error(
      `Nosta approval guard blocked ${tool}: missing arguments. Confirm flow approval or bypass explicitly with the user.`,
    );
  }

  if (tool.endsWith(BYPASS_SUFFIX)) {
    if (!nonEmptyString(args.reason)) {
      throw new Error(
        "Nosta approval guard blocked bypass_flow: a non-empty reason and explicit user confirmation are required.",
      );
    }
    return;
  }

  const isLocalNode = nonEmptyString(args.node);
  const isCloudGate =
    nonEmptyString(args.flowId) &&
    (args.decision === "approve" || args.decision === "reject") &&
    positiveInt(args.version) &&
    positiveInt(args.attempt);

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
