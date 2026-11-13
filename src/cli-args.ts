import { parseArgs } from "node:util";
import { DEFAULT_TARGET } from "./targets/index.js";
import { parseTargetId, TARGET_IDS, type TargetId } from "./targets/target.js";

export const USAGE = `Usage: tempi [options] ["<game idea>"]

Opens pi's chat interface running tempi's game-building agent. With an idea,
the game is built right away; without one, your first message is the idea.
Type a change to rebuild; /play and /check run the game and tempi's check.

Run tempi inside a game folder (or point --out at one) to continue that game:
its engine and last conversation are picked up, and an idea is a change request.

Options:
  -t, --target <${TARGET_IDS.join("|")}>  game target (default: ${DEFAULT_TARGET}, or the existing game's)
  -o, --out <dir>          game folder: new, empty, or an existing game (default: a new folder named after the idea)
  -m, --model <pattern>    model, as for pi --model (default: pi's default model)
      --plain              plain question-and-answer loop instead of the chat interface
      --no-open            don't open the game; print where it is or how to play it
      --no-mcp             don't connect pi's MCP servers: no asset generators, art drawn in code
  -h, --help               show this help
  -v, --version            show tempi's version`;

export type CliCommand =
  | { kind: "help" }
  | { kind: "version" }
  | {
      kind: "create";
      idea?: string;
      /** Only when given: without it, an existing game's target or the default is used. */
      target?: TargetId;
      out?: string;
      model?: string;
      plain: boolean;
      open: boolean;
      mcp: boolean;
    };

/** Parses tempi's command line. Throws with a message for the user on bad input. */
export function parseCliArgs(argv: string[]): CliCommand {
  const { values, positionals } = parseArgs({
    args: argv,
    allowPositionals: true,
    options: {
      target: { type: "string", short: "t" },
      out: { type: "string", short: "o" },
      model: { type: "string", short: "m" },
      plain: { type: "boolean" },
      "no-open": { type: "boolean" },
      "no-mcp": { type: "boolean" },
      help: { type: "boolean", short: "h" },
      version: { type: "boolean", short: "v" },
    },
  });
  if (values.help) return { kind: "help" };
  if (values.version) return { kind: "version" };
  const idea = positionals.join(" ").trim() || undefined;
  return {
    kind: "create",
    ...(idea ? { idea } : {}),
    ...(values.target === undefined ? {} : { target: parseTargetId(values.target) }),
    ...(values.out ? { out: values.out } : {}),
    ...(values.model ? { model: values.model } : {}),
    plain: values.plain === true,
    open: !values["no-open"],
    mcp: !values["no-mcp"],
  };
}
