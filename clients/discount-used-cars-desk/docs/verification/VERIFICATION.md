# Verification

Discount Used Cars and Trucks sale desk. **Stub: to be rewritten** once the
checks are re-run for this dealer. The Vega's walks, packet pages, packet
checks and test output were deleted in the fork; they are regenerated, not
carried over.

To fill in (see `.claude/skills/premium-dealer-build/references/verification.md`):

1. Static checks: `tsc --noEmit`, `eslint`, `vitest run`, `next build`.
2. Five sales end to end at 1440×900 and 390×844 with the desk-walk scripts,
   each ending `N / N signed` with `CONTRAST FAILURES 0`, the theme assertion
   passing first.
3. One packet PDF read back: legal name *Discount Used Cars and Trucks, LLC*,
   GDN *P145000*, county *Harris*, the lienholder right for the funding type,
   the odometer identical across documents, no dev host, and `[Not set]` only
   for facts still missing (documentary fee, authorised signer, website
   domain).

`vitest run` regenerates `verification/email-previews/` (the email preview
renderer is a test).
