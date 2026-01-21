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

---

## REFERENCE CODE

Check these files for patterns before writing tests:
- `__tests__/` - Existing test files
- `vitest.config.ts` or `jest.config.ts` - Test configuration
- `lib/test-utils/` - Testing utilities and mocks

---

## CODE PATTERNS

### Pattern: Service Unit Test

```typescript
// GOOD: Complete service test with setup, cases, and teardown
// File: __tests__/services/resource-service.test.ts
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { ResourceService } from '@/lib/services/resource-service';
import { createServerSupabaseClient } from '@/lib/supabase/server';

// Mock Supabase client
vi.mock('@/lib/supabase/server', () => ({
  createServerSupabaseClient: vi.fn(),
}));

describe('ResourceService', () => {
  let service: ResourceService;
  let mockSupabase: any;

  beforeEach(() => {
    vi.clearAllMocks();

    mockSupabase = {
      from: vi.fn().mockReturnThis(),
      select: vi.fn().mockReturnThis(),
      insert: vi.fn().mockReturnThis(),
      update: vi.fn().mockReturnThis(),
      delete: vi.fn().mockReturnThis(),
      eq: vi.fn().mockReturnThis(),
      single: vi.fn().mockReturnThis(),
      order: vi.fn().mockReturnThis(),
    };

    (createServerSupabaseClient as vi.Mock).mockReturnValue(mockSupabase);
    service = new ResourceService();
  });

  describe('getAll', () => {
    it('returns array of resources', async () => {
      const mockResources = [
        { id: '1', name: 'Resource 1' },
        { id: '2', name: 'Resource 2' },
      ];
      mockSupabase.order.mockResolvedValue({ data: mockResources, error: null });

      const result = await service.getAll();

      expect(result).toEqual(mockResources);
      expect(mockSupabase.from).toHaveBeenCalledWith('resources');
    });

    it('returns empty array when no resources', async () => {
      mockSupabase.order.mockResolvedValue({ data: null, error: null });

      const result = await service.getAll();

      expect(result).toEqual([]);
    });

    it('throws on database error', async () => {
      mockSupabase.order.mockResolvedValue({
        data: null,
        error: { message: 'Database error' },
      });

      await expect(service.getAll()).rejects.toThrow('Failed to fetch resources');
    });
  });

  describe('getById', () => {
    it('returns resource when found', async () => {
      const mockResource = { id: '1', name: 'Resource 1' };
      mockSupabase.single.mockResolvedValue({ data: mockResource, error: null });

      const result = await service.getById('1');

      expect(result).toEqual(mockResource);
      expect(mockSupabase.eq).toHaveBeenCalledWith('id', '1');
    });

    it('returns null when not found', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { code: 'PGRST116', message: 'Not found' },
      });

      const result = await service.getById('nonexistent');

      expect(result).toBeNull();
    });
  });

  describe('create', () => {
    it('creates and returns new resource', async () => {
      const input = { name: 'New Resource' };
      const created = { id: '1', name: 'New Resource', created_at: '2024-01-01' };
      mockSupabase.single.mockResolvedValue({ data: created, error: null });

      const result = await service.create(input);

      expect(result).toEqual(created);
      expect(mockSupabase.insert).toHaveBeenCalledWith(input);
    });

    it('throws on creation error', async () => {
      mockSupabase.single.mockResolvedValue({
        data: null,
        error: { message: 'Unique constraint violation' },
      });

      await expect(service.create({ name: 'Duplicate' })).rejects.toThrow(
        'Failed to create resource'
      );
    });
  });
});
```

### Pattern: Component Unit Test

```typescript
// GOOD: Component test with render, user interaction, and assertions
// File: __tests__/components/ResourceList.test.tsx
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ResourceList } from '@/components/resources/ResourceList';

describe('ResourceList', () => {
  const mockResources = [
    { id: '1', name: 'Resource 1', created_at: '2024-01-01T00:00:00Z' },
    { id: '2', name: 'Resource 2', created_at: '2024-01-02T00:00:00Z' },
  ];

  describe('rendering', () => {
    it('renders list of resources', () => {
      render(<ResourceList resources={mockResources} />);

      expect(screen.getByText('Resource 1')).toBeInTheDocument();
      expect(screen.getByText('Resource 2')).toBeInTheDocument();
    });

    it('shows empty state when no resources', () => {
      render(<ResourceList resources={[]} />);

      expect(screen.getByText(/no resources found/i)).toBeInTheDocument();
    });

    it('shows loading skeleton when isLoading', () => {
      render(<ResourceList resources={[]} isLoading />);

      expect(screen.queryByText(/no resources found/i)).not.toBeInTheDocument();
      // Skeleton elements should be present
    });
  });

  describe('interactions', () => {
    it('calls onSelect when item clicked', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(<ResourceList resources={mockResources} onSelect={onSelect} />);

      await user.click(screen.getByText('Resource 1'));

      expect(onSelect).toHaveBeenCalledWith(mockResources[0]);
    });

    it('calls onSelect when Enter key pressed', async () => {
      const user = userEvent.setup();
      const onSelect = vi.fn();

      render(<ResourceList resources={mockResources} onSelect={onSelect} />);

      const firstItem = screen.getByText('Resource 1').closest('[role="button"]');
      firstItem?.focus();
      await user.keyboard('{Enter}');

      expect(onSelect).toHaveBeenCalledWith(mockResources[0]);
    });
  });
});
```

### Pattern: API Integration Test

```typescript
// GOOD: API route test with mock request/response
// File: __tests__/api/resources.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { GET, POST } from '@/app/api/resources/route';
import { NextRequest } from 'next/server';
import { ResourceService } from '@/lib/services/resource-service';

vi.mock('@/lib/services/resource-service');

describe('GET /api/resources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns 200 with resources', async () => {
    const mockResources = [{ id: '1', name: 'Test' }];
    vi.mocked(ResourceService.prototype.getAll).mockResolvedValue(mockResources);

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(200);
    expect(json).toEqual({ success: true, data: mockResources });
  });

  it('returns 500 on service error', async () => {
    vi.mocked(ResourceService.prototype.getAll).mockRejectedValue(
      new Error('Database error')
    );

    const response = await GET();
    const json = await response.json();

    expect(response.status).toBe(500);
    expect(json.success).toBe(false);
    expect(json.error).toBe('Failed to fetch resources');
  });
});

describe('POST /api/resources', () => {
  it('returns 201 with created resource', async () => {
    const input = { name: 'New Resource' };
    const created = { id: '1', ...input, created_at: '2024-01-01' };
    vi.mocked(ResourceService.prototype.create).mockResolvedValue(created);

    const request = new NextRequest('http://localhost/api/resources', {
      method: 'POST',
      body: JSON.stringify(input),
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(201);
    expect(json).toEqual({ success: true, data: created });
  });

  it('returns 400 on validation error', async () => {
    const request = new NextRequest('http://localhost/api/resources', {
      method: 'POST',
      body: JSON.stringify({ name: '' }), // Invalid: empty name
    });

    const response = await POST(request);
    const json = await response.json();

    expect(response.status).toBe(400);
    expect(json.success).toBe(false);
  });
});
```

### Pattern: Hook Test

```typescript
// GOOD: React Query hook test
// File: __tests__/hooks/useResources.test.ts
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { useResources, useCreateResource } from '@/lib/hooks/useResources';

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('useResources', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  it('fetches resources successfully', async () => {
    const mockResources = [{ id: '1', name: 'Test' }];
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: mockResources }),
    } as Response);

    const { result } = renderHook(() => useResources(), {
      wrapper: createWrapper(),
    });

    expect(result.current.isLoading).toBe(true);

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });

    expect(result.current.data).toEqual(mockResources);
  });

  it('handles fetch error', async () => {
    vi.mocked(global.fetch).mockResolvedValue({
      ok: false,
      json: () => Promise.resolve({ error: 'Server error' }),
    } as Response);

    const { result } = renderHook(() => useResources(), {
      wrapper: createWrapper(),
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });

    expect(result.current.error?.message).toContain('Failed to fetch');
  });
});

describe('useCreateResource', () => {
  it('creates resource and invalidates queries', async () => {
    const newResource = { id: '1', name: 'New' };
    vi.mocked(global.fetch).mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ data: newResource }),
    } as Response);

    const { result } = renderHook(() => useCreateResource(), {
      wrapper: createWrapper(),
    });

    await result.current.mutateAsync({ name: 'New' });

    expect(global.fetch).toHaveBeenCalledWith('/api/resources', expect.any(Object));
  });
});
```

---

## NEGATIVE EXAMPLES (Anti-Patterns)

### Anti-Pattern 1: Tests That Pass Initially

```typescript
// BAD: Test passes without implementation (not RED phase)
it('returns resources', async () => {
  const result = await service.getAll();
  expect(result).toBeDefined();  // Too weak, passes with undefined
});

// GOOD: Test that properly fails until implemented
it('returns array of resources', async () => {
  const result = await service.getAll();
  expect(Array.isArray(result)).toBe(true);
  expect(result.length).toBeGreaterThan(0);
  expect(result[0]).toHaveProperty('id');
  expect(result[0]).toHaveProperty('name');
});
```

### Anti-Pattern 2: Missing Error Cases

```typescript
// BAD: Only happy path tested
describe('ResourceService', () => {
  it('creates resource', async () => {
    const result = await service.create({ name: 'Test' });
    expect(result.name).toBe('Test');
  });
});

// GOOD: Error cases also covered
describe('ResourceService', () => {
  it('creates resource successfully', async () => {
    // ...happy path
  });

  it('throws on duplicate name', async () => {
    await expect(service.create({ name: 'Duplicate' })).rejects.toThrow();
  });

  it('throws on empty name', async () => {
    await expect(service.create({ name: '' })).rejects.toThrow();
  });

  it('throws on database error', async () => {
    mockSupabase.single.mockResolvedValue({ data: null, error: { message: 'DB error' }});
    await expect(service.create({ name: 'Test' })).rejects.toThrow('Failed to create');
  });
});
```

### Anti-Pattern 3: Test Interdependencies

```typescript
// BAD: Tests depend on each other
let createdId: string;

it('creates resource', async () => {
  const result = await service.create({ name: 'Test' });
  createdId = result.id;  // Saved for next test
});

it('deletes resource', async () => {
  await service.delete(createdId);  // Depends on previous test!
});

// GOOD: Independent tests with own setup
describe('create', () => {
  it('creates resource', async () => {
    const result = await service.create({ name: 'Test' });
    expect(result.id).toBeDefined();
  });
});

describe('delete', () => {
  it('deletes existing resource', async () => {
    // Own setup
    mockSupabase.delete.mockResolvedValue({ error: null });

    await service.delete('test-id');

    expect(mockSupabase.delete).toHaveBeenCalled();
  });
});
```

### Anti-Pattern 4: Inadequate Mocking

```typescript
// BAD: Real API calls in unit tests
it('fetches resources', async () => {
  const resources = await fetch('/api/resources');  // Real HTTP call!
  expect(resources.ok).toBe(true);
});

// GOOD: Properly mocked
beforeEach(() => {
  global.fetch = vi.fn();
});

it('fetches resources', async () => {
  vi.mocked(global.fetch).mockResolvedValue({
    ok: true,
    json: () => Promise.resolve({ data: [{ id: '1' }] }),
  } as Response);

  const result = await fetchResources();

  expect(global.fetch).toHaveBeenCalledWith('/api/resources');
  expect(result).toEqual([{ id: '1' }]);
});
```

---

## SELF-CHECK (Before Handoff)

### Test Quality
- [ ] Every AC has at least one test
- [ ] Tests FAIL when run (RED phase verified)
- [ ] Error messages indicate what's missing (not generic failures)
- [ ] No skipped tests (`it.skip`, `describe.skip`)

### Coverage
- [ ] Happy path tested for each function/component
- [ ] Error cases tested (validation, database errors)
- [ ] Edge cases considered (empty arrays, null values)
- [ ] Target 80% coverage achievable with these tests

### Test Independence
- [ ] Each test can run in isolation
- [ ] No shared state between tests
- [ ] `beforeEach` resets all mocks
- [ ] No test depends on another test's execution

### Pattern Compliance
- [ ] Uses project test framework (Vitest/Jest)
- [ ] Follows naming convention: `{name}.test.ts(x)`
- [ ] Uses `describe` blocks for grouping
- [ ] Uses descriptive test names

---

## OUTPUT SCHEMA

```yaml
output:
  status: success | blocked
  test_strategy:
    - ac: "AC-1"
      unit: ["service.test.ts"]
      integration: ["api.test.ts"]
    - ac: "AC-2"
      unit: ["component.test.tsx"]
      integration: ["hook.test.ts"]
  files_created:
    - __tests__/services/{name}-service.test.ts
    - __tests__/components/{Name}.test.tsx
    - __tests__/api/{resource}.test.ts
    - __tests__/hooks/use{Name}.test.ts
  validation:
    all_tests_fail: true | false
    ac_coverage: "{covered}/{total}"
    estimated_coverage: "{N}%"
```

---

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
- __tests__/{path}/story.test.ts
- __tests__/{path}/story.integration.test.ts
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
  - "Tests in __tests__/{path}/"
  - "Run: pnpm test"
===NEXT_STEP_READY===
```
