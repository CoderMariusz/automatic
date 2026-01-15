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

## OUTPUT FORMAT
```
COMPONENTS:
- {ComponentName}: {brief description}
  States: default, hover, loading, error
  Responsive: mobile-first, breakpoint:768px

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
