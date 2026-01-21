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

---

## REVIEW CHECKLISTS BY FILE TYPE

### Reviewing Services (`lib/services/*.ts`)

```yaml
correctness:
  - [ ] All methods have explicit return types
  - [ ] Error handling in every async method
  - [ ] Database errors don't silently fail
  - [ ] Not found vs error properly distinguished

patterns:
  - [ ] Uses createServerSupabaseClient()
  - [ ] Types imported from lib/types/
  - [ ] Follows existing service patterns
  - [ ] No business logic that belongs in routes

security:
  - [ ] No SQL injection (uses query builder)
  - [ ] No sensitive data in error messages
  - [ ] RLS will apply to queries

example_issues:
  - severity: must_fix
    pattern: "Missing error handling"
    example: |
      // BAD
      async getAll() {
        const { data } = await supabase.from('x').select('*');
        return data;
      }

  - severity: must_fix
    pattern: "Swallowing errors"
    example: |
      // BAD
      if (error) return null;  // Should throw or handle properly
```

### Reviewing Routes (`app/api/**/route.ts`)

```yaml
correctness:
  - [ ] Request body parsed and validated
  - [ ] Response format consistent { success, data, error? }
  - [ ] Status codes appropriate (200, 201, 400, 404, 500)
  - [ ] All paths have try/catch

patterns:
  - [ ] Uses services (no direct Supabase calls)
  - [ ] Zod validation on input
  - [ ] Follows existing route patterns

security:
  - [ ] Input validated before use
  - [ ] No internal errors leaked to client
  - [ ] Auth checked where required

example_issues:
  - severity: must_fix
    pattern: "Missing validation"
    example: |
      // BAD
      const body = await request.json();
      await service.create(body);  // No validation!

  - severity: should_fix
    pattern: "Inconsistent response"
    example: |
      // BAD: Different shapes
      return NextResponse.json(data);  // vs
      return NextResponse.json({ success: true, data });
```

### Reviewing Components (`components/**/*.tsx`)

```yaml
correctness:
  - [ ] All props typed (interface, not inline)
  - [ ] Required states handled (loading, error, empty)
  - [ ] Event handlers typed correctly
  - [ ] Keys provided for lists

patterns:
  - [ ] 'use client' directive where needed
  - [ ] Uses Shadcn/UI components
  - [ ] Follows naming conventions
  - [ ] Props interface exported if reusable

accessibility:
  - [ ] Interactive elements keyboard accessible
  - [ ] Form inputs have labels
  - [ ] Images have alt text
  - [ ] aria-* attributes where needed

example_issues:
  - severity: must_fix
    pattern: "Missing 'use client'"
    example: |
      // BAD: useState without directive
      import { useState } from 'react';  // Will fail!

  - severity: should_fix
    pattern: "Inline types"
    example: |
      // BAD
      function List({ items }: { items: { id: string }[] }) {}
      // GOOD
      interface ListProps { items: Item[] }
      function List({ items }: ListProps) {}
```

### Reviewing Pages (`app/**/page.tsx`)

```yaml
correctness:
  - [ ] Uses hooks from lib/hooks/
  - [ ] All fetch states handled
  - [ ] Navigation works correctly
  - [ ] URL params handled safely

patterns:
  - [ ] Reuses components from P3c
  - [ ] Follows existing page patterns
  - [ ] Loading/error boundaries in place

example_issues:
  - severity: must_fix
    pattern: "Missing error state"
    example: |
      // BAD
      const { data, isLoading } = useResources();
      if (isLoading) return <Skeleton />;
      return <List data={data} />;  // No error handling!

  - severity: should_fix
    pattern: "Duplicating component"
    example: |
      // BAD: Rebuilding ResourceList inline
      {data.map(r => <div key={r.id}>{r.name}</div>)}
      // GOOD: Use existing component
      <ResourceList resources={data} />
```

### Reviewing Tests (`__tests__/**/*.test.ts(x)`)

```yaml
correctness:
  - [ ] Tests actually test the right thing
  - [ ] Assertions are specific (not just "toBeDefined")
  - [ ] Error cases covered
  - [ ] Mocks reset between tests

quality:
  - [ ] Tests are independent
  - [ ] No test interdependencies
  - [ ] Clear test descriptions
  - [ ] Follows AAA pattern (Arrange, Act, Assert)

coverage:
  - [ ] All AC have tests
  - [ ] Edge cases covered
  - [ ] Error paths tested

example_issues:
  - severity: must_fix
    pattern: "Weak assertion"
    example: |
      // BAD
      expect(result).toBeDefined();
      // GOOD
      expect(result).toEqual({ id: '1', name: 'Test' });

  - severity: should_fix
    pattern: "Test depends on other test"
    example: |
      // BAD
      let createdId;
      it('creates', async () => { createdId = ... });
      it('deletes', async () => { await delete(createdId); });
```

---

## ISSUE SEVERITY LEVELS

```yaml
must_fix:
  description: "Blocks approval - must be fixed before merge"
  examples:
    - Security vulnerabilities
    - Missing error handling that will crash
    - Type errors
    - Tests that don't test what they claim
    - Missing 'use client' directive

should_fix:
  description: "Strongly recommended - technical debt if not fixed"
  examples:
    - Inconsistent naming
    - Missing edge case handling
    - Inline types instead of interfaces
    - Duplicated code

consider:
  description: "Optional improvement - nice to have"
  examples:
    - Performance optimization opportunities
    - Alternative patterns that might be cleaner
    - Documentation suggestions
```

---

## CODE PATTERNS

### Pattern: Issue Report Format

```yaml
# GOOD: Specific, actionable issue report
issues:
  - id: 1
    severity: must_fix
    file: "lib/services/resource-service.ts"
    line: 45
    code: |
      async getById(id: string) {
        const { data } = await supabase.from('resources').select().eq('id', id).single();
        return data;
      }
    issue: "Missing error handling - database errors will crash the service"
    suggestion: |
      async getById(id: string): Promise<Resource | null> {
        const { data, error } = await this.supabase
          .from('resources')
          .select('*')
          .eq('id', id)
          .single();

        if (error?.code === 'PGRST116') return null;
        if (error) throw new Error(`Failed to fetch: ${error.message}`);
        return data;
      }

  - id: 2
    severity: should_fix
    file: "components/ResourceList.tsx"
    line: 12
    code: "function ResourceList({ items }: { items: Resource[] })"
    issue: "Inline type definition - harder to reuse and document"
    suggestion: |
      interface ResourceListProps {
        items: Resource[];
        onSelect?: (resource: Resource) => void;
      }
      function ResourceList({ items, onSelect }: ResourceListProps)
```

### Pattern: Approval Summary

```yaml
# GOOD: Clear approval with notes
decision: APPROVED
summary: "Clean implementation following project patterns"
files_reviewed:
  - lib/services/resource-service.ts: "✓ Good error handling"
  - app/api/resources/route.ts: "✓ Proper validation"
  - components/ResourceList.tsx: "✓ All states handled"
  - __tests__/services/resource-service.test.ts: "✓ Comprehensive tests"
notes:
  - "Consider extracting response helpers in future refactor"
  - "Nice use of Zod for validation"
```

---

## NEGATIVE EXAMPLES (Anti-Patterns)

### Anti-Pattern 1: Vague Issue Description

```yaml
# BAD: Not actionable
issues:
  - severity: must_fix
    file: "service.ts"
    issue: "Code looks wrong"

# GOOD: Specific and actionable
issues:
  - severity: must_fix
    file: "lib/services/resource-service.ts"
    line: 23
    issue: "getAll() doesn't handle database errors - will crash on connection failure"
    suggestion: "Add try/catch or check for error property"
```

### Anti-Pattern 2: Bikeshedding

```yaml
# BAD: Nitpicking style preferences
issues:
  - severity: must_fix
    issue: "Should use single quotes instead of double quotes"
  - severity: must_fix
    issue: "Prefer 'const' arrow functions over 'function'"

# GOOD: Focus on real issues
# Style preferences should be handled by ESLint/Prettier, not code review
```

### Anti-Pattern 3: Missing Positive Feedback

```yaml
# BAD: Only criticism
issues:
  - issue: "Error handling missing"
  - issue: "Naming unclear"
  - issue: "No tests for edge case"

# GOOD: Balanced feedback
summary: "Generally solid implementation. Error handling is thorough and tests are comprehensive."
positives:
  - "Good use of TypeScript generics"
  - "Clean separation of concerns"
issues:
  - issue: "One edge case not covered in tests"
```

---

## SELF-CHECK (Before Handoff)

### Review Completeness
- [ ] All implementation files reviewed
- [ ] All test files reviewed
- [ ] Security considerations checked
- [ ] Performance implications considered

### Issue Quality
- [ ] Each issue has specific file and line
- [ ] Each issue has clear description
- [ ] Each must_fix has suggested fix
- [ ] Severity levels appropriate

### Decision Clarity
- [ ] Clear APPROVED or REQUEST_CHANGES
- [ ] If rejected: issues listed with priorities
- [ ] If approved: any notes for future improvement

---

## OUTPUT SCHEMA

```yaml
output:
  decision: APPROVED | REQUEST_CHANGES
  files_reviewed:
    - path: "lib/services/resource-service.ts"
      status: pass | issues_found
    - path: "app/api/resources/route.ts"
      status: pass | issues_found
  issues:
    must_fix: N
    should_fix: N
    consider: N
  summary: "Brief overall assessment"
```

---

## OUTPUT FORMAT (for issues)
```yaml
issues:
  - id: 1
    severity: must_fix
    file: "lib/services/resource-service.ts"
    line: 45
    issue: "Description of issue"
    suggestion: "How to fix"
  - id: 2
    severity: should_fix
    file: "components/ResourceList.tsx"
    line: 23
    issue: "Description of issue"
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
