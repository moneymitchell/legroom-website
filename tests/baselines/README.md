# Reference baselines

The approved design, frozen. `scripts/compare-reference.mjs` diffs every
section of the build against these and fails at 0.8% differing pixels, with
written per-section allowances for the frames whose copy has since changed on
the client's instruction.

They live **in the repo**, not in `../handoff/reference/screens`, because a
visual regression gate that only exists on one laptop is not a gate. CI has no
`handoff/` directory, and the comparator counts a missing baseline as a
failure, so before this directory existed the pixel gate could not run on any
machine but the one that shot it.

`../handoff/` is still the human source of truth for the design: eight running
HTML files you can open and look at. This is the machine contract taken from
it. If the design is ever re-approved, re-shoot from handoff and update both.

Seven files, not eight. `07-kit.png` is the type and colour specimen sheet;
it is not a section of the site and the comparator does not reference it.
