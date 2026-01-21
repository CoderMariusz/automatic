# P7: Documentation

**Agent:** tech-writer
**Skip:** never
**Output:** Updated docs, changelog

---

## INPUT
- Implementation files
- Story context
- Existing documentation

## TASK
1. Update inline code comments (explain WHY, not WHAT)
2. Update API docs (if applicable)
3. Update user docs (if applicable)
4. Add changelog entry

## DOCUMENTATION SCOPE
```yaml
scope:
  code_comments: always
  api_docs: if_backend
  user_docs: if_user_facing
  changelog: always
```

---

## REFERENCE CODE

Check these files for patterns:
- `CHANGELOG.md` - Existing changelog format
- `docs/` - Existing documentation structure
- Similar files for comment style

---

## CODE PATTERNS

### Pattern: Code Comments (Good vs Bad)

```typescript
// BAD: Comment describes WHAT (obvious from code)
// Loop through users
for (const user of users) {
  // Check if user is active
  if (user.isActive) {
    // Add to result
    result.push(user);
  }
}

// GOOD: Comment explains WHY (not obvious from code)
// Filter to active users only - inactive users are soft-deleted
// and should not appear in any user-facing lists (per GDPR compliance)
const activeUsers = users.filter(user => user.isActive);
```

```typescript
// BAD: Redundant JSDoc that just restates the signature
/**
 * Gets a user by ID
 * @param id - The user ID
 * @returns The user
 */
async function getById(id: string): Promise<User | null>

// GOOD: JSDoc adds context not obvious from signature
/**
 * Fetches user by ID with org membership check.
 * Returns null if user not found OR if user belongs to different org
 * (security: prevents cross-org data access).
 *
 * @throws {Error} On database connection failure
 */
async function getById(id: string): Promise<User | null>
```

```typescript
// BAD: Commented-out code left in
// const oldImplementation = () => { ... }

// GOOD: Remove dead code, use git history if needed
// (no comment - code simply removed)
```

```typescript
// BAD: TODO without context
// TODO: fix this

// GOOD: TODO with ticket reference and context
// TODO(PROJ-123): Add rate limiting - current implementation
// allows unlimited API calls which could be abused
```

### Pattern: API Documentation

```typescript
/**
 * @api {get} /api/resources List Resources
 * @apiName GetResources
 * @apiGroup Resources
 * @apiVersion 1.0.0
 *
 * @apiHeader {String} Authorization Bearer token
 *
 * @apiQuery {Number} [page=1] Page number (1-indexed)
 * @apiQuery {Number} [limit=20] Items per page (max 100)
 * @apiQuery {String} [search] Filter by name (case-insensitive)
 *
 * @apiSuccess {Boolean} success Always true on success
 * @apiSuccess {Object[]} data Array of resources
 * @apiSuccess {String} data.id Resource UUID
 * @apiSuccess {String} data.name Resource name
 * @apiSuccess {String} data.created_at ISO timestamp
 *
 * @apiSuccessExample {json} Success-Response:
 *     HTTP/1.1 200 OK
 *     {
 *       "success": true,
 *       "data": [
 *         {
 *           "id": "550e8400-e29b-41d4-a716-446655440000",
 *           "name": "My Resource",
 *           "created_at": "2024-01-15T10:30:00Z"
 *         }
 *       ]
 *     }
 *
 * @apiError {Boolean} success Always false on error
 * @apiError {String} error Error message
 *
 * @apiErrorExample {json} Error-Response:
 *     HTTP/1.1 500 Internal Server Error
 *     {
 *       "success": false,
 *       "error": "Failed to fetch resources"
 *     }
 */
```

### Pattern: Changelog Entry

```markdown
## [1.2.0] - 2024-01-15

### Added
- Resource management feature (Story RES-001)
  - List, create, update, and delete resources
  - Search and filter resources by name
  - Pagination support with configurable page size
- New `ResourceService` for backend operations
- New `useResources` hook for frontend data fetching

### Changed
- Updated navigation to include Resources link
- API response format now consistently uses `{ success, data, error }`

### Fixed
- Fixed race condition in concurrent resource updates (Bug #45)

### Security
- Added input validation on all resource endpoints
- Resources now respect RLS policies for org isolation

### Deprecated
- `getResources()` function - use `ResourceService.getAll()` instead
  (will be removed in v2.0.0)
```

### Pattern: README Section for New Feature

```markdown
## Resources

The Resources feature allows users to manage their project resources.

### Usage

```typescript
import { useResources, useCreateResource } from '@/lib/hooks/useResources';

function MyComponent() {
  const { data: resources, isLoading } = useResources();
  const createResource = useCreateResource();

  const handleCreate = async () => {
    await createResource.mutateAsync({ name: 'New Resource' });
  };

  // ...
}
```

### API Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/resources` | List all resources |
| POST | `/api/resources` | Create new resource |
| GET | `/api/resources/:id` | Get resource by ID |
| PUT | `/api/resources/:id` | Update resource |
| DELETE | `/api/resources/:id` | Delete resource |

### Configuration

Resources respect the following environment variables:

| Variable | Default | Description |
|----------|---------|-------------|
| `RESOURCE_PAGE_SIZE` | 20 | Default pagination size |
| `RESOURCE_MAX_NAME_LENGTH` | 255 | Maximum name length |
```

### Pattern: Component Documentation (Storybook Style)

```typescript
/**
 * ResourceList displays a list of resources with support for
 * loading, empty, and error states.
 *
 * @example
 * // Basic usage
 * <ResourceList resources={resources} />
 *
 * @example
 * // With loading state
 * <ResourceList resources={[]} isLoading />
 *
 * @example
 * // With selection handler
 * <ResourceList
 *   resources={resources}
 *   onSelect={(resource) => console.log('Selected:', resource)}
 * />
 */
export interface ResourceListProps {
  /** Array of resources to display */
  resources: Resource[];
  /** Show loading skeleton */
  isLoading?: boolean;
  /** Called when user selects a resource */
  onSelect?: (resource: Resource) => void;
}

export function ResourceList({ resources, isLoading, onSelect }: ResourceListProps) {
  // ...
}
```

---

## NEGATIVE EXAMPLES (Anti-Patterns)

### Anti-Pattern 1: Comment Describes WHAT

```typescript
// BAD: We can see it's incrementing - WHY is it incrementing?
// Increment counter
counter++;

// GOOD: Explains the business logic
// Track failed attempts for rate limiting (max 5 per minute)
failedAttempts++;
```

### Anti-Pattern 2: Stale Comments

```typescript
// BAD: Comment doesn't match code
// Returns user email
function getUserName(user: User): string {
  return user.name;  // Actually returns name, not email!
}

// GOOD: Keep comments in sync with code, or remove if obvious
function getUserName(user: User): string {
  return user.name;
}
```

### Anti-Pattern 3: Over-Documentation

```typescript
// BAD: Every line commented
// Import the User type
import { User } from '@/lib/types/user';
// Import the service
import { UserService } from '@/lib/services/user-service';

// Create service instance
const service = new UserService();

// Export the handler function
export async function GET() {
  // Get all users
  const users = await service.getAll();
  // Return the response
  return NextResponse.json({ success: true, data: users });
}

// GOOD: Only comment non-obvious parts
import { User } from '@/lib/types/user';
import { UserService } from '@/lib/services/user-service';

const service = new UserService();

export async function GET() {
  const users = await service.getAll();
  return NextResponse.json({ success: true, data: users });
}
```

### Anti-Pattern 4: Missing Changelog Entry

```markdown
# BAD: No changelog for significant change

# GOOD: Every user-visible change documented
## [1.2.0] - 2024-01-15

### Added
- Resource management feature (Story RES-001)
```

### Anti-Pattern 5: Duplicating Documentation

```markdown
# BAD: Same info in README.md, docs/api.md, and inline comments

# GOOD: Single source of truth
- API docs: OpenAPI/Swagger spec (auto-generated)
- Usage: README.md with examples
- Code: Brief comments explaining WHY only
```

---

## SELF-CHECK (Before Handoff)

### Code Comments
- [ ] Comments explain WHY, not WHAT
- [ ] No commented-out code
- [ ] No stale comments (match current code)
- [ ] TODOs have ticket references

### API Documentation
- [ ] All new endpoints documented
- [ ] Request/response examples provided
- [ ] Error responses documented
- [ ] Auth requirements specified

### User Documentation
- [ ] README updated if user-facing feature
- [ ] Usage examples provided
- [ ] Configuration options documented

### Changelog
- [ ] Entry added to CHANGELOG.md
- [ ] Follows existing format (Keep a Changelog)
- [ ] Version number appropriate
- [ ] Story ID referenced

---

## OUTPUT SCHEMA

```yaml
output:
  status: success | blocked
  documentation_updated:
    code_comments:
      files_updated: N
      comments_added: N
      comments_removed: N
    api_docs:
      endpoints_documented: N
      file: "docs/api/resources.md"
    user_docs:
      sections_added: N
      file: "README.md"
    changelog:
      version: "1.2.0"
      entries:
        added: N
        changed: N
        fixed: N
  files_changed:
    - CHANGELOG.md
    - README.md
    - docs/api/resources.md
```

---

## CHANGELOG FORMAT
```markdown
## [{version}] - {YYYY-MM-DD}

### Added
- {feature description} (Story {ID})

### Changed
- {change description}

### Fixed
- {fix description}

### Security
- {security-related change}

### Deprecated
- {deprecated feature} - {migration path}
```

## CONSTRAINTS
- Brief, technical comments
- No prose in code
- Update existing docs, don't duplicate
- Follow existing doc patterns

## CHECKPOINT UPDATE
```yaml
P7: "✓ tech-writer {HH:MM} docs:updated changelog:added"
```

## END
```
===HANDOFF===
from: P7
to: complete
story: "{STORY_ID}"
status: success
summary: "Docs updated, changelog added"
files_changed:
  - CHANGELOG.md
  - docs/{path}
===NEXT_STEP_READY===
```

## STORY COMPLETE
After P7, update checkpoint with:
```yaml
COMPLETE: "✓ {YYYY-MM-DD} {HH:MM} status:DONE"
```
