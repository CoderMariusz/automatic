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

---

## REFERENCE CODE

Check these files for patterns before implementing:
- `components/ui/` - Shadcn/UI base components (Button, Card, Input, etc.)
- `components/` - Feature components for patterns
- `lib/types/` - Type definitions to import

---

## CODE PATTERNS

### Pattern: List Component

```typescript
// GOOD: Complete list component with all states
'use client';

import { Resource } from '@/lib/types/resource';
import { Card, CardContent } from '@/components/ui/card';
import { Skeleton } from '@/components/ui/skeleton';

interface ResourceListProps {
  resources: Resource[];
  isLoading?: boolean;
  onSelect?: (resource: Resource) => void;
}

export function ResourceList({ resources, isLoading, onSelect }: ResourceListProps) {
  // Loading state
  if (isLoading) {
    return (
      <div className="space-y-3">
        {Array.from({ length: 3 }).map((_, i) => (
          <Skeleton key={i} className="h-16 w-full" />
        ))}
      </div>
    );
  }

  // Empty state
  if (resources.length === 0) {
    return (
      <div className="text-center py-8 text-muted-foreground">
        No resources found
      </div>
    );
  }

  // Default state
  return (
    <ul className="space-y-3" role="list">
      {resources.map((resource) => (
        <li key={resource.id}>
          <Card
            className="cursor-pointer hover:bg-muted/50 transition-colors"
            onClick={() => onSelect?.(resource)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                onSelect?.(resource);
              }
            }}
          >
            <CardContent className="p-4">
              <span className="font-medium">{resource.name}</span>
              <span className="text-sm text-muted-foreground ml-2">
                {new Date(resource.created_at).toLocaleDateString()}
              </span>
            </CardContent>
          </Card>
        </li>
      ))}
    </ul>
  );
}
```

### Pattern: Card Component

```typescript
// GOOD: Feature card with props interface
'use client';

import { Resource } from '@/lib/types/resource';
import { Card, CardHeader, CardTitle, CardContent, CardFooter } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ResourceCardProps {
  resource: Resource;
  onEdit?: () => void;
  onDelete?: () => void;
}

export function ResourceCard({ resource, onEdit, onDelete }: ResourceCardProps) {
  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>{resource.name}</CardTitle>
          <Badge variant={resource.status === 'active' ? 'default' : 'secondary'}>
            {resource.status}
          </Badge>
        </div>
      </CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground">
          {resource.description || 'No description'}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          Created: {new Date(resource.created_at).toLocaleDateString()}
        </p>
      </CardContent>
      {(onEdit || onDelete) && (
        <CardFooter className="gap-2">
          {onEdit && (
            <Button variant="outline" size="sm" onClick={onEdit}>
              Edit
            </Button>
          )}
          {onDelete && (
            <Button variant="destructive" size="sm" onClick={onDelete}>
              Delete
            </Button>
          )}
        </CardFooter>
      )}
    </Card>
  );
}
```

### Pattern: Form Component

```typescript
// GOOD: Form with validation and loading state
'use client';

import { useState } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';

const formSchema = z.object({
  name: z.string().min(1, 'Name is required').max(255),
  description: z.string().max(1000).optional(),
});

type FormData = z.infer<typeof formSchema>;

interface ResourceFormProps {
  initialData?: Partial<FormData>;
  onSubmit: (data: FormData) => Promise<void>;
  onCancel?: () => void;
}

export function ResourceForm({ initialData, onSubmit, onCancel }: ResourceFormProps) {
  const [formData, setFormData] = useState<Partial<FormData>>(initialData || {});
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErrors({});
    setSubmitError(null);

    const parsed = formSchema.safeParse(formData);
    if (!parsed.success) {
      const fieldErrors: Record<string, string> = {};
      parsed.error.errors.forEach((err) => {
        if (err.path[0]) {
          fieldErrors[err.path[0] as string] = err.message;
        }
      });
      setErrors(fieldErrors);
      return;
    }

    setIsSubmitting(true);
    try {
      await onSubmit(parsed.data);
    } catch (error) {
      setSubmitError(error instanceof Error ? error.message : 'An error occurred');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4">
      {submitError && (
        <Alert variant="destructive">
          <AlertDescription>{submitError}</AlertDescription>
        </Alert>
      )}

      <div className="space-y-2">
        <Label htmlFor="name">Name</Label>
        <Input
          id="name"
          value={formData.name || ''}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          aria-invalid={!!errors.name}
          aria-describedby={errors.name ? 'name-error' : undefined}
        />
        {errors.name && (
          <p id="name-error" className="text-sm text-destructive">
            {errors.name}
          </p>
        )}
      </div>

      <div className="space-y-2">
        <Label htmlFor="description">Description</Label>
        <Textarea
          id="description"
          value={formData.description || ''}
          onChange={(e) => setFormData({ ...formData, description: e.target.value })}
          rows={3}
        />
      </div>

      <div className="flex gap-2 justify-end">
        {onCancel && (
          <Button type="button" variant="outline" onClick={onCancel}>
            Cancel
          </Button>
        )}
        <Button type="submit" disabled={isSubmitting}>
          {isSubmitting ? 'Saving...' : 'Save'}
        </Button>
      </div>
    </form>
  );
}
```

### Pattern: Modal/Dialog Component

```typescript
// GOOD: Accessible dialog with proper focus management
'use client';

import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';

interface ConfirmDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description: string;
  confirmLabel?: string;
  cancelLabel?: string;
  onConfirm: () => void;
  variant?: 'default' | 'destructive';
  isLoading?: boolean;
}

export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  confirmLabel = 'Confirm',
  cancelLabel = 'Cancel',
  onConfirm,
  variant = 'default',
  isLoading = false,
}: ConfirmDialogProps) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={isLoading}>
            {cancelLabel}
          </Button>
          <Button
            variant={variant === 'destructive' ? 'destructive' : 'default'}
            onClick={onConfirm}
            disabled={isLoading}
          >
            {isLoading ? 'Processing...' : confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
```

---

## NEGATIVE EXAMPLES (Anti-Patterns)

### Anti-Pattern 1: Missing 'use client' Directive

```typescript
// BAD: Client component without directive (will fail)
import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);  // useState requires 'use client'
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}

// GOOD: Declare client component
'use client';

import { useState } from 'react';

export function Counter() {
  const [count, setCount] = useState(0);
  return <button onClick={() => setCount(c => c + 1)}>{count}</button>;
}
```

### Anti-Pattern 2: Inline Type Definitions

```typescript
// BAD: Types defined inline, not reusable
export function ResourceList({
  resources,
  onSelect,
}: {
  resources: { id: string; name: string; created_at: string }[];
  onSelect?: (r: { id: string; name: string; created_at: string }) => void;
}) {
  // ...
}

// GOOD: Types imported from shared definitions
import { Resource } from '@/lib/types/resource';

interface ResourceListProps {
  resources: Resource[];
  onSelect?: (resource: Resource) => void;
}

export function ResourceList({ resources, onSelect }: ResourceListProps) {
  // ...
}
```

### Anti-Pattern 3: Missing States

```typescript
// BAD: Only handles success case
export function UserList({ users }: { users: User[] }) {
  return (
    <ul>
      {users.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  );
}

// GOOD: Handles loading, empty, and error states
interface UserListProps {
  users: User[];
  isLoading?: boolean;
  error?: string | null;
}

export function UserList({ users, isLoading, error }: UserListProps) {
  if (isLoading) {
    return <Skeleton className="h-32" />;
  }

  if (error) {
    return <Alert variant="destructive"><AlertDescription>{error}</AlertDescription></Alert>;
  }

  if (users.length === 0) {
    return <p className="text-muted-foreground text-center py-8">No users found</p>;
  }

  return (
    <ul className="space-y-2">
      {users.map(user => <li key={user.id}>{user.name}</li>)}
    </ul>
  );
}
```

### Anti-Pattern 4: Poor Accessibility

```typescript
// BAD: Clickable div without keyboard support
export function ClickableCard({ onClick }: { onClick: () => void }) {
  return (
    <div className="card" onClick={onClick}>
      Click me
    </div>
  );
}

// GOOD: Accessible with keyboard navigation
export function ClickableCard({ onClick }: { onClick: () => void }) {
  return (
    <div
      className="card cursor-pointer"
      onClick={onClick}
      role="button"
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === 'Enter' || e.key === ' ') {
          e.preventDefault();
          onClick();
        }
      }}
    >
      Click me
    </div>
  );
}
```

### Anti-Pattern 5: Not Using Existing UI Components

```typescript
// BAD: Reinventing the wheel
export function MyButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return (
    <button
      className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      onClick={onClick}
    >
      {children}
    </button>
  );
}

// GOOD: Use existing Shadcn/UI component
import { Button } from '@/components/ui/button';

export function ActionButton({ children, onClick }: { children: React.ReactNode; onClick: () => void }) {
  return <Button onClick={onClick}>{children}</Button>;
}
```

---

## SELF-CHECK (Before Handoff)

### Code Quality
- [ ] TypeScript compilation: `pnpm tsc --noEmit` passes
- [ ] All imports resolve (components, types)
- [ ] Every client component has `'use client'` directive
- [ ] Props interfaces defined and exported where needed

### Pattern Compliance
- [ ] Uses Shadcn/UI components from `components/ui/`
- [ ] Types imported from `lib/types/` (not inline)
- [ ] Follows project naming conventions (PascalCase components)
- [ ] Responsive classes use Tailwind breakpoints

### State Handling
- [ ] Loading state implemented
- [ ] Empty state implemented
- [ ] Error state implemented
- [ ] All interactive elements have hover/focus states

### Accessibility
- [ ] Interactive elements have keyboard support
- [ ] Form inputs have labels and `aria-*` attributes
- [ ] Images have `alt` attributes
- [ ] Lists have proper `role="list"` where semantic

### Test Requirements
- [ ] All P2 component tests pass: `pnpm test -- components`
- [ ] No `console.log` statements left in code

---

## OUTPUT SCHEMA

```yaml
output:
  status: success | blocked
  files_created:
    - components/{feature}/{ComponentName}.tsx
  files_modified: []
  validation:
    tsc: pass | fail
    tests: "{passed}/{total}"
    component_tests: pass | fail
  components:
    - name: "{ComponentName}"
      states: [default, loading, empty, error]
      accessibility: pass | fail
```

---

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
  - components/{feature}/{Name}.tsx
next_input:
  - "Components: {list}"
  - "Use in pages"
===NEXT_STEP_READY===
```
