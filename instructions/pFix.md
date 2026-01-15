# pFix: Error Recovery

**Agent:** fixer
**Trigger:** Check failure after auto-fix
**Output:** Fixed code, tests passing

---

## INPUT
- Error logs from failed checks (tsc, eslint, build)
- Implementation files
- Auto-fix already attempted and failed

## CONTEXT
Runner already tried:
1. `eslint --fix`
2. `prettier --write`
3. Re-check → still failing

Now you fix what auto-fix couldn't.

## TASK
1. Read error logs carefully
2. Identify root cause for each error
3. Fix one error at a time
4. Run checks after each fix
5. Continue until all checks pass

## ERROR LOG FORMAT (provided by runner)
```
=== TSC ERRORS ===
src/services/auth.ts:45:10 - error TS2339: Property 'x' does not exist

=== ESLINT ERRORS ===
src/routes/users.ts:23 - error: 'unused' is defined but never used

=== BUILD ERRORS ===
Error: Cannot find module './missing'
```

## FIX RULES
```
DO:
- Fix exact error reported
- Check similar files for same issue
- Run checks frequently

DON'T:
- Make unrelated changes
- Refactor while fixing
- Ignore root cause
```

## CHECKPOINT UPDATE
```yaml
pFix: "✓ fixer {HH:MM} errors_fixed:{N} checks:pass"
```

## END - SUCCESS
```
===HANDOFF===
from: pFix
to: "{previous_phase}"
story: "{STORY_ID}"
status: success
summary: "Fixed {N} errors, all checks pass"
files_changed:
  - {list}
===NEXT_STEP_READY===
```

## END - CANNOT FIX
```
BLOCKED: Cannot fix - {reason}
===HANDOFF===
from: pFix
story: "{STORY_ID}"
status: blocked
action: needs_input
remaining_errors:
  - {list}
```
