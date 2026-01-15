# P2: RED - Write Failing Tests

**Agent:** test-writer
**Skip:** never
**Output:** Test files (all failing)

---

## INPUT
- Story context with acceptance criteria
- UX specs from P1 (if UI story)
- Existing test patterns

## TASK (TDD RED Phase)
1. Parse acceptance criteria (Given/When/Then)
2. Design test strategy:
   - Unit tests for components/functions
   - Integration tests for flows
   - E2E tests for user journeys
3. Write tests that FAIL (nothing implemented yet)
4. Verify tests fail with correct error messages

## TEST MAPPING
| Story Type | Unit | Integration | E2E |
|------------|------|-------------|-----|
| backend | services, validators | API endpoints | critical paths |
| frontend | components, hooks | user interactions | user flows |
| fullstack | both | full flow | complete journey |

## CONSTRAINTS
- Tests MUST fail initially
- Cover ALL acceptance criteria
- Follow existing test patterns
- Target 80% coverage for new code

## OUTPUT FORMAT
```
TEST STRATEGY:
- AC-1: Unit (service) + Integration (API)
- AC-2: Unit (component) + E2E (flow)

FILES CREATED:
- tests/{path}/story.test.ts
- tests/{path}/story.integration.test.ts
```

## CHECKPOINT UPDATE
```yaml
P2: "✓ test-writer {HH:MM} tests:{N} files:{N} coverage:{N}%"
```

## END
```
===HANDOFF===
from: P2
to: P3a
story: "{STORY_ID}"
status: success
summary: "{N} tests written, all failing correctly"
files_changed:
  - {test files}
next_input:
  - "Tests in tests/{path}/"
  - "Run: pnpm test"
===NEXT_STEP_READY===
```
