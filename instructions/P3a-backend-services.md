# P3a: Backend Services

**Agent:** backend-dev
**Skip:** frontend-only stories
**Parallel:** P3 group (can run with P3c)
**Output:** Service implementations

---

## INPUT
- Failing tests from P2
- Story context
- Existing service patterns

## TASK (TDD GREEN Phase - Services)
1. Read test files to understand requirements
2. Implement services to pass tests
3. MINIMAL code only - no gold-plating
4. Run tests after each change

## IMPLEMENTATION RULES
```
DO:
- Follow test requirements exactly
- Use existing patterns (check similar services)
- Handle errors appropriately
- Run tests frequently

DON'T:
- Add features not in tests
- Over-engineer
- Skip error handling
- Create unnecessary files
```

## CONSTRAINTS
- UPDATE existing files when possible
- Check if file exists before creating
- Follow project service patterns
- Tests must pass before handoff

## CHECKPOINT UPDATE
```yaml
P3a: "✓ backend-dev {HH:MM} services:{N} tests:{passed}/{total}"
```

## END
```
===HANDOFF===
from: P3a
to: P3b
story: "{STORY_ID}"
status: success
summary: "{N} services, tests {passed}/{total}"
files_changed:
  - src/services/{name}.ts
next_input:
  - "Services in src/services/"
  - "Exports: {list}"
===NEXT_STEP_READY===
```
