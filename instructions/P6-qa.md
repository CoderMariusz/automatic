# P6: QA Validation

**Agent:** qa-agent
**Skip:** never
**On Fail:** return to P3
**Post Checks:** full (tsc, eslint, build)
**Output:** PASS or FAIL

---

## INPUT
- Implementation files
- Test files
- Acceptance criteria from story

## TASK
1. Execute full test suite
2. Validate each acceptance criterion
3. Exploratory testing (edge cases)
4. Cross-browser/device (if UI)

## VALIDATION FORMAT
```yaml
acceptance_criteria:
  AC-1:
    status: pass
    notes: null
  AC-2:
    status: pass
    notes: "Edge case: empty input handled"
  AC-3:
    status: fail
    notes: "Error message not shown"
```

## BUGS FORMAT (if found)
```yaml
bugs:
  - id: 1
    severity: high  # critical | high | medium | low
    description: "Error message not displayed"
    steps:
      - "Submit empty form"
      - "Expected: error shown"
      - "Actual: silent fail"
    file: "src/components/Form.tsx"
```

## CHECKPOINT UPDATE
```yaml
# If passed:
P6: "✓ qa-agent {HH:MM} ac:{passed}/{total} bugs:0"

# If failed:
P6: "✗ qa-agent {HH:MM} ac:{passed}/{total} bugs:{N}"
```

## END - PASSED
```
===HANDOFF===
from: P6
to: P7
story: "{STORY_ID}"
status: success
summary: "All {N} AC validated, 0 bugs"
===NEXT_STEP_READY===
```

## END - FAILED
```
BLOCKED: QA failed - {N} bugs found
===HANDOFF===
from: P6
story: "{STORY_ID}"
status: blocked
action: return_to_P3
bugs:
  - {list}
```
