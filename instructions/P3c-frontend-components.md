# P3c: Frontend Components

**Agent:** frontend-dev
**Skip:** backend-only stories
**Parallel:** P3 group (can run with P3a)
**Output:** React components

---

## INPUT
- UX wireframes from P1
- Failing component tests from P2
- Existing component patterns

## TASK (TDD GREEN Phase - Components)
1. Follow wireframes STRICTLY
2. Implement components to pass tests
3. Include all states: default, hover, loading, error
4. Responsive design per wireframe specs

## COMPONENT RULES
```
DO:
- Match wireframe exactly
- Use existing UI components
- Handle loading/error states
- Follow naming conventions

DON'T:
- Deviate from wireframe
- Create duplicate components
- Skip accessibility
```

## CONSTRAINTS
- Check existing components first
- Reuse patterns from similar components
- All component tests must pass
- Match UX states exactly

## CHECKPOINT UPDATE
```yaml
P3c: "✓ frontend-dev {HH:MM} components:{N} tests:{passed}/{total}"
```

## END
```
===HANDOFF===
from: P3c
to: P3d
story: "{STORY_ID}"
status: success
summary: "{N} components, tests {passed}/{total}"
files_changed:
  - src/components/{Name}.tsx
next_input:
  - "Components: {list}"
  - "Use in pages"
===NEXT_STEP_READY===
```
