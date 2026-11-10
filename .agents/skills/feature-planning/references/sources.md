# Sources

Where a feature's description comes from, and how to get all of it. The goal is the description the team agreed on, not the first paragraph someone wrote.

## Set up access

When the settings have no `Tracker` line, ask which tracker the team uses. Offer the common ones as options and always "we don't use one":

| Tracker | Usual way to reach it | Access check |
| --- | --- | --- |
| GitHub issues and PRs | `gh` CLI | `gh auth status`; `gh repo view` in the repository |
| GitLab issues and MRs | `glab` CLI | `glab auth status`; `glab repo view` |
| Jira, Linear, Azure DevOps, YouTrack, others | the harness's MCP tool for it, or the tracker's CLI if the team uses one | one read call through the tool (fetch a known item or list projects) |
| A folder or file in the repository (`issues/`, `docs/specs/`) | read it | the path exists |
| A wiki or other web page | a URL fetch | fetch one page |

- The check fails → show what failed and the step to fix it: `gh auth login`, `glab auth login`, connecting the MCP server in the harness's settings, installing the CLI. Let the user do it; check again when they say it's done. If it still fails, offer to record the tracker anyway (fetches will ask for pasted text) or to stop.
- Record the tracker and how to reach it in one line, such as `- Tracker: GitHub issues, via \`gh\`` or `- Tracker: Jira (project NOTES), via the Atlassian MCP tool`. A project-specific command goes in as written, such as `via \`./tools/tracker\``.
- No tracker → `- Tracker: none`.
- Never create a tracker, a project, a repository, or a token. Never write a token or password into a file.

## Fetch

Get everything that bears on the scope:

- **The item**: title, body, labels, milestone, assignee, state. A closed or duplicate item → say so and ask before planning it.
- **Every comment**, in order. Note decisions and scope changes made in comments, who made them, and whether a later comment overrides them.
- **Linked items**: parent epic, related or blocking issues, earlier PRs that attempted it, the documents it cites. Fetch those that change the scope; list the rest in *Source*.
- **Attachments and screenshots**: describe what they show if you can read them; otherwise list them as not read.

Commands:

| Tracker | Item with comments | Linked items |
| --- | --- | --- |
| GitHub | `gh issue view N --comments`; PRs: `gh pr view N --comments` | `gh issue view N --json body,comments,labels,milestone`; cross-references: `gh api repos/{owner}/{repo}/issues/N/timeline` |
| GitLab | `glab issue view N --comments`; MRs: `glab mr view N --comments` | `glab api projects/:id/issues/N/links` |
| MCP tools | the tool's get-issue or get-ticket call, with comments | its links, relations, or subtasks call |
| URL | fetch the page | follow the links it cites when they define the scope |

What you fetched goes into the plan's *Source* with the link and the date. If anything couldn't be fetched, write that there too.

## Post

When the source is a tracker item and the user agrees, post the open questions after a round, or the summary and a link to the plan at *Ready*:

- GitHub: `gh issue comment N --body-file <file>`; GitLab: `glab issue note N --message "…"`; MCP: the tool's add-comment call.
- Show the exact text first. Post only what the user approved, and say where it went.
- Not possible (no write access, a read-only tool, a URL or file source) → give the user the text to post.
