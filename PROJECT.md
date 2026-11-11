# tempi

tempi is an AI harness for creating games, built on the pi agent (badlogic pi-mono). It is its own application that runs the pi agent programmatically and equips it with game-specific tools and prompts, so a user and the agent co-create a playable game in an interactive loop: the user gives an idea, the agent builds a playable first version, the user plays it and asks for changes, and the loop repeats. Intended for public users; the first user is the author.

## Users

- The author: validating the co-creation loop end to end.
- Public users, later: people who want a small game without writing all of it by hand.

## Use cases

1. A user describes a game idea; the pi agent plans and builds a playable first version (a web build or a Godot project), and the user plays it.
2. The user requests changes; the agent edits the game and produces a new playable version; the user replays it. Repeated until the user is happy.

## Scope

### First milestone

- The full co-creation loop: idea → playable game → one round of requested changes → playable again.
- Game targets: web (HTML5) build and Godot. Godot comes from the user's system (`godot` in PATH), run headlessly to check the game.
- Done means: the loop runs hands-off — no manual fixing of the generated game code.

### Later

- Engine selection as an explicit initial step (the agent decides web vs Godot vs other targets from the idea).
- Packaging and distribution for public users.

### Out of scope

- Nothing named yet.

## Success criteria

- From a one-line idea to a playable game plus one round of changes, with no hand-editing of the generated code.

## Technical direction

| Area | Choice | Why |
| --- | --- | --- |
| Architecture | tempi is its own app that drives the pi agent programmatically | Keeps game tooling in tempi; pi stays stock |
| Language | TypeScript / Node | pi's SDK is TypeScript; no bridge layer |
| Agent | pi agent (badlogic pi-mono) | The harness is built from it |
| Bundled pi packages | pi-web-access, pi-subagents: pinned npm dependencies; tempi's sessions load only these, not the user's own pi packages ([ADR 0005](docs/adr/0005-bundle-pi-packages-as-pinned-npm-dependencies.md)) | Web lookups and delegation without setup; same behavior on every machine |
| Game targets | Web (HTML5), checked in headless Google Chrome via Playwright ([ADR 0007](docs/adr/0007-headless-web-check-with-playwright-and-installed-chrome.md)), and Godot 4 (system binary, checked by running it headless) | Simplicity first; more engines later |
| Game assets | Images, sounds, and 3D models from the user's own MCP servers, added with `pi mcp add` ([ADR 0003](docs/adr/0003-mcp-through-pis-built-in-mcp-support.md), [ADR 0004](docs/adr/0004-load-pis-mcp-extensions-in-tempi-sessions.md)); art drawn in code when there are none | tempi bundles no asset service |
| Front end | A plain CLI for the first milestone ([ADR 0002](docs/adr/0002-plain-cli-front-end-for-the-vertical-slice.md)); the long-term front end is open | Least code between an idea and a proven loop |
| Hosting / distribution | open | Not discussed |
| Licence | MIT | Public-facing tool |

## Constraints

- MIT licence. No other constraints stated.

## Open questions

- What do prospective users do today instead (engines, other AI tools), and why isn't it enough?
- Is tempi's long-term front end a CLI, a TUI, or a web UI? (The first milestone uses a plain CLI.)
- How do public users install and run tempi (npm package, binary, hosted)?
- Which LLM providers / API keys must work?
- What is explicitly out of scope, even if related (3D, multiplayer, gen-AI assets)?
- What part of this is the author least sure will work?
