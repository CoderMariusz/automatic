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

---

## REFERENCE CODE

Check these files for patterns before implementing:
- `lib/services/` - Existing service implementations
- `lib/supabase/server.ts` - Server-side Supabase client
- `lib/types/` - Type definitions to import

---

## CODE PATTERNS

### Pattern: Standard Service Class

```typescript
// GOOD: Complete service with proper error handling
import { createServerSupabaseClient } from '@/lib/supabase/server';
import type { Resource, CreateResourceDto, UpdateResourceDto } from '@/lib/types/resource';

export class ResourceService {
  private supabase = createServerSupabaseClient();

  async getAll(): Promise<Resource[]> {
    const { data, error } = await this.supabase
      .from('resources')
      .select('*')
      .order('created_at', { ascending: false });

    if (error) throw new Error(`Failed to fetch resources: ${error.message}`);
    return data || [];
  }

  async getById(id: string): Promise<Resource | null> {
    const { data, error } = await this.supabase
      .from('resources')
      .select('*')
      .eq('id', id)
      .single();

    if (error) {
      if (error.code === 'PGRST116') return null; // Not found
      throw new Error(`Failed to fetch resource: ${error.message}`);
    }
    return data;
  }

  async create(dto: CreateResourceDto): Promise<Resource> {
    const { data, error } = await this.supabase
      .from('resources')
      .insert(dto)
      .select()
      .single();

    if (error) throw new Error(`Failed to create resource: ${error.message}`);
    return data;
  }

  async update(id: string, dto: UpdateResourceDto): Promise<Resource> {
    const { data, error } = await this.supabase
      .from('resources')
      .update(dto)
      .eq('id', id)
      .select()
      .single();

    if (error) throw new Error(`Failed to update resource: ${error.message}`);
    return data;
  }

  async delete(id: string): Promise<void> {
    const { error } = await this.supabase
      .from('resources')
      .delete()
      .eq('id', id);

    if (error) throw new Error(`Failed to delete resource: ${error.message}`);
  }
}
```

### Pattern: Service with Transaction

```typescript
// GOOD: Multi-table operation with proper ordering
async createWithRelated(dto: CreateOrderDto): Promise<Order> {
  // Create parent first
  const { data: order, error: orderError } = await this.supabase
    .from('orders')
    .insert({ user_id: dto.user_id, total: dto.total })
    .select()
    .single();

  if (orderError) throw new Error(`Failed to create order: ${orderError.message}`);

  // Create children with parent reference
  const items = dto.items.map(item => ({
    ...item,
    order_id: order.id
  }));

  const { error: itemsError } = await this.supabase
    .from('order_items')
    .insert(items);

  if (itemsError) {
    // Cleanup on failure
    await this.supabase.from('orders').delete().eq('id', order.id);
    throw new Error(`Failed to create order items: ${itemsError.message}`);
  }

  return order;
}
```

---

## NEGATIVE EXAMPLES (Anti-Patterns)

### Anti-Pattern 1: Untyped Returns

```typescript
// BAD: No return type, caller doesn't know what to expect
async getAll() {
  const { data } = await this.supabase.from('resources').select('*');
  return data;
}

// GOOD: Explicit return type
async getAll(): Promise<Resource[]> {
  const { data, error } = await this.supabase.from('resources').select('*');
  if (error) throw new Error(`Failed to fetch: ${error.message}`);
  return data || [];
}
```

### Anti-Pattern 2: Swallowing Errors

```typescript
// BAD: Error silently ignored, returns undefined
async getById(id: string) {
  try {
    const { data } = await this.supabase.from('resources').select('*').eq('id', id).single();
    return data;
  } catch {
    return null;
  }
}

// GOOD: Distinguish "not found" from real errors
async getById(id: string): Promise<Resource | null> {
  const { data, error } = await this.supabase
    .from('resources')
    .select('*')
    .eq('id', id)
    .single();

  if (error) {
    if (error.code === 'PGRST116') return null; // Not found is OK
    throw new Error(`Failed to fetch resource: ${error.message}`);
  }
  return data;
}
```

### Anti-Pattern 3: Business Logic Leaking into Service

```typescript
// BAD: Validation belongs in route/controller layer
async create(dto: CreateResourceDto) {
  if (!dto.name || dto.name.length < 3) {
    throw new Error('Name must be at least 3 characters');
  }
  // ... database call
}

// GOOD: Service trusts validated input
async create(dto: CreateResourceDto): Promise<Resource> {
  // dto already validated by route handler
  const { data, error } = await this.supabase
    .from('resources')
    .insert(dto)
    .select()
    .single();

  if (error) throw new Error(`Failed to create: ${error.message}`);
  return data;
}
```

### Anti-Pattern 4: Raw SQL in Services

```typescript
// BAD: Bypassing ORM/query builder
async getFiltered(filter: string) {
  const { data } = await this.supabase.rpc('custom_sql', {
    query: `SELECT * FROM resources WHERE name LIKE '%${filter}%'`  // SQL injection!
  });
  return data;
}

// GOOD: Use query builder
async getFiltered(filter: string): Promise<Resource[]> {
  const { data, error } = await this.supabase
    .from('resources')
    .select('*')
    .ilike('name', `%${filter}%`);

  if (error) throw new Error(`Failed to filter: ${error.message}`);
  return data || [];
}
```

---

## SELF-CHECK (Before Handoff)

### Code Quality
- [ ] TypeScript compilation: `pnpm tsc --noEmit` passes
- [ ] All imports resolve (no unresolved module errors)
- [ ] Every async method has explicit return type
- [ ] All Supabase calls check for `error` and throw appropriately

### Pattern Compliance
- [ ] Service class follows existing patterns in `lib/services/`
- [ ] Uses `createServerSupabaseClient()` from `@/lib/supabase/server`
- [ ] Types imported from `@/lib/types/` (not inline)
- [ ] DTOs used for input validation contract

### Test Requirements
- [ ] All P2 service tests pass: `pnpm test -- services`
- [ ] No `console.log` statements left in code
- [ ] Error messages are descriptive (include operation name)

---

## OUTPUT SCHEMA

```yaml
output:
  status: success | blocked
  files_created:
    - lib/services/{name}-service.ts
  files_modified: []
  validation:
    tsc: pass | fail
    tests: "{passed}/{total}"
    service_tests: pass | fail
```

---

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
  - lib/services/{name}-service.ts
next_input:
  - "Services in lib/services/"
  - "Exports: {list}"
===NEXT_STEP_READY===
```
