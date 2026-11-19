# P9.33 — Global toast notifications

Partner actions now share one toast: a compact card centered 28px above the bottom of the screen. Success is green with a check and leaves after about 3 seconds. Errors are red, stay longer, and can be dismissed. The same message is not repeated while it is already on screen, and a later message stacks above the previous one. Hovering pauses the timer. Reduced motion skips the slide. Focus stays where the user left it; the toast is announced as a status.

A success toast appears only after the backend accepts the action. An aborted save shows “Couldn't save changes. Try again.” and leaves the editor open.

Deployment: `d2139a45` on `main`. Live layout: `SupplierLayout-CG3ks5Rd.js`.

The live check saved a privacy policy, stacked a second save, aborted one save, dismissed the error from the keyboard, checked a 390px screen, and checked reduced motion. The original policy text was restored.

| Scenario | Result |
| --- | --- |
| Success toast after save | PASS |
| Duplicate click sends one save | PASS |
| Duplicate message is a single toast | PASS |
| Sits about 28px above the bottom | PASS |
| Hover pauses dismissal | PASS |
| Success leaves after the pause | PASS |
| Consecutive toasts stack | PASS |
| Backend failure shows an error toast | PASS |
| Failed save keeps the editor open | PASS |
| Failed save does not announce success | PASS |
| Dismiss can take keyboard focus | PASS |
| Keyboard dismiss removes the error | PASS |
| Mobile toast stays inside the screen | PASS |
| Reduced motion skips the slide | PASS |
| Original policies restored | PASS |

15/15 PASS.
