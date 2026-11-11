# tempi

tempi is an AI harness for co-creating playable games, built on the [pi agent](https://github.com/earendil-works/pi). You describe a game idea, the agent builds a playable first version (web or Godot), you play it and ask for changes — and the loop repeats until you're happy.

## Status

Early development: the co-creation loop runs for the web target; the Godot target is next ([plan](docs/plans/vertical-slice.md)).

See [PROJECT.md](PROJECT.md) for purpose, scope, and open decisions, and [docs/adr/](docs/adr/) for architecture decisions.

## Usage

```sh
npm install && npm run build
node dist/cli.js "a cat catches falling fish"
```

tempi creates a folder for the game (named after the idea), builds a first version with the agent, checks it in headless Chrome, and opens it in your browser. Then it asks what to change: type a change to rebuild, or press Enter to finish.

```
tempi [options] "<game idea>"
  -t, --target <web|godot>  game target (default: web; godot is not built yet)
  -o, --out <dir>           workspace directory (default: a new folder named after the idea)
  -m, --model <pattern>     model, as for pi --model (default: pi's default model)
      --no-open             don't open the game in a browser; print its address only
```

You need a model pi can use (log in with `pi`, then `/login`) and Google Chrome.

## What ships with tempi

tempi's agent runs on the [pi SDK](https://github.com/earendil-works/pi) and ships two pi packages as pinned npm dependencies, so you install nothing extra:

| Package | Gives the agent | Configuration |
| --- | --- | --- |
| [pi-web-access](https://github.com/nicobailon/pi-web-access) | Web search and page fetching (`web_search`, `fetch_content`) | Works without keys through Exa's hosted search, so search queries leave your machine. Optional keys and providers in `~/.pi/agent/web-search.json`. |
| [pi-subagents](https://github.com/nicobailon/pi-subagents) | Delegation to child agents (`subagent`), such as `researcher` and `reviewer` | Optional, in `~/.pi/agent/extensions/subagent/config.json`. Subagents whose role uses the web (such as `researcher`) get web access; no subagent gets MCP tools. |

MCP servers (for generated assets) come from pi's own configuration: add them with `pi mcp add`. Models and logins also come from your pi setup (`pi`, then `/login`).

tempi's sessions do not load your own pi packages, extensions, skills, or prompts. A model provider that comes from one of your extensions is therefore not available in tempi.

In each game workspace tempi writes `.pi/settings.json` (keeps your pi extensions out of background subagents) and keeps its session history in `.tempi/sessions/`.

## Development

Requires Node ≥ 22 and Google Chrome: the web target checks games in headless Chrome ([ADR 0007](docs/adr/0007-headless-web-check-with-playwright-and-installed-chrome.md)), and its tests run it.

```sh
npm install
npm test        # vitest
npm run typecheck
npm run build   # tsc → dist/
```

## Contributing

PRs to `main` please — direct pushes are restricted. Run `npm test` before submitting.

## License

[MIT](https://opensource.org/licenses/MIT)
