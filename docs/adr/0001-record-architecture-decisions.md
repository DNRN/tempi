# 0001. Record architecture decisions

Date: 2026-11-10

## Status
Accepted

## Context
tempi is starting from an empty repository. Choices made now (how the pi agent is driven, how tools reach it, which front end) shape everything built later, and decisions left in chat get re-argued or lost.

## Decision
We will record each architectural decision as an ADR in `docs/adr/`, numbered `NNNN-kebab-title.md`, with the sections Status, Context, Decision, and Consequences. An Accepted ADR is not edited; a change of direction is a new ADR that supersedes it.

## Consequences
Decisions and their rejected alternatives stay findable. Each significant choice costs a short document and a verdict from the user before it is built.

Rejected alternatives:

- Keeping decisions in PROJECT.md's technical-direction table only: it records the choice but not the alternatives or the reasons they lost.
