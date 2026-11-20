# Action invocation context fixtures (SPIKE-A2)

ASSUMED shapes, not recordings. No Forge site was available when these were written
(the Forge CLI is not logged in), so each file is our best reading of the Forge/Rovo
documentation for one caller. When SPIKE-A2 runs, replace each file with a scrubbed
recording and keep the tests green.

Each file has:

- `payloadContext`: what the caller puts in `payload.context` next to the inputs.
- `invocationContext`: the second argument of the Forge function handler.
- `inputStyle`: how this caller encodes non-string inputs. `native` means JSON numbers and
  booleans. `strings` means `"5"` and `"true"`.

The placeholders `{{issueKey}}` and `{{projectKey}}` are filled in by the tests. Account
ids are the in-memory fakes' test users, never real people.
