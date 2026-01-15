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

## CHANGELOG FORMAT
```markdown
## [{version}] - {YYYY-MM-DD}

### Added
- {feature description} (Story {ID})

### Changed
- {change description}

### Fixed
- {fix description}
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
  - docs/{path}
  - CHANGELOG.md
===NEXT_STEP_READY===
```

## STORY COMPLETE
After P7, update checkpoint with:
```yaml
COMPLETE: "✓ {YYYY-MM-DD} {HH:MM} status:DONE"
```
