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

---

## REFERENCE CODE

Check these files for patterns before implementing:
- `app/api/` - Existing API route handlers
- `lib/validation/` - Zod schemas for validation
- `lib/services/` - Services to consume

---

## CODE PATTERNS

### Pattern: CRUD Route Handler (Next.js App Router)

```typescript
// GOOD: Complete route with validation, error handling, consistent response
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ResourceService } from '@/lib/services/resource-service';

const service = new ResourceService();

// Validation schemas
const createSchema = z.object({
  name: z.string().min(1).max(255),
  description: z.string().optional(),
});

const updateSchema = z.object({
  name: z.string().min(1).max(255).optional(),
  description: z.string().optional(),
});

// GET /api/resources - List all
export async function GET() {
  try {
    const resources = await service.getAll();
    return NextResponse.json({ success: true, data: resources });
  } catch (error) {
    console.error('GET /api/resources error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch resources' },
      { status: 500 }
    );
  }
}

// POST /api/resources - Create new
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors },
        { status: 400 }
      );
    }

    const resource = await service.create(parsed.data);
    return NextResponse.json({ success: true, data: resource }, { status: 201 });
  } catch (error) {
    console.error('POST /api/resources error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to create resource' },
      { status: 500 }
    );
  }
}
```

### Pattern: Dynamic Route Handler ([id])

```typescript
// GOOD: Route with path parameter handling
// File: app/api/resources/[id]/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { ResourceService } from '@/lib/services/resource-service';

const service = new ResourceService();

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/resources/:id - Get by ID
export async function GET(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const resource = await service.getById(id);

    if (!resource) {
      return NextResponse.json(
        { success: false, error: 'Resource not found' },
        { status: 404 }
      );
    }

    return NextResponse.json({ success: true, data: resource });
  } catch (error) {
    console.error(`GET /api/resources/${(await context.params).id} error:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to fetch resource' },
      { status: 500 }
    );
  }
}

// PUT /api/resources/:id - Update
export async function PUT(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    const body = await request.json();
    const parsed = updateSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors },
        { status: 400 }
      );
    }

    const resource = await service.update(id, parsed.data);
    return NextResponse.json({ success: true, data: resource });
  } catch (error) {
    console.error(`PUT /api/resources/${(await context.params).id} error:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to update resource' },
      { status: 500 }
    );
  }
}

// DELETE /api/resources/:id - Delete
export async function DELETE(
  request: NextRequest,
  context: RouteContext
) {
  try {
    const { id } = await context.params;
    await service.delete(id);
    return NextResponse.json({ success: true, data: null });
  } catch (error) {
    console.error(`DELETE /api/resources/${(await context.params).id} error:`, error);
    return NextResponse.json(
      { success: false, error: 'Failed to delete resource' },
      { status: 500 }
    );
  }
}
```

### Pattern: Validation Schema (Zod)

```typescript
// GOOD: Reusable validation schemas
// File: lib/validation/resource-schema.ts
import { z } from 'zod';

export const createResourceSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255, 'Name too long'),
  description: z.string().max(1000).optional(),
  type: z.enum(['A', 'B', 'C']),
  metadata: z.record(z.string(), z.unknown()).optional(),
});

export const updateResourceSchema = createResourceSchema.partial();

export const resourceQuerySchema = z.object({
  page: z.coerce.number().min(1).default(1),
  limit: z.coerce.number().min(1).max(100).default(20),
  search: z.string().optional(),
  sort: z.enum(['name', 'created_at']).default('created_at'),
  order: z.enum(['asc', 'desc']).default('desc'),
});

export type CreateResourceInput = z.infer<typeof createResourceSchema>;
export type UpdateResourceInput = z.infer<typeof updateResourceSchema>;
export type ResourceQuery = z.infer<typeof resourceQuerySchema>;
```

---

## NEGATIVE EXAMPLES (Anti-Patterns)

### Anti-Pattern 1: Business Logic in Routes

```typescript
// BAD: Route handler does too much
export async function POST(request: NextRequest) {
  const body = await request.json();

  // Business logic should be in service
  const { data, error } = await supabase
    .from('resources')
    .insert(body)
    .select()
    .single();

  if (error) throw error;
  return NextResponse.json(data);
}

// GOOD: Route delegates to service
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json({ success: false, error: parsed.error.errors }, { status: 400 });
    }

    const resource = await service.create(parsed.data);
    return NextResponse.json({ success: true, data: resource }, { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create' }, { status: 500 });
  }
}
```

### Anti-Pattern 2: Inconsistent Response Format

```typescript
// BAD: Different response shapes
export async function GET() {
  return NextResponse.json(resources);  // Array directly
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ data: resource });  // Wrapped in data
}

export async function DELETE() {
  return NextResponse.json({ message: 'Deleted' });  // Different shape
}

// GOOD: Consistent { success, data, error? } format
export async function GET() {
  return NextResponse.json({ success: true, data: resources });
}

export async function POST(request: NextRequest) {
  return NextResponse.json({ success: true, data: resource }, { status: 201 });
}

export async function DELETE() {
  return NextResponse.json({ success: true, data: null });
}
```

### Anti-Pattern 3: Leaking Internal Errors

```typescript
// BAD: Exposes internal error details to client
export async function GET() {
  try {
    const resources = await service.getAll();
    return NextResponse.json({ success: true, data: resources });
  } catch (error) {
    return NextResponse.json(
      { success: false, error: error.message },  // Leaks internal details!
      { status: 500 }
    );
  }
}

// GOOD: Generic message + log details
export async function GET() {
  try {
    const resources = await service.getAll();
    return NextResponse.json({ success: true, data: resources });
  } catch (error) {
    console.error('GET /api/resources error:', error);  // Log for debugging
    return NextResponse.json(
      { success: false, error: 'Failed to fetch resources' },  // Generic message
      { status: 500 }
    );
  }
}
```

### Anti-Pattern 4: Missing Input Validation

```typescript
// BAD: Trusting user input directly
export async function POST(request: NextRequest) {
  const body = await request.json();
  const resource = await service.create(body);  // No validation!
  return NextResponse.json({ success: true, data: resource });
}

// GOOD: Always validate with Zod
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const parsed = createSchema.safeParse(body);

    if (!parsed.success) {
      return NextResponse.json(
        { success: false, error: parsed.error.errors },
        { status: 400 }
      );
    }

    const resource = await service.create(parsed.data);
    return NextResponse.json({ success: true, data: resource }, { status: 201 });
  } catch (error) {
    console.error('POST error:', error);
    return NextResponse.json({ success: false, error: 'Failed to create' }, { status: 500 });
  }
}
```

---

## SELF-CHECK (Before Handoff)

### Code Quality
- [ ] TypeScript compilation: `pnpm tsc --noEmit` passes
- [ ] All imports resolve (services, schemas)
- [ ] Every route has try/catch with error handling
- [ ] Response format consistent: `{ success: boolean, data: T, error?: string }`

### Pattern Compliance
- [ ] Uses services from P3a (no direct Supabase calls)
- [ ] Zod validation on all POST/PUT/PATCH bodies
- [ ] Status codes correct (200 OK, 201 Created, 400 Bad Request, 404 Not Found, 500 Server Error)
- [ ] Errors logged with `console.error` (for debugging)

### Test Requirements
- [ ] All P2 route tests pass: `pnpm test -- api`
- [ ] No `console.log` statements (only `console.error` for errors)
- [ ] Dynamic routes handle missing resources (404)

---

## OUTPUT SCHEMA

```yaml
output:
  status: success | blocked
  files_created:
    - app/api/{resource}/route.ts
    - app/api/{resource}/[id]/route.ts
  files_modified:
    - lib/validation/{resource}-schema.ts
  validation:
    tsc: pass | fail
    tests: "{passed}/{total}"
    route_tests: pass | fail
  endpoints:
    - "GET /api/{resource}"
    - "POST /api/{resource}"
    - "GET /api/{resource}/:id"
    - "PUT /api/{resource}/:id"
    - "DELETE /api/{resource}/:id"
```

---

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
  - app/api/{resource}/route.ts
  - app/api/{resource}/[id]/route.ts
next_input:
  - "API endpoints: {list}"
===NEXT_STEP_READY===
```
