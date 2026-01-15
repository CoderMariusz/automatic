# P3d: Frontend Pages & Hooks

**Agent:** frontend-dev
**Skip:** backend-only stories
**Depends:** P3c (components), P3b (API if fullstack)
**Output:** Pages, hooks, API integration

---

## INPUT
- Components from P3c
- API endpoints from P3b (if fullstack)
- Failing page/integration tests from P2

## TASK (TDD GREEN Phase - Pages)
1. Compose pages using components from P3c
2. Create hooks for data fetching
3. Integrate with API endpoints
4. Handle all UX states

## PAGE PATTERN
```typescript
export default function PageName() {
  const { data, isLoading, error } = useHook();
  
  if (isLoading) return <Loading />;
  if (error) return <Error message={error} />;
  
  return <Component data={data} />;
}
```

## CONSTRAINTS
- Use components from P3c (don't duplicate)
- Follow existing page patterns
- Handle loading/error states
- All page tests must pass

## CHECKPOINT UPDATE
```yaml
P3d: "✓ frontend-dev {HH:MM} pages:{N} hooks:{N} tests:{passed}/{total}"
```

## END
```
===HANDOFF===
from: P3d
to: P4
story: "{STORY_ID}"
status: success
summary: "{N} pages, {N} hooks, all tests pass"
files_changed:
  - src/pages/{name}.tsx
  - src/hooks/use{Name}.ts
next_input:
  - "Implementation complete"
  - "Ready for refactor"
===NEXT_STEP_READY===
```
