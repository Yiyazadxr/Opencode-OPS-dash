## Summary

<!-- What changed, and why? Link the issue if there is one. -->

## Type

- [ ] Bug fix
- [ ] Metrics / data correctness
- [ ] UI / rendering
- [ ] Bridge (`server.mjs`)
- [ ] Launcher / startup
- [ ] Docs
- [ ] Refactor

## Test plan

<!-- Paste the result of the CONTRIBUTING checklist. State which environments you actually tested. -->

- [ ] `node --check server.mjs`
- [ ] `node scripts/check-links.mjs`
- [ ] Launcher: double-click → old instance closed → bridge starts → browser opens
- [ ] Top metrics match the stats endpoint item by item
- [ ] Drawer opens and closes; a late response does not reopen it
- [ ] Fallback: stale snapshot first, simulated data when nothing was ever received
- [ ] Console: no new errors or warnings
- [ ] Verified in: <!-- browser · OS · OpenCode version -->

## Safety

- [ ] The bridge is still read-only (GET only; `ALLOWED_UPSTREAM` updated if a new path was added)
- [ ] No credential appears in the page, snapshots, logs or error messages
- [ ] No external request was added; new fonts are embedded and registered in `NOTICE`
- [ ] All upstream text is escaped before rendering (quotes included)
- [ ] `start-dashboard.cmd` still contains ASCII only

## Screenshots

<!-- Before / after if the UI changed. -->
