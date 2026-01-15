# P3b: Backend Routes

**Agent:** backend-dev
**Skip:** frontend-only stories
**Depends:** P3a (services must exist)
**Output:** API route implementations

---

## INPUT
- Services from P3a
- Failing route tests from P2
- Existing route patterns

## TASK (TDD GREEN Phase - Routes)
1. Read test files for route requirements
2. Use services from P3a
3. Implement routes to pass tests
4. Include validation, auth, error handling

## ROUTE PATTERN
```typescript
// Follow existing pattern:
router.post('/api/{resource}', 
  validateRequest(schema),
  async (req, res) => {
    const result = await service.method(req.body);
    res.json(result);
  }
);
```

## CONSTRAINTS
- Use services, don't duplicate logic
- Follow existing route patterns
- Include proper error responses
- All route tests must pass

## CHECKPOINT UPDATE
```yaml
P3b: "✓ backend-dev {HH:MM} routes:{N} tests:{passed}/{total}"
```

## END
```
===HANDOFF===
from: P3b
to: P3c
story: "{STORY_ID}"
status: success
summary: "{N} routes, tests {passed}/{total}"
files_changed:
  - src/routes/{name}.ts
next_input:
  - "API endpoints: {list}"
===NEXT_STEP_READY===
```
