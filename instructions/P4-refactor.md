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

---

## REFERENCE CODE

Check these files for patterns:
- `lib/utils/` - Existing utility functions
- `lib/constants/` - Existing constants
- Similar features in codebase for naming patterns

---

## CODE PATTERNS

### Pattern: Extract Utility Function

```typescript
// BEFORE: Logic duplicated in multiple places
// File: app/api/resources/route.ts
export async function GET() {
  try {
    const resources = await service.getAll();
    return NextResponse.json({ success: true, data: resources });
  } catch (error) {
    console.error('GET /api/resources error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch' }, { status: 500 });
  }
}

// File: app/api/users/route.ts
export async function GET() {
  try {
    const users = await userService.getAll();
    return NextResponse.json({ success: true, data: users });
  } catch (error) {
    console.error('GET /api/users error:', error);
    return NextResponse.json({ success: false, error: 'Failed to fetch' }, { status: 500 });
  }
}

// AFTER: Extracted utility
// File: lib/utils/api-response.ts
export function successResponse<T>(data: T, status = 200) {
  return NextResponse.json({ success: true, data }, { status });
}

export function errorResponse(message: string, status = 500) {
  return NextResponse.json({ success: false, error: message }, { status });
}

// File: app/api/resources/route.ts
import { successResponse, errorResponse } from '@/lib/utils/api-response';

export async function GET() {
  try {
    const resources = await service.getAll();
    return successResponse(resources);
  } catch (error) {
    console.error('GET /api/resources error:', error);
    return errorResponse('Failed to fetch');
  }
}
```

### Pattern: Extract Constants

```typescript
// BEFORE: Magic strings scattered
// File: lib/services/resource-service.ts
if (error.code === 'PGRST116') return null;

// File: components/ResourceForm.tsx
if (name.length > 255) {
  setError('Name cannot exceed 255 characters');
}

// AFTER: Centralized constants
// File: lib/constants/index.ts
export const SUPABASE_NOT_FOUND_CODE = 'PGRST116';

export const LIMITS = {
  RESOURCE_NAME_MAX: 255,
  DESCRIPTION_MAX: 1000,
  PAGE_SIZE_DEFAULT: 20,
  PAGE_SIZE_MAX: 100,
} as const;

export const ERROR_MESSAGES = {
  RESOURCE_NAME_TOO_LONG: `Name cannot exceed ${LIMITS.RESOURCE_NAME_MAX} characters`,
  FETCH_FAILED: 'Failed to fetch resources',
  CREATE_FAILED: 'Failed to create resource',
} as const;

// Usage
import { SUPABASE_NOT_FOUND_CODE, LIMITS, ERROR_MESSAGES } from '@/lib/constants';

if (error.code === SUPABASE_NOT_FOUND_CODE) return null;
if (name.length > LIMITS.RESOURCE_NAME_MAX) {
  setError(ERROR_MESSAGES.RESOURCE_NAME_TOO_LONG);
}
```

### Pattern: Simplify Conditionals

```typescript
// BEFORE: Nested conditionals
function getStatusBadge(resource: Resource) {
  if (resource.status === 'active') {
    if (resource.isPremium) {
      return <Badge variant="gold">Premium Active</Badge>;
    } else {
      return <Badge variant="default">Active</Badge>;
    }
  } else if (resource.status === 'inactive') {
    return <Badge variant="secondary">Inactive</Badge>;
  } else if (resource.status === 'pending') {
    return <Badge variant="outline">Pending</Badge>;
  } else {
    return <Badge variant="destructive">Unknown</Badge>;
  }
}

// AFTER: Lookup table
const STATUS_BADGE_CONFIG: Record<string, { variant: string; label: string }> = {
  active: { variant: 'default', label: 'Active' },
  'active-premium': { variant: 'gold', label: 'Premium Active' },
  inactive: { variant: 'secondary', label: 'Inactive' },
  pending: { variant: 'outline', label: 'Pending' },
};

function getStatusBadge(resource: Resource) {
  const key = resource.status === 'active' && resource.isPremium
    ? 'active-premium'
    : resource.status;

  const config = STATUS_BADGE_CONFIG[key] || { variant: 'destructive', label: 'Unknown' };
  return <Badge variant={config.variant}>{config.label}</Badge>;
}
```

### Pattern: Extract Component Logic to Hook

```typescript
// BEFORE: Logic mixed with rendering
function ResourceList() {
  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState('name');

  useEffect(() => {
    fetch('/api/resources')
      .then(res => res.json())
      .then(data => setResources(data.data))
      .catch(err => setError(err))
      .finally(() => setIsLoading(false));
  }, []);

  const filteredResources = resources.filter(r =>
    r.name.toLowerCase().includes(search.toLowerCase())
  );

  const sortedResources = [...filteredResources].sort((a, b) =>
    sortBy === 'name' ? a.name.localeCompare(b.name) : a.created_at.localeCompare(b.created_at)
  );

  // ... rendering
}

// AFTER: Logic in custom hook
// File: lib/hooks/useResourceList.ts
export function useResourceList() {
  const { data: resources, isLoading, error } = useResources();
  const [search, setSearch] = useState('');
  const [sortBy, setSortBy] = useState<'name' | 'date'>('name');

  const filteredAndSorted = useMemo(() => {
    if (!resources) return [];

    return resources
      .filter(r => r.name.toLowerCase().includes(search.toLowerCase()))
      .sort((a, b) =>
        sortBy === 'name'
          ? a.name.localeCompare(b.name)
          : a.created_at.localeCompare(b.created_at)
      );
  }, [resources, search, sortBy]);

  return {
    resources: filteredAndSorted,
    isLoading,
    error,
    search,
    setSearch,
    sortBy,
    setSortBy,
  };
}

// File: components/ResourceList.tsx
function ResourceList() {
  const { resources, isLoading, error, search, setSearch, sortBy, setSortBy } = useResourceList();
  // ... clean rendering only
}
```

### Pattern: Reduce Function Complexity

```typescript
// BEFORE: Function does too many things
async function createResourceWithValidation(input: unknown) {
  // Validate input
  if (!input || typeof input !== 'object') {
    throw new Error('Invalid input');
  }
  if (!input.name || typeof input.name !== 'string') {
    throw new Error('Name is required');
  }
  if (input.name.length > 255) {
    throw new Error('Name too long');
  }

  // Check for duplicates
  const existing = await supabase.from('resources').select().eq('name', input.name).single();
  if (existing.data) {
    throw new Error('Resource already exists');
  }

  // Create resource
  const { data, error } = await supabase.from('resources').insert(input).select().single();
  if (error) throw error;

  // Send notification
  await sendNotification(`New resource: ${data.name}`);

  // Log analytics
  await analytics.track('resource_created', { id: data.id });

  return data;
}

// AFTER: Single responsibility
// File: lib/validation/resource-schema.ts
export const createResourceSchema = z.object({
  name: z.string().min(1).max(255),
});

// File: lib/services/resource-service.ts
async function checkDuplicate(name: string): Promise<boolean> {
  const { data } = await this.supabase.from('resources').select().eq('name', name).single();
  return !!data;
}

async function create(dto: CreateResourceDto): Promise<Resource> {
  const { data, error } = await this.supabase.from('resources').insert(dto).select().single();
  if (error) throw new Error(`Failed to create: ${error.message}`);
  return data;
}

// File: app/api/resources/route.ts
export async function POST(request: NextRequest) {
  const body = await request.json();
  const parsed = createResourceSchema.safeParse(body);
  if (!parsed.success) return errorResponse('Validation failed', 400);

  if (await service.checkDuplicate(parsed.data.name)) {
    return errorResponse('Resource already exists', 409);
  }

  const resource = await service.create(parsed.data);

  // Side effects handled separately (event-driven or background job)
  await Promise.all([
    sendNotification(`New resource: ${resource.name}`),
    analytics.track('resource_created', { id: resource.id }),
  ]);

  return successResponse(resource, 201);
}
```

---

## NEGATIVE EXAMPLES (Anti-Patterns)

### Anti-Pattern 1: Changing Behavior During Refactor

```typescript
// BAD: "Refactor" that changes functionality
// Before: Returns all resources
async function getAll(): Promise<Resource[]> {
  const { data } = await supabase.from('resources').select('*');
  return data || [];
}

// After: "Refactor" adds pagination - this is a NEW FEATURE!
async function getAll(page = 1, limit = 20): Promise<Resource[]> {
  const { data } = await supabase
    .from('resources')
    .select('*')
    .range((page - 1) * limit, page * limit - 1);
  return data || [];
}

// GOOD: Pure refactor - same behavior, cleaner code
// Before
async function getAll(): Promise<Resource[]> {
  const { data, error } = await supabase.from('resources').select('*');
  if (error) throw error;
  return data || [];
}

// After (still returns all, just cleaner error handling)
async function getAll(): Promise<Resource[]> {
  const { data, error } = await this.supabase
    .from('resources')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) throw new Error(`Failed to fetch: ${error.message}`);
  return data ?? [];
}
```

### Anti-Pattern 2: Premature Optimization

```typescript
// BAD: Optimizing without evidence of problem
// "Let's memoize everything!"
const MemoizedResourceCard = memo(ResourceCard);
const memoizedFormat = useMemo(() => formatDate(date), [date]);
const memoizedHandler = useCallback(() => onClick(id), [onClick, id]);

// GOOD: Only optimize when measured
// Profile first, then add memoization where needed
// Comments explain why optimization was added
const MemoizedResourceCard = memo(ResourceCard);
// ^ Memoized because profiler showed 50+ re-renders on list scroll
```

### Anti-Pattern 3: Over-Abstracting

```typescript
// BAD: Abstraction for single use case
// File: lib/utils/resource-name-validator.ts
export function validateResourceName(name: string): boolean {
  return name.length > 0 && name.length <= 255;
}

// Used only once in the entire codebase

// GOOD: Inline until pattern repeats 3+ times
const isValidName = name.length > 0 && name.length <= 255;

// Or use Zod schema which serves multiple purposes
const schema = z.object({
  name: z.string().min(1).max(255),
});
```

### Anti-Pattern 4: Removing "Unused" Error Handling

```typescript
// BAD: Removing error handling that "seems unused"
// Before
async function getById(id: string) {
  const { data, error } = await supabase.from('resources').select().eq('id', id).single();
  if (error) {
    if (error.code === 'PGRST116') return null;
    throw new Error(`Failed: ${error.message}`);
  }
  return data;
}

// After - "simplified" by removing error handling
async function getById(id: string) {
  const { data } = await supabase.from('resources').select().eq('id', id).single();
  return data;  // Silently returns undefined on error!
}

// GOOD: Keep error handling, just clean it up
async function getById(id: string): Promise<Resource | null> {
  const { data, error } = await this.supabase
    .from('resources')
    .select('*')
    .eq('id', id)
    .single();

  if (error?.code === SUPABASE_NOT_FOUND_CODE) return null;
  if (error) throw new Error(`Failed to fetch resource: ${error.message}`);

  return data;
}
```

---

## SELF-CHECK (Before Handoff)

### Test Verification
- [ ] All tests still pass: `pnpm test`
- [ ] No new tests needed (behavior unchanged)
- [ ] Test coverage unchanged or improved

### Code Quality
- [ ] No duplicated code (DRY)
- [ ] Clear, descriptive names
- [ ] Functions do one thing
- [ ] No magic numbers/strings (use constants)

### Clean Code
- [ ] No `console.log` statements (except error logging)
- [ ] No commented-out code
- [ ] No TODO comments left unaddressed
- [ ] Imports organized and minimal

### Behavior Preservation
- [ ] No functional changes made
- [ ] No new features added
- [ ] API contracts unchanged
- [ ] Component props unchanged

---

## OUTPUT SCHEMA

```yaml
output:
  status: success | blocked
  refactorings:
    - type: "extract_utility"
      description: "Extracted API response helpers"
      files: ["lib/utils/api-response.ts"]
    - type: "extract_constants"
      description: "Centralized error messages"
      files: ["lib/constants/index.ts"]
  files_modified:
    - path: "app/api/resources/route.ts"
      changes: "Use response helpers"
    - path: "lib/services/resource-service.ts"
      changes: "Use constants for error codes"
  validation:
    tests: "pass"
    behavior_changed: false
    lines_removed: N
    lines_added: N
```

---

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
