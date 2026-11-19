# P9.32 — Policy modal save

Both policy editors now close after a successful save, update the Saved status on the Legal & documents page, and show “Privacy policy saved” or “Terms & conditions saved”. Saving shows a loading state and ignores a second click. A failed save keeps the editor open. Cancel discards unsaved text.

Deployment: `4b4714a4` on `main`.

The live check saved each policy, confirmed the new text after refresh, then restored the original text.

| Scenario | Result |
| --- | --- |
| Privacy policy toast | PASS |
| Privacy modal closes | PASS |
| Privacy page status updates | PASS |
| Privacy ignores a second click | PASS |
| Privacy persists after refresh | PASS |
| Terms toast | PASS |
| Terms modal closes | PASS |
| Terms page status updates | PASS |
| Terms ignores a second click | PASS |
| Terms persist after refresh | PASS |
| Cancel closes without saving | PASS |
| Cancel leaves the stored policy unchanged | PASS |
| Original policies restored | PASS |

13/13 PASS.
