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

---

## CODE PATTERNS

### Pattern: AC Validation Template

```yaml
# GOOD: Structured AC validation with evidence
acceptance_criteria:
  AC-1:
    title: "User can view list of resources"
    given: "User is authenticated"
    when: "User visits /resources page"
    then:
      - "Resources are fetched from API"
      - "Resources are displayed in a list"
    status: pass
    validation:
      - step: "Visited /resources page"
        result: "Page loaded successfully"
        evidence: "HTTP 200, data rendered"
      - step: "Verified API call"
        result: "GET /api/resources returned data"
        evidence: "Network tab shows 200 response with 3 items"
      - step: "Verified display"
        result: "All 3 resources shown in list"
        evidence: "DOM contains 3 list items with correct names"
    notes: null

  AC-2:
    title: "User can create new resource"
    given: "User is on resources page"
    when: "User fills form and submits"
    then:
      - "Resource is created via API"
      - "List is refreshed with new item"
    status: pass
    validation:
      - step: "Clicked 'Add Resource' button"
        result: "Form modal appeared"
      - step: "Filled name field with 'Test Resource'"
        result: "Input accepted"
      - step: "Clicked 'Save'"
        result: "POST /api/resources called, 201 returned"
      - step: "Verified list update"
        result: "New resource appeared in list"
    notes: "Also tested with maximum length name (255 chars) - works correctly"

  AC-3:
    title: "User sees validation errors"
    given: "User is on create form"
    when: "User submits empty form"
    then:
      - "Validation error is displayed"
      - "Form is not submitted"
    status: fail
    validation:
      - step: "Opened form modal"
        result: "Modal displayed"
      - step: "Clicked 'Save' without filling fields"
        result: "No error shown, form submitted"
        expected: "Error message 'Name is required'"
    notes: "BLOCKED: Validation error not displayed"
    bug_id: 1
```

### Pattern: Edge Case Testing Template

```yaml
# GOOD: Systematic edge case coverage
edge_cases:
  empty_states:
    - case: "Empty list"
      steps: "Delete all resources, refresh page"
      expected: "Empty state message shown"
      actual: "Empty state message shown"
      status: pass

    - case: "Empty search results"
      steps: "Search for 'xyznonexistent'"
      expected: "'No results' message"
      actual: "'No results' message"
      status: pass

  boundary_values:
    - case: "Maximum name length (255)"
      steps: "Create resource with 255 char name"
      expected: "Resource created successfully"
      actual: "Resource created successfully"
      status: pass

    - case: "Name over maximum (256)"
      steps: "Attempt to create with 256 char name"
      expected: "Validation error"
      actual: "Validation error shown"
      status: pass

    - case: "Special characters in name"
      steps: "Create resource named '<script>alert(1)</script>'"
      expected: "Name sanitized or rejected"
      actual: "Name stored and displayed safely (HTML escaped)"
      status: pass

  error_conditions:
    - case: "Network failure during fetch"
      steps: "Disable network, refresh page"
      expected: "Error message with retry button"
      actual: "Error message shown, retry works"
      status: pass

    - case: "Network failure during create"
      steps: "Disable network, submit form"
      expected: "Error message, form data preserved"
      actual: "Error shown, form data preserved"
      status: pass

    - case: "Concurrent modification"
      steps: "Open resource in two tabs, edit in both, save"
      expected: "Second save shows conflict or refreshes"
      actual: "Second save overwrites first"
      status: fail
      bug_id: 2

  accessibility:
    - case: "Keyboard navigation"
      steps: "Tab through all interactive elements"
      expected: "All elements reachable, focus visible"
      actual: "All elements reachable"
      status: pass

    - case: "Screen reader"
      steps: "Navigate with VoiceOver/NVDA"
      expected: "All content announced correctly"
      actual: "Not tested (manual test required)"
      status: skipped
```

### Pattern: Bug Report Template

```yaml
# GOOD: Complete, reproducible bug report
bugs:
  - id: 1
    severity: high
    title: "Validation error not displayed on empty form submission"
    description: |
      When user submits the create resource form without filling required fields,
      the form submits without showing validation errors. This allows invalid
      data to be sent to the API (which correctly rejects it with 400).

    environment:
      browser: "Chrome 120"
      os: "macOS 14.2"
      viewport: "1920x1080"

    steps_to_reproduce:
      - "Navigate to /resources"
      - "Click 'Add Resource' button"
      - "Without filling any fields, click 'Save'"

    expected_behavior: |
      - Form should not submit
      - "Name is required" error should appear below name field
      - Focus should move to first invalid field

    actual_behavior: |
      - Form submits
      - API returns 400 error
      - Generic error toast appears
      - User doesn't know which field is invalid

    root_cause: |
      The form onSubmit handler calls service.create() before validating
      with Zod schema. Validation should happen first.

    affected_file: "components/resources/ResourceForm.tsx"
    affected_line: 45

    suggested_fix: |
      ```typescript
      const handleSubmit = async (e: React.FormEvent) => {
        e.preventDefault();
        const parsed = schema.safeParse(formData);
        if (!parsed.success) {
          // Show field errors
          setErrors(parsed.error.flatten().fieldErrors);
          return;
        }
        // Only then call API
        await service.create(parsed.data);
      };
      ```

    screenshots:
      - "bug-1-empty-submit.png"

    priority: P1
    assignee: "return to P3c"

  - id: 2
    severity: medium
    title: "Concurrent edits overwrite without warning"
    description: |
      When the same resource is edited in two browser tabs simultaneously,
      the second save overwrites the first without any conflict detection.

    steps_to_reproduce:
      - "Open resource detail in Tab A"
      - "Open same resource in Tab B"
      - "In Tab A, change name to 'Name A', save"
      - "In Tab B, change name to 'Name B', save"
      - "Refresh both tabs"

    expected_behavior: |
      Tab B should either:
      a) Show conflict warning before save, or
      b) Fail with "resource modified" error

    actual_behavior: |
      Tab B save succeeds silently, overwrites Tab A changes

    root_cause: "No optimistic locking or version checking"

    suggested_fix: |
      Add `updated_at` check in update service:
      - Include updated_at in fetch
      - Send updated_at with update request
      - Backend rejects if updated_at doesn't match

    priority: P2
    note: "Consider for future iteration, not blocker for this story"
```

### Pattern: Full Test Suite Execution

```yaml
# GOOD: Complete test suite results
test_suite:
  execution:
    command: "pnpm test"
    duration: "45s"
    timestamp: "2024-01-15T14:30:00Z"

  summary:
    total: 47
    passed: 46
    failed: 0
    skipped: 1
    coverage:
      statements: 85.2%
      branches: 78.4%
      functions: 91.0%
      lines: 84.8%

  by_category:
    unit_services:
      total: 15
      passed: 15
      files:
        - "__tests__/services/resource-service.test.ts: 8 passed"
        - "__tests__/services/user-service.test.ts: 7 passed"

    unit_components:
      total: 18
      passed: 18
      files:
        - "__tests__/components/ResourceList.test.tsx: 6 passed"
        - "__tests__/components/ResourceCard.test.tsx: 4 passed"
        - "__tests__/components/ResourceForm.test.tsx: 8 passed"

    integration_api:
      total: 12
      passed: 11
      skipped: 1
      files:
        - "__tests__/api/resources.test.ts: 8 passed"
        - "__tests__/api/resources-id.test.ts: 3 passed, 1 skipped"
      notes: "Skipped test requires auth setup not in CI"

    hooks:
      total: 2
      passed: 2
      files:
        - "__tests__/hooks/useResources.test.ts: 2 passed"

  build_checks:
    tsc: pass
    eslint: pass
    build: pass
```

---

## NEGATIVE EXAMPLES (Anti-Patterns)

### Anti-Pattern 1: Incomplete AC Validation

```yaml
# BAD: Just "pass" without evidence
acceptance_criteria:
  AC-1:
    status: pass
  AC-2:
    status: pass
  AC-3:
    status: pass

# GOOD: Detailed validation with evidence
acceptance_criteria:
  AC-1:
    title: "User can view list"
    status: pass
    validation:
      - step: "Visited /resources"
        result: "List displayed with 3 items"
        evidence: "Screenshot attached"
```

### Anti-Pattern 2: Vague Bug Reports

```yaml
# BAD: Not reproducible
bugs:
  - description: "Form doesn't work"
    severity: high

# GOOD: Reproducible with steps
bugs:
  - id: 1
    title: "Form validation not triggered on empty submit"
    severity: high
    steps_to_reproduce:
      - "Navigate to /resources"
      - "Click 'Add Resource'"
      - "Click 'Save' without entering data"
    expected_behavior: "Validation errors shown"
    actual_behavior: "Form submits, API returns 400"
    affected_file: "components/ResourceForm.tsx:45"
```

### Anti-Pattern 3: Skipping Edge Cases

```yaml
# BAD: Only happy path tested
validation:
  - "Created resource - works"
  - "Deleted resource - works"
  - "Done"

# GOOD: Edge cases systematically covered
edge_cases:
  - case: "Empty name"
    status: pass
  - case: "Max length name (255)"
    status: pass
  - case: "Special characters"
    status: pass
  - case: "Network failure"
    status: pass
  - case: "Duplicate name"
    status: fail
    bug_id: 3
```

### Anti-Pattern 4: Wrong Severity Assignment

```yaml
# BAD: Everything is "high"
bugs:
  - severity: high
    description: "Typo in button label"
  - severity: high
    description: "Security: XSS vulnerability"

# GOOD: Appropriate severity
bugs:
  - severity: low
    description: "Typo in button label"
  - severity: critical
    description: "Security: XSS vulnerability in resource name"
```

---

## SELF-CHECK (Before Handoff)

### Test Execution
- [ ] Full test suite executed: `pnpm test`
- [ ] All tests passing (or failures explained)
- [ ] Build successful: `pnpm build`
- [ ] TypeScript clean: `pnpm tsc --noEmit`
- [ ] Lint clean: `pnpm lint`

### AC Validation
- [ ] Every AC explicitly validated
- [ ] Each validation has evidence
- [ ] Failed ACs have bug reports

### Edge Cases
- [ ] Empty states tested
- [ ] Boundary values tested
- [ ] Error conditions tested
- [ ] Network failures tested

### Bug Reports
- [ ] Each bug has reproduction steps
- [ ] Each bug has expected vs actual
- [ ] Severity appropriately assigned
- [ ] Affected file/line identified

---

## OUTPUT SCHEMA

```yaml
output:
  status: pass | fail
  test_suite:
    total: N
    passed: N
    failed: N
    coverage: "N%"
  acceptance_criteria:
    total: N
    passed: N
    failed: N
  edge_cases:
    tested: N
    passed: N
    failed: N
  bugs:
    critical: N
    high: N
    medium: N
    low: N
  build_checks:
    tsc: pass | fail
    eslint: pass | fail
    build: pass | fail
```

---

## VALIDATION FORMAT
```yaml
acceptance_criteria:
  AC-1:
    status: pass
    validation:
      - step: "Action taken"
        result: "What happened"
    notes: null
  AC-2:
    status: fail
    validation:
      - step: "Action taken"
        result: "Unexpected behavior"
    bug_id: 1
```

## BUGS FORMAT (if found)
```yaml
bugs:
  - id: 1
    severity: high  # critical | high | medium | low
    title: "Brief description"
    description: "Detailed description"
    steps_to_reproduce:
      - "Step 1"
      - "Step 2"
    expected_behavior: "What should happen"
    actual_behavior: "What actually happens"
    affected_file: "path/to/file.tsx"
    suggested_fix: "Optional suggestion"
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
