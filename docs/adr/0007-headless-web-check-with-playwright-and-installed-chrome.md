# 0007. Headless web check with Playwright driving the installed Google Chrome

Date: 2026-11-11

## Status
Accepted

Decided by the user during vertical-slice step 6, 2026-11-11: Playwright, with Chrome instead of Chromium.

## Context
The web target's playable check ([vertical-slice plan](../plans/vertical-slice.md), step 6) loads the game without a human and reports console errors, uncaught exceptions, and failed requests, so the agent can fix them before the user plays. Games draw to a canvas (2D or WebGL), so the check needs a real browser engine, not a DOM emulation. Playwright can drive its own downloaded Chromium (about 126 MB per Playwright version) or an installed Google Chrome through its `chrome` channel. The author's machine has Chrome 157; GitHub's Ubuntu runners ship Chrome, and `npx playwright install chrome` installs it where missing.

## Decision
We will run the web check with Playwright (`playwright`, pinned) launching the user's installed Google Chrome with `channel: "chrome"`, headless. tempi downloads no browser. The web target's prerequisite check reports a missing Chrome with how to install it.

## Consequences
- No browser download; the check runs the same engine the user plays in.
- Users need Google Chrome installed. Chromium-only or Firefox-only machines can't run the web target until another channel is supported.
- Chrome updates itself, so the browser under the check is not pinned; a Chrome change can alter behavior between runs. Playwright supports current stable Chrome; a Playwright bump follows when it falls behind.
- CI needs Chrome on the runner (present on GitHub's Ubuntu images; `npx playwright install --with-deps chrome` otherwise).

Rejected alternatives:

- Playwright's bundled Chromium: pinned to the Playwright version and works without a system browser, but adds a 126 MB download per version; the user chose Chrome.
- Puppeteer: equivalent for Chrome, but Playwright's API for console and request events and its multi-browser support fit later targets better.
- jsdom or another DOM emulation: no canvas or WebGL, so it can't tell whether a game runs.
