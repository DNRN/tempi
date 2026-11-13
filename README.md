# tempi

tempi is an AI harness for co-creating playable games, built on the [pi agent](https://github.com/earendil-works/pi). You describe a game idea, the agent builds a playable first version (web or Godot), you play it and ask for changes — and the loop repeats until you're happy.

## Status

Early development: the co-creation loop runs end to end for both targets, web and Godot, with or without generated assets from your MCP servers, behind pi's own chat interface ([ADR 0008](docs/adr/0008-pi-interactive-tui-as-tempis-front-end.md), [plan](docs/plans/pi-tui-front-end.md)); a plain line-by-line mode remains for piped and scripted runs.

See [PROJECT.md](PROJECT.md) for purpose, scope, and open decisions, and [docs/adr/](docs/adr/) for architecture decisions.

## Setup

1. **Node ≥ 22**, then in this repository: `npm install && npm run build`.
2. **A model** pi can use: run `npx pi`, then `/login` (or set a provider's API key). tempi uses pi's default model unless you pass `--model`.
3. **A game engine** for your target: Google Chrome for web games, or Godot 4 as `godot` on PATH for Godot games.
4. **Asset generators (optional)**: MCP servers that make images, sounds, or 3D models, added with pi's own command. Give each a `--description` of what it makes; tempi shows it to the agent. For example, a local ComfyUI through the `comfy-mcp` server:

   ```sh
   npx pi mcp add comfyui --description "Local ComfyUI: image generation for sprites and textures" \
     --env COMFY_LOCAL_URL=http://127.0.0.1:8188 -- comfy-mcp
   npx pi mcp list   # check that it connects
   ```

   Without any, the agent draws the art in code.

## Usage

```sh
node dist/cli.js "a cat catches falling fish"
node dist/cli.js --target godot "roll a ball through a small obstacle course"
node dist/cli.js            # opens the chat; your first message is the idea
cd a-cat-catches-falling-fish && node ../dist/cli.js   # continues that game
```

tempi opens pi's chat interface ([ADR 0008](docs/adr/0008-pi-interactive-tui-as-tempis-front-end.md)) running its game-building agent: streaming output, tool calls, `/model`, `/login`, interrupt, and session history work as in pi. With an idea, tempi creates a folder for the game (named after the idea), builds a first version with the agent, checks it (headless Chrome for web, headless Godot for Godot), and opens it: in your browser, or in a Godot window. Without one, your first message in the chat is the idea. After each turn that changes the game, tempi checks it again, asks the agent to fix what the check finds, and restarts it; a turn that only answers a question doesn't. `/play` and `/check` start the game and run the check on demand.

Run tempi inside a game folder, or point `--out` at one, and it continues that game instead of starting a new one ([ADR 0010](docs/adr/0010-game-manifest-and-continuing-existing-games.md)): it uses the game's target, reopens its most recent session, and gives the agent the game's idea and its notes. An idea on the command line is then a change request. tempi recognizes its own games by `.tempi/game.json`, and other folders by their engine files (`project.godot` for Godot, `index.html` for web); a `--target` that disagrees with the game is an error. pi finds a game's sessions by the folder's path, so after moving or renaming a game folder tempi starts a new session there (the notes still carry over).

Your messages reach the agent as typed: a change request, or a question about the game. tempi's guidance (the target's rules, assets, budgets) lives in the system prompt instead of wrapping each message.

```
tempi [options] ["<game idea>"]
  -t, --target <web|godot>  game target (default: web, or the existing game's)
  -o, --out <dir>           game folder: new, empty, or an existing game (default: a new folder named after the idea)
  -m, --model <pattern>     model, as for pi --model (default: pi's default model)
      --plain               plain question-and-answer loop instead of the chat interface
      --no-open             don't open the game; print where it is or how to play it
      --no-mcp              don't connect pi's MCP servers: no asset generators, art drawn in code
```

The plain loop is also chosen automatically when input is piped (`echo "make the fish faster" | node dist/cli.js "a cat game"`), and asks line by line what should change. Before the idea is known, the chat runs in a temporary session; the first message creates the game folder and moves the session there.

## What ships with tempi

tempi's agent runs on the [pi SDK](https://github.com/earendil-works/pi) and ships two pi packages as pinned npm dependencies, so you install nothing extra:

| Package | Gives the agent | Configuration |
| --- | --- | --- |
| [pi-web-access](https://github.com/nicobailon/pi-web-access) | Web search and page fetching (`web_search`, `fetch_content`) | Works without keys through Exa's hosted search, so search queries leave your machine. Optional keys and providers in `~/.pi/agent/web-search.json`. |
| [pi-subagents](https://github.com/nicobailon/pi-subagents) | Delegation to child agents (`subagent`), such as `researcher` and `reviewer` | Optional, in `~/.pi/agent/extensions/subagent/config.json`. Subagents whose role uses the web (such as `researcher`) get web access; no subagent gets MCP tools. |

MCP servers (for generated assets) come from pi's own configuration: add them with `pi mcp add`, with a `description` saying what they make (tempi passes it to the agent). tempi asks the agent to use them for the game's images, realistic sounds, and 3D models (at most 6 per build, 3 per change), to synthesize simple game sounds in code, and to fall back to art drawn in code when a generator fails. A server's own defaults may need models you don't have installed, and a server that drives an app (such as Blender) needs that app running. Models and logins also come from your pi setup (`pi`, then `/login`).

tempi's sessions do not load your own pi packages, extensions, skills, or prompts. A model provider that comes from one of your extensions is therefore not available in tempi.

In each game workspace tempi writes `.pi/settings.json` (keeps your pi extensions out of background subagents), records the game's target and idea in `.tempi/game.json`, and keeps its session history in `.tempi/sessions/`, so `pi` opened in the folder can resume it. The agent keeps notes on the game (what it is, controls, file layout, changes) in `.tempi/notes.md`.

## Development

Requires Node ≥ 22, Google Chrome, and Godot 4 (`godot` on PATH): the targets check games in headless Chrome ([ADR 0007](docs/adr/0007-headless-web-check-with-playwright-and-installed-chrome.md)) and headless Godot, and their tests run them.

```sh
npm install
npm test        # vitest: unit tests, end-to-end per target with a scripted model, and a TUI smoke test
npm run test:local-mcp   # end-to-end with your own ComfyUI MCP server (uses the GPU)
npm run typecheck
npm run build   # tsc → dist/
```

## Contributing

PRs to `main` please — direct pushes are restricted. Run `npm test` before submitting.

## License

[MIT](https://opensource.org/licenses/MIT)
