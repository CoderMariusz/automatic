# P4: Refactor

**Agent:** senior-dev
**Skip:** clean-code (if implementation already clean)
**Output:** Cleaned, DRY code

---

## INPUT
- Implementation from P3
- All tests passing
- Code patterns to follow

## TASK (TDD REFACTOR Phase)
1. Review for duplication (DRY)
2. Improve naming and readability
3. Extract reusable utilities
4. Optimize only if measurable issue
5. RUN TESTS after each change

## REFACTOR CHECKLIST
```
[ ] No duplicated code
[ ] Clear, descriptive names
[ ] Functions do one thing
[ ] No magic numbers/strings
[ ] Follows project patterns
[ ] No commented-out code
[ ] Error messages helpful
[ ] All tests still pass
```

## CONSTRAINTS
- Keep all tests passing
- No functional changes
- No new features
- Profile before optimizing

## CHECKPOINT UPDATE
```yaml
P4: "✓ senior-dev {HH:MM} refactored:{N} files tests:pass"
```

## END
```
===HANDOFF===
from: P4
to: P5
story: "{STORY_ID}"
status: success
summary: "Refactored {N} files, all tests pass"
files_changed:
  - {list}
next_input:
  - "Ready for code review"
===NEXT_STEP_READY===
```
