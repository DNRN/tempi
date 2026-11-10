# tempi

tempi is an AI harness for co-creating playable games, built on the [pi agent](https://github.com/earendil-works/pi). You describe a game idea, the agent builds a playable first version (web or Godot), you play it and ask for changes — and the loop repeats until you're happy.

## Status

Early development. The co-creation loop is the first milestone ([plan](docs/plans/vertical-slice.md)); right now the CLI only reports its version:

```sh
node dist/cli.js   # prints: tempi <version>
```

See [PROJECT.md](PROJECT.md) for purpose, scope, and open decisions, and [docs/adr/](docs/adr/) for architecture decisions.

## Development

Requires Node ≥ 22.

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
