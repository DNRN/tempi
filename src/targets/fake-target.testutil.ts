import type { CheckResult, Target } from "./target.js";

/**
 * A scripted target for tests of code that drives targets (the check tool,
 * the CLI loop). It records calls and returns the queued check results in order.
 */
export function createFakeTarget(checks: CheckResult[] = [{ playable: true, errors: [] }]) {
  const calls: string[] = [];
  let next = 0;
  const target: Target = {
    id: "web",
    name: "Fake",
    instructions: "Fake target instructions.",
    assetNotes: "Fake asset notes.",
    async prerequisites() {
      calls.push("prerequisites");
      return [];
    },
    async scaffold(workspace) {
      calls.push(`scaffold ${workspace}`);
    },
    async check(workspace) {
      calls.push(`check ${workspace}`);
      const result = checks[Math.min(next, checks.length - 1)];
      next += 1;
      if (!result) throw new Error("fake target has no check results queued");
      return result;
    },
    async run(workspace) {
      calls.push(`run ${workspace}`);
      return { location: "fake://game", stop: async () => void calls.push("stop") };
    },
  };
  return { target, calls };
}
