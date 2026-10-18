# RQ Continuity Lessons and Handoff Checklist

This file records lessons from real handoff work. Every agent must read it before preparing a handoff and must pass its lessons to the next agent. The goal is to make repeated mistakes unlikely and visible; no checklist can mathematically guarantee zero mistakes, so the final independent verification remains mandatory.

## Lesson 1: Separate application identity from repository identity

The live Worker reports the latest deployed **application code SHA**. `main` may later contain documentation-only commits, so those two identities can legitimately differ. Never call the repository synchronized by comparing only the live Worker SHA with `main`.

Every handoff must state both facts separately:

- the exact clean local `main` SHA matching `origin/main`;
- the exact live application/Worker SHA, with a clear statement about whether the main-to-live difference contains only documentation changes.

Do not record a finite list of future documentation PRs as if it were permanent. Use stable wording such as “`main` contains only documentation-only commits after the application merge,” then verify the actual current `main` SHA in the final response.

## Lesson 2: Re-verify after the last merge, not before it

A documentation PR changes the `main` commit even when it does not change application behavior. After the final merge, every agent must fetch again and verify all of the following from the live systems:

1. local branch is `main`;
2. local `HEAD` equals `origin/main`;
3. working tree is clean;
4. no PR is open;
5. the latest main Production Gate is completed successfully for that exact `HEAD`;
6. live `/api/version` and `/api/health` are operational and report the expected application SHA;
7. the protected `readiness/firestore-decision-gate` branch still has the recorded SHA;
8. the tracked handoff wording is consistent with those facts.

If any value differs, stop the handoff, say exactly what was stale, correct it through the normal PR and gate process, and repeat this checklist.

## Lesson 3: Teach the next agent explicitly

Every copy-ready successor message must include this section in plain language:

> **Handoff lesson:** Re-check state after the final documentation merge. Repository `main` and the live application can have different SHAs when only documentation commits follow the application release. Report both separately, confirm the latest main gate matches the current `main`, and never trust a copied SHA without rechecking it.

The successor must read this file, confirm the lesson was applied, and include the same lesson in the next handoff they produce. This creates a chain of explicit training rather than relying on hidden chat history.

## Safe handoff template

Before saying “ready,” record the current date/time and exact values for `HEAD`, `origin/main`, latest successful main gate, live application SHA, protected decision-branch SHA, and open-PR count. Then compare those values against the tracked roadmap, knowledge base, and maintainer handoff. Use stable descriptions for documentation-only commits and avoid claiming that an unfinished task is pushed, merged, deployed, or live.
