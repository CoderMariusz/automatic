# P5: Code Review

**Agent:** code-reviewer
**Skip:** never
**On Fail:** return to P4
**Output:** APPROVED or REQUEST_CHANGES

---

## INPUT
- All implementation files
- Test files
- Checkpoint history

## TASK
Review against checklist:

## REVIEW CHECKLIST
```
CORRECTNESS:
[ ] Logic matches requirements
[ ] Edge cases handled
[ ] Error handling present

QUALITY:
[ ] Follows coding standards
[ ] No code smells
[ ] DRY principle applied
[ ] Clear naming

SECURITY:
[ ] Input validation
[ ] Auth checks where needed
[ ] No sensitive data exposed

TESTS:
[ ] Tests are meaningful
[ ] Coverage adequate
[ ] Tests maintainable
```

## OUTPUT FORMAT (for issues)
```yaml
issues:
  - id: 1
    severity: must_fix
    file: "src/path/file.ts"
    line: 45
    issue: "Description"
  - id: 2
    severity: should_fix
    file: "src/path/file.ts"
    line: 23
    issue: "Description"
```

## CHECKPOINT UPDATE
```yaml
# If approved:
P5: "✓ code-reviewer {HH:MM} approved issues:0"

# If rejected:
P5: "✗ code-reviewer {HH:MM} issues:{N} decision:request_changes"
```

## END - APPROVED
```
===HANDOFF===
from: P5
to: P6
story: "{STORY_ID}"
status: success
summary: "Code review passed"
===NEXT_STEP_READY===
```

## END - REJECTED
```
BLOCKED: Code review failed - {N} issues
===HANDOFF===
from: P5
story: "{STORY_ID}"
status: blocked
action: return_to_P4
issues:
  - {list}
```
