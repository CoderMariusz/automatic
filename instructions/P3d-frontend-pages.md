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

---

## REFERENCE CODE

Check these files for patterns before implementing:
- `app/` - Existing pages (App Router)
- `lib/hooks/` - Existing custom hooks
- `components/` - Components from P3c to use

---

## CODE PATTERNS

### Pattern: Data Fetching Hook (React Query)

```typescript
// GOOD: Complete hook with query and mutations
// File: lib/hooks/useResources.ts
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import type { Resource, CreateResourceDto, UpdateResourceDto } from '@/lib/types/resource';

// API functions
async function fetchResources(): Promise<Resource[]> {
  const res = await fetch('/api/resources');
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch resources');
  }
  const json = await res.json();
  return json.data;
}

async function fetchResource(id: string): Promise<Resource> {
  const res = await fetch(`/api/resources/${id}`);
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to fetch resource');
  }
  const json = await res.json();
  return json.data;
}

async function createResource(data: CreateResourceDto): Promise<Resource> {
  const res = await fetch('/api/resources', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to create resource');
  }
  const json = await res.json();
  return json.data;
}

async function updateResource({ id, data }: { id: string; data: UpdateResourceDto }): Promise<Resource> {
  const res = await fetch(`/api/resources/${id}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(data),
  });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to update resource');
  }
  const json = await res.json();
  return json.data;
}

async function deleteResource(id: string): Promise<void> {
  const res = await fetch(`/api/resources/${id}`, { method: 'DELETE' });
  if (!res.ok) {
    const error = await res.json();
    throw new Error(error.error || 'Failed to delete resource');
  }
}

// Hooks
export function useResources() {
  return useQuery({
    queryKey: ['resources'],
    queryFn: fetchResources,
  });
}

export function useResource(id: string) {
  return useQuery({
    queryKey: ['resources', id],
    queryFn: () => fetchResource(id),
    enabled: !!id,
  });
}

export function useCreateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}

export function useUpdateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: updateResource,
    onSuccess: (data) => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
      queryClient.setQueryData(['resources', data.id], data);
    },
  });
}

export function useDeleteResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: deleteResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}
```

### Pattern: Page Component (Client with Data Fetching)

```typescript
// GOOD: Page that fetches and displays data
// File: app/resources/page.tsx
'use client';

import { useState } from 'react';
import { useResources, useDeleteResource } from '@/lib/hooks/useResources';
import { ResourceList } from '@/components/resources/ResourceList';
import { ResourceForm } from '@/components/resources/ResourceForm';
import { ConfirmDialog } from '@/components/shared/ConfirmDialog';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Plus } from 'lucide-react';
import type { Resource } from '@/lib/types/resource';

export default function ResourcesPage() {
  const { data: resources, isLoading, error } = useResources();
  const deleteResource = useDeleteResource();

  const [showForm, setShowForm] = useState(false);
  const [resourceToDelete, setResourceToDelete] = useState<Resource | null>(null);

  const handleDelete = async () => {
    if (!resourceToDelete) return;
    try {
      await deleteResource.mutateAsync(resourceToDelete.id);
      setResourceToDelete(null);
    } catch {
      // Error handled by mutation
    }
  };

  return (
    <div className="container py-6 space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold">Resources</h1>
        <Button onClick={() => setShowForm(true)}>
          <Plus className="h-4 w-4 mr-2" />
          Add Resource
        </Button>
      </div>

      {error && (
        <Alert variant="destructive">
          <AlertDescription>{error.message}</AlertDescription>
        </Alert>
      )}

      <ResourceList
        resources={resources || []}
        isLoading={isLoading}
        onDelete={(resource) => setResourceToDelete(resource)}
      />

      {showForm && (
        <ResourceForm
          onSubmit={async (data) => {
            // handle submit
            setShowForm(false);
          }}
          onCancel={() => setShowForm(false)}
        />
      )}

      <ConfirmDialog
        open={!!resourceToDelete}
        onOpenChange={(open) => !open && setResourceToDelete(null)}
        title="Delete Resource"
        description={`Are you sure you want to delete "${resourceToDelete?.name}"? This action cannot be undone.`}
        onConfirm={handleDelete}
        variant="destructive"
        isLoading={deleteResource.isPending}
      />
    </div>
  );
}
```

### Pattern: Page Component (Server with Suspense)

```typescript
// GOOD: Server component with loading boundary
// File: app/resources/page.tsx
import { Suspense } from 'react';
import { ResourceList } from '@/components/resources/ResourceList';
import { ResourceListSkeleton } from '@/components/resources/ResourceListSkeleton';
import { createServerSupabaseClient } from '@/lib/supabase/server';

async function ResourcesData() {
  const supabase = createServerSupabaseClient();
  const { data: resources, error } = await supabase
    .from('resources')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    throw new Error('Failed to load resources');
  }

  return <ResourceList resources={resources || []} />;
}

export default function ResourcesPage() {
  return (
    <div className="container py-6 space-y-6">
      <h1 className="text-2xl font-bold">Resources</h1>

      <Suspense fallback={<ResourceListSkeleton />}>
        <ResourcesData />
      </Suspense>
    </div>
  );
}
```

### Pattern: Detail Page with Dynamic Route

```typescript
// GOOD: Detail page with [id] param
// File: app/resources/[id]/page.tsx
'use client';

import { useParams, useRouter } from 'next/navigation';
import { useResource, useUpdateResource, useDeleteResource } from '@/lib/hooks/useResources';
import { ResourceCard } from '@/components/resources/ResourceCard';
import { ResourceForm } from '@/components/resources/ResourceForm';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ArrowLeft } from 'lucide-react';
import { useState } from 'react';
import type { UpdateResourceDto } from '@/lib/types/resource';

export default function ResourceDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: resource, isLoading, error } = useResource(id);
  const updateResource = useUpdateResource();
  const deleteResource = useDeleteResource();

  const [isEditing, setIsEditing] = useState(false);

  if (isLoading) {
    return (
      <div className="container py-6 space-y-6">
        <Skeleton className="h-8 w-48" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (error || !resource) {
    return (
      <div className="container py-6">
        <Alert variant="destructive">
          <AlertDescription>
            {error?.message || 'Resource not found'}
          </AlertDescription>
        </Alert>
      </div>
    );
  }

  const handleUpdate = async (data: UpdateResourceDto) => {
    await updateResource.mutateAsync({ id, data });
    setIsEditing(false);
  };

  const handleDelete = async () => {
    await deleteResource.mutateAsync(id);
    router.push('/resources');
  };

  return (
    <div className="container py-6 space-y-6">
      <Button variant="ghost" onClick={() => router.back()}>
        <ArrowLeft className="h-4 w-4 mr-2" />
        Back
      </Button>

      {isEditing ? (
        <ResourceForm
          initialData={resource}
          onSubmit={handleUpdate}
          onCancel={() => setIsEditing(false)}
        />
      ) : (
        <ResourceCard
          resource={resource}
          onEdit={() => setIsEditing(true)}
          onDelete={handleDelete}
        />
      )}
    </div>
  );
}
```

---

## NEGATIVE EXAMPLES (Anti-Patterns)

### Anti-Pattern 1: Duplicating API Logic

```typescript
// BAD: API call directly in component
export default function ResourcesPage() {
  const [resources, setResources] = useState([]);
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    fetch('/api/resources')
      .then(res => res.json())
      .then(data => {
        setResources(data.data);
        setIsLoading(false);
      });
  }, []);

  return <ResourceList resources={resources} isLoading={isLoading} />;
}

// GOOD: Use the hook from lib/hooks
export default function ResourcesPage() {
  const { data: resources, isLoading, error } = useResources();

  if (error) return <Alert variant="destructive">{error.message}</Alert>;

  return <ResourceList resources={resources || []} isLoading={isLoading} />;
}
```

### Anti-Pattern 2: Missing Error Boundaries

```typescript
// BAD: Error crashes the whole page
export default function ResourcesPage() {
  const { data, isLoading } = useResources();  // No error handling!

  if (isLoading) return <Skeleton />;
  return <ResourceList resources={data} />;
}

// GOOD: Handle all states
export default function ResourcesPage() {
  const { data, isLoading, error } = useResources();

  if (isLoading) return <Skeleton className="h-64" />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertDescription>{error.message}</AlertDescription>
      </Alert>
    );
  }

  return <ResourceList resources={data || []} />;
}
```

### Anti-Pattern 3: Prop Drilling

```typescript
// BAD: Passing data through many levels
export default function ResourcesPage() {
  const { data } = useResources();
  return <ResourceContainer resources={data} />
}

function ResourceContainer({ resources }) {
  return <ResourceSection resources={resources} />
}

function ResourceSection({ resources }) {
  return <ResourceList resources={resources} />  // 3 levels of drilling!
}

// GOOD: Use hook where needed or context
export default function ResourcesPage() {
  return <ResourceSection />
}

function ResourceSection() {
  const { data: resources, isLoading } = useResources();  // Fetch where used
  return <ResourceList resources={resources || []} isLoading={isLoading} />;
}
```

### Anti-Pattern 4: Forgetting Query Invalidation

```typescript
// BAD: List won't update after create
export function useCreateResource() {
  return useMutation({
    mutationFn: createResource,
    // Missing: onSuccess invalidation!
  });
}

// GOOD: Invalidate related queries
export function useCreateResource() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: createResource,
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['resources'] });
    },
  });
}
```

### Anti-Pattern 5: Not Using Components from P3c

```typescript
// BAD: Rebuilding component instead of using existing
export default function ResourcesPage() {
  const { data } = useResources();

  return (
    <ul>
      {data?.map(r => (
        <li key={r.id}>{r.name}</li>  // Duplicate of ResourceList!
      ))}
    </ul>
  );
}

// GOOD: Use component from P3c
import { ResourceList } from '@/components/resources/ResourceList';

export default function ResourcesPage() {
  const { data, isLoading } = useResources();

  return <ResourceList resources={data || []} isLoading={isLoading} />;
}
```

---

## SELF-CHECK (Before Handoff)

### Code Quality
- [ ] TypeScript compilation: `pnpm tsc --noEmit` passes
- [ ] All imports resolve (hooks, components, types)
- [ ] Client components have `'use client'` directive
- [ ] Hooks follow naming convention: `use{Name}`

### Pattern Compliance
- [ ] Pages use components from P3c (no duplication)
- [ ] Hooks use API endpoints from P3b
- [ ] React Query hooks invalidate related queries on mutations
- [ ] API calls handle error responses correctly

### State Handling
- [ ] Loading states use Skeleton or loading indicator
- [ ] Error states display user-friendly message
- [ ] Empty states are handled gracefully

### Test Requirements
- [ ] All P2 page/hook tests pass: `pnpm test -- pages hooks`
- [ ] No `console.log` statements left in code
- [ ] Navigation works correctly (back, push)

---

## OUTPUT SCHEMA

```yaml
output:
  status: success | blocked
  files_created:
    - app/{feature}/page.tsx
    - app/{feature}/[id]/page.tsx
    - lib/hooks/use{Feature}.ts
  files_modified: []
  validation:
    tsc: pass | fail
    tests: "{passed}/{total}"
    page_tests: pass | fail
    hook_tests: pass | fail
  pages:
    - path: "/resources"
      type: client | server
      states: [loading, error, empty, data]
  hooks:
    - name: "useResources"
      queries: ["list", "detail"]
      mutations: ["create", "update", "delete"]
```

---

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
  - app/{feature}/page.tsx
  - lib/hooks/use{Feature}.ts
next_input:
  - "Implementation complete"
  - "Ready for refactor"
===NEXT_STEP_READY===
```
