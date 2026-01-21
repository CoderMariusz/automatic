# P1: UX Design

**Agent:** ux-designer
**Skip:** backend-only stories
**Output:** Wireframes, component specs

---

## INPUT
- Story context from `stories/pending/{STORY_ID}.yaml`
- Existing UX patterns from project

## TASK
1. Create component wireframes
2. Define all states: default, hover, active, disabled, error, loading
3. Specify responsive breakpoints
4. Document accessibility requirements

## CONSTRAINTS
- Follow existing design patterns
- Update existing wireframe files, don't create new unless needed
- ASCII wireframes preferred (parseable)

---

## REFERENCE CODE

Check these files for existing patterns:
- `components/ui/` - Base UI components (Shadcn/UI)
- `components/` - Feature components for patterns
- `app/` - Page layouts and structure

---

## CODE PATTERNS

### Pattern: State Machine for Components

```yaml
# GOOD: Complete state definition for a component
component: ResourceList
states:
  idle:
    description: "Component mounted, waiting for data"
    transitions:
      - to: loading
        trigger: "fetch initiated"

  loading:
    description: "Data being fetched"
    ui: "Show skeleton/spinner"
    transitions:
      - to: success
        trigger: "data received"
      - to: error
        trigger: "fetch failed"

  success:
    description: "Data loaded successfully"
    substates:
      empty:
        condition: "data.length === 0"
        ui: "Show empty state message"
      populated:
        condition: "data.length > 0"
        ui: "Show list of items"
    transitions:
      - to: loading
        trigger: "refresh"

  error:
    description: "Fetch failed"
    ui: "Show error message with retry button"
    transitions:
      - to: loading
        trigger: "retry clicked"
```

### Pattern: Wireframe with All States

```
COMPONENT: ResourceList

STATE: loading
┌─────────────────────────────────────┐
│ ████████████████████░░░░░░░░░░░░░░ │  <- Skeleton
│ ████████████████░░░░░░░░░░░░░░░░░░ │
│ ██████████████████████░░░░░░░░░░░░ │
└─────────────────────────────────────┘

STATE: empty
┌─────────────────────────────────────┐
│                                     │
│         📭 No resources found       │
│         [+ Add Resource]            │
│                                     │
└─────────────────────────────────────┘

STATE: error
┌─────────────────────────────────────┐
│                                     │
│    ⚠️  Failed to load resources     │
│         [Try Again]                 │
│                                     │
└─────────────────────────────────────┘

STATE: success (populated)
┌─────────────────────────────────────┐
│ ┌─────────────────────────────────┐ │
│ │ Resource 1              Jan 15  │ │  <- List item
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Resource 2              Jan 14  │ │
│ └─────────────────────────────────┘ │
│ ┌─────────────────────────────────┐ │
│ │ Resource 3              Jan 13  │ │
│ └─────────────────────────────────┘ │
└─────────────────────────────────────┘
```

### Pattern: Interactive Element States

```
COMPONENT: Button (primary variant)

STATE: default
┌────────────────┐
│   Save Item    │  bg: primary, text: white
└────────────────┘

STATE: hover
┌────────────────┐
│   Save Item    │  bg: primary/90 (slightly darker)
└────────────────┘
     ↑ cursor: pointer

STATE: active (pressed)
┌────────────────┐
│   Save Item    │  bg: primary/80, scale: 0.98
└────────────────┘

STATE: disabled
┌────────────────┐
│   Save Item    │  bg: muted, text: muted-foreground
└────────────────┘
     opacity: 0.5, cursor: not-allowed

STATE: loading
┌────────────────┐
│   ◌ Saving...  │  bg: primary, spinner visible
└────────────────┘
     pointer-events: none
```

### Pattern: Responsive Layout

```
BREAKPOINTS:
- mobile:  < 640px   (sm)
- tablet:  640-1024px (md)
- desktop: > 1024px   (lg)

LAYOUT: Resources Page

MOBILE (< 640px):
┌─────────────────────┐
│ Resources      [+]  │  <- Header, sticky
├─────────────────────┤
│ [Search........]    │  <- Full width search
├─────────────────────┤
│ ┌─────────────────┐ │
│ │ Resource 1      │ │  <- Card (full width)
│ │ Jan 15, 2024    │ │
│ └─────────────────┘ │
│ ┌─────────────────┐ │
│ │ Resource 2      │ │
│ └─────────────────┘ │
└─────────────────────┘

TABLET (640-1024px):
┌─────────────────────────────────┐
│ Resources                   [+] │
├─────────────────────────────────┤
│ [Search...............]         │
├─────────────────────────────────┤
│ ┌───────────┐  ┌───────────┐    │  <- 2 column grid
│ │ Resource 1│  │ Resource 2│    │
│ └───────────┘  └───────────┘    │
│ ┌───────────┐  ┌───────────┐    │
│ │ Resource 3│  │ Resource 4│    │
│ └───────────┘  └───────────┘    │
└─────────────────────────────────┘

DESKTOP (> 1024px):
┌───────────────────────────────────────────────┐
│ Resources                                 [+] │
├───────────────────────────────────────────────┤
│ [Search....]                    [Filter ▼]    │
├───────────────────────────────────────────────┤
│ ┌─────────┐ ┌─────────┐ ┌─────────┐ ┌───────┐ │  <- 4 column grid
│ │ Res 1   │ │ Res 2   │ │ Res 3   │ │ Res 4 │ │
│ └─────────┘ └─────────┘ └─────────┘ └───────┘ │
└───────────────────────────────────────────────┘
```

### Pattern: Form UX Specification

```yaml
component: ResourceForm
fields:
  - name: name
    type: text
    label: "Resource Name"
    placeholder: "Enter resource name"
    validation:
      required: true
      minLength: 1
      maxLength: 255
    error_messages:
      required: "Name is required"
      maxLength: "Name cannot exceed 255 characters"
    states:
      default: "Empty input with placeholder"
      focus: "Blue border, placeholder hidden"
      filled: "Value displayed"
      error: "Red border, error message below"
      disabled: "Gray background, no interaction"

  - name: description
    type: textarea
    label: "Description"
    placeholder: "Optional description..."
    validation:
      maxLength: 1000
    optional: true

actions:
  submit:
    label: "Save Resource"
    loading_label: "Saving..."
    position: "bottom-right"
  cancel:
    label: "Cancel"
    variant: "outline"
    position: "bottom-right (before submit)"
```

---

## NEGATIVE EXAMPLES (Anti-Patterns)

### Anti-Pattern 1: Missing States

```
# BAD: Only shows one state
COMPONENT: UserList

┌─────────────────────┐
│ • User 1            │
│ • User 2            │
│ • User 3            │
└─────────────────────┘

# GOOD: All states defined
COMPONENT: UserList

STATE: loading
┌─────────────────────┐
│ ████████░░░░░░░░░░ │
│ ██████████░░░░░░░░ │
└─────────────────────┘

STATE: empty
┌─────────────────────┐
│ No users found      │
│ [Invite User]       │
└─────────────────────┘

STATE: error
┌─────────────────────┐
│ ⚠️ Failed to load   │
│ [Retry]             │
└─────────────────────┘

STATE: success
┌─────────────────────┐
│ • User 1            │
│ • User 2            │
└─────────────────────┘
```

### Anti-Pattern 2: No Responsive Consideration

```
# BAD: Only desktop layout
WIREFRAME: Dashboard
┌───────────────────────────────────────────────────────────────┐
│ Sidebar │ Main Content                                        │
│         │                                                     │
│ Nav 1   │ Cards, tables, charts...                           │
│ Nav 2   │                                                     │
└───────────────────────────────────────────────────────────────┘

# GOOD: All breakpoints considered
MOBILE: Collapsed sidebar as hamburger menu
TABLET: Sidebar as icons only, main content wider
DESKTOP: Full sidebar + main content
```

### Anti-Pattern 3: Missing Accessibility Notes

```
# BAD: No accessibility consideration
COMPONENT: ClickableCard
- Click to view details

# GOOD: Accessibility documented
COMPONENT: ClickableCard
- Click to view details
- Accessibility:
  - role="button"
  - tabIndex="0"
  - Enter/Space triggers click
  - Focus visible ring
  - aria-label: "{card title}, click to view details"
```

### Anti-Pattern 4: Vague State Descriptions

```
# BAD: Unclear what happens in each state
states:
  - idle
  - loading
  - done

# GOOD: Clear descriptions with UI details
states:
  idle:
    description: "Waiting for user action"
    ui: "Form fields enabled, submit button active"

  loading:
    description: "Form submitted, awaiting response"
    ui: "Fields disabled, button shows spinner, text 'Saving...'"

  success:
    description: "Resource saved"
    ui: "Toast notification, redirect to list page"

  error:
    description: "Save failed"
    ui: "Error alert at top of form, fields remain populated"
```

---

## SELF-CHECK (Before Handoff)

### Completeness
- [ ] All components have wireframes
- [ ] All states defined: default, hover, active, disabled, error, loading
- [ ] Empty states defined for lists/data views
- [ ] Form validation states defined

### Responsiveness
- [ ] Mobile breakpoint (< 640px) defined
- [ ] Tablet breakpoint (640-1024px) defined
- [ ] Desktop breakpoint (> 1024px) defined
- [ ] Touch targets minimum 44x44px on mobile

### Accessibility
- [ ] Focus states for interactive elements
- [ ] Keyboard navigation path documented
- [ ] Screen reader considerations noted
- [ ] Color contrast requirements met (4.5:1 minimum)

### Consistency
- [ ] Uses existing UI components where possible
- [ ] Follows project design system/tokens
- [ ] Matches existing page layouts
- [ ] Typography hierarchy consistent

---

## OUTPUT SCHEMA

```yaml
output:
  status: success | blocked
  components:
    - name: "{ComponentName}"
      states: [default, hover, loading, error, empty]
      responsive: [mobile, tablet, desktop]
      accessibility: [keyboard, screen-reader, focus]
  wireframes:
    - name: "{PageName}"
      breakpoints: [mobile, tablet, desktop]
  files_created:
    - docs/ux/{story_id}-wireframes.md
```

---

## OUTPUT FORMAT
```
COMPONENTS:
- {ComponentName}: {brief description}
  States: default, hover, loading, error, empty
  Responsive: mobile-first, breakpoint:768px
  Accessibility: keyboard nav, focus ring, aria-labels

WIREFRAME:
┌─────────────────────────┐
│ Header                  │
├─────────────────────────┤
│ Content                 │
└─────────────────────────┘
```

## CHECKPOINT UPDATE
```yaml
P1: "✓ ux-designer {HH:MM} wireframes:{N} components:{N}"
```

## END
When complete, output:
```
===HANDOFF===
from: P1
to: P2
story: "{STORY_ID}"
status: success
summary: "{N} wireframes, {N} components defined"
files_changed:
  - {list}
===NEXT_STEP_READY===
```
