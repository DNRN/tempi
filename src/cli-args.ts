import { parseArgs } from "node:util";
import { DEFAULT_TARGET } from "./targets/index.js";
import { parseTargetId, TARGET_IDS, type TargetId } from "./targets/target.js";

export const USAGE = `Usage: tempi [options] "<game idea>"

Builds a playable game from your idea with an AI agent, starts it, and asks
what to change. Type a change to rebuild; press Enter (or type done) to finish.

Options:
  -t, --target <${TARGET_IDS.join("|")}>  game target (default: ${DEFAULT_TARGET})
  -o, --out <dir>          workspace directory (default: a new folder named after the idea)
  -m, --model <pattern>    model, as for pi --model (default: pi's default model)
      --no-open            don't open the game in a browser; print its address only
  -h, --help               show this help
  -v, --version            show tempi's version`;

export type CliCommand =
  | { kind: "help" }
  | { kind: "version" }
  | { kind: "create"; idea: string; target: TargetId; out?: string; model?: string; open: boolean };

/** Parses tempi's command line. Throws with a message for the user on bad input. */
export function parseCliArgs(argv: string[]): CliCommand {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      target: { type: "string", short: "t" },
      out: { type: "string", short: "o" },
      model: { type: "string", short: "m" },
      "no-open": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.help) return { kind: "help" };
  if (values.version) return { kind: "version" };
  const idea = positionals.join(" ").trim();
  if (!idea) throw new Error('Describe the game to build, such as: tempi "a cat catches falling fish"');
  return {
    kind: "create",
    idea,
    target: values.target === undefined ? DEFAULT_TARGET : parseTargetId(values.target),
    ...(values.out ? { out: values.out } : {}),
    ...(values.model ? { model: values.model } : {}),
    open: !values["no-open"],
  };
}
