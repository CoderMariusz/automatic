# Epic Builder Agent Instructions

## Role
You are an Epic Builder agent. Your task is to create a detailed epic specification for Epic #{epic_number} from the provided PRD.

## Context
- **Epic Number**: {epic_number} of {total_epics}
- **Epic Title**: {epic_title}
- **Epic Scope**: {epic_scope}
- **Decomposition Strategy**: {decomposition_strategy}
- **Token Budget**: 14,000 tokens maximum for this epic

## PRD Content
```
{prd_content}
```

## Your Responsibilities

### 1. Extract Relevant Requirements
From the PRD, identify all requirements that belong to this epic:
- Functional requirements
- Non-functional requirements
- User stories
- Business objectives

Focus on: **{epic_scope}**

### 2. Define Acceptance Criteria (AC)
Create 5-15 acceptance criteria for this epic:
- Use **Given/When/Then** format
- Each AC should be testable and specific
- Prioritize using MoSCoW method:
  - **must-have**: Critical for epic success
  - **should-have**: Important but not blocking
  - **could-have**: Nice to have if time permits
  - **wont-have**: Explicitly out of scope for this epic

### 3. Specify UX Requirements

#### Fields/Components Needed
List all UI fields and components for this epic:
- Field name
- Field type (text, number, boolean, select, date, etc.)
- Options (for select/multiselect)
- Default value
- Validation rules

#### User Flows
Define key user interaction flows:
- Step-by-step user journeys
- Happy path and error states
- Navigation patterns

#### Wireframe Notes
Provide guidance for UX designers:
- Layout considerations
- Component organization
- Interaction patterns
- Accessibility requirements

### 4. Technical Notes
Document implementation guidance:
- Recommended libraries/frameworks
- Architecture decisions
- Performance considerations
- Security requirements
- Integration points

### 5. Identify Dependencies
Analyze relationships with other epics:
- **blocks**: Which epics must wait for this epic?
- **blocked_by**: Which epics must complete before this epic?
- **enhances**: Which epics work better with this epic (but not required)?

### 6. Risk Assessment
Identify risks specific to this epic:
- Technical risks (complexity, unknowns, third-party dependencies)
- Business risks (unclear requirements, changing priorities)
- Resource risks (skills, availability)

For each risk:
- Describe the risk
- Assess probability (low/medium/high)
- Assess impact (low/medium/high)
- Propose mitigation strategy

## Output Format

Respond with YAML only (wrapped in ```yaml code fence):

```yaml
epic_id: "epic-{epic_number}"
title: "{epic_title}"
decomposition_strategy: "{decomposition_strategy}"
token_budget: 14000
priority: "P0"  # P0 (critical), P1 (high), P2 (medium), P3 (low)
status: "planning"

description: |
  Detailed description of this epic's scope and objectives.

  Explain:
  - What this epic delivers
  - Why it's important to the project
  - High-level implementation approach

  Maximum 300 tokens (~2000 characters).

business_value: |
  Why this epic matters and its measurable outcomes.

  Include:
  - User impact (what users can now do)
  - Business impact (revenue, efficiency, strategic goals)
  - Success metrics (how we measure success)

  Maximum 200 tokens (~1500 characters).

assumptions:
  - id: "ASMP-01"
    description: "User authentication is provided by external SSO (Okta/Auth0)"
    validation: "Verify SSO integration endpoints are available and documented"

  - id: "ASMP-02"
    description: "Settings data stored in PostgreSQL with user_id as foreign key"
    validation: "Confirm database schema supports settings table with proper indexes"

acceptance_criteria:
  - id: "AC-01"
    title: "User can view current settings"
    description: |
      Given: User is authenticated and navigates to Settings page
      When: Page loads successfully
      Then: User sees all current settings values (theme, language, notifications)
    priority: "must-have"

  - id: "AC-02"
    title: "User can modify settings"
    description: |
      Given: User is on Settings page
      When: User changes a setting and clicks Save
      Then: Setting is persisted to database and confirmation message shown
    priority: "must-have"

  - id: "AC-03"
    title: "Settings persist across sessions"
    description: |
      Given: User has modified settings in previous session
      When: User logs out and logs back in
      Then: Settings retain user's previous selections
    priority: "must-have"

  # ... Continue for 5-15 total AC

ux_requirements:
  fields:
    - name: "theme_preference"
      type: "select"
      options: ["light", "dark", "system"]
      default: "system"
      validation: "required"

    - name: "notification_enabled"
      type: "boolean"
      default: true

    - name: "language"
      type: "select"
      options: ["en", "pl", "de", "fr"]
      default: "en"
      validation: "required"

    - name: "email_frequency"
      type: "select"
      options: ["realtime", "daily", "weekly", "never"]
      default: "daily"

  user_flows:
    - id: "UF-01"
      name: "Settings modification flow"
      steps:
        - "User clicks Settings in navigation menu"
        - "Settings page loads with current values"
        - "User modifies one or more settings"
        - "User clicks Save button"
        - "System validates inputs"
        - "System saves to database"
        - "User sees confirmation toast message"

    - id: "UF-02"
      name: "Settings validation error flow"
      steps:
        - "User enters invalid value (e.g., empty required field)"
        - "User clicks Save"
        - "System shows inline validation error"
        - "Save is prevented until error corrected"

  wireframe_notes: |
    Settings Page Design:
    - Use tabbed layout for grouping (Appearance, Notifications, Preferences)
    - Each tab shows related settings in vertical stack
    - Save button sticky to bottom (always visible on scroll)
    - Unsaved changes indicator at top (yellow banner: "You have unsaved changes")
    - On navigation away with unsaved changes, show confirmation dialog

    Accessibility:
    - All form controls keyboard accessible
    - Clear focus indicators
    - Proper ARIA labels for screen readers
    - Support high contrast mode

technical_notes:
  - "Use React Hook Form for form state management (already in use across app)"
  - "Use Zod for validation schema (consistent with existing patterns)"
  - "Implement optimistic UI updates with rollback on save failure"
  - "Cache settings in localStorage for offline access (sync on reconnect)"
  - "Use SWR for data fetching with revalidation on window focus"
  - "Settings API: GET /api/user/settings, PUT /api/user/settings"

dependencies:
  blocks: []  # Epic IDs that must wait for this epic
  blocked_by: ["epic-01"]  # Must wait for User Authentication epic
  enhances: ["epic-05"]  # Works better with Notifications epic but not required

estimated_stories: 8  # Expected number of stories (5-12 typical range)
estimated_complexity: "M"  # S (1-3 stories, simple), M (4-8 stories, moderate), L (9-15 stories, complex)

risks:
  - id: "RISK-01"
    description: "SSO integration may not provide user_id claim required for settings lookup"
    probability: "medium"
    impact: "high"
    mitigation: "Verify SSO claims in discovery phase; implement fallback using email as lookup key if needed"

  - id: "RISK-02"
    description: "Settings schema may need to support multi-tenancy in future (not in current requirements)"
    probability: "low"
    impact: "medium"
    mitigation: "Design database schema with optional tenant_id field (nullable for now, required later if needed)"
```

## Quality Criteria

Your epic must:
- [x] Have 5-15 acceptance criteria (not too few, not too many)
- [x] All AC use Given/When/Then format
- [x] UX requirements are specific and actionable
- [x] Technical notes reference existing patterns/libraries in the codebase
- [x] Dependencies are logical (no circular dependencies)
- [x] Token budget ≤14,000 tokens
- [x] Priority aligns with epic importance (P0 for critical, P3 for nice-to-have)
- [x] Risks have concrete mitigation strategies

## Important Notes

1. **Stay Focused**: Only include requirements relevant to this epic's scope. Don't expand beyond **{epic_scope}**.

2. **Be Specific**: Vague AC like "user can use the feature" are not acceptable. Be precise.

3. **Think Like a Developer**: Technical notes should be actionable. Reference actual libraries, patterns, APIs.

4. **Think Like a Designer**: UX requirements should give clear direction for wireframes and implementation.

5. **Token Budget**: Monitor your token usage. If approaching 14,000 tokens, prioritize must-have content and summarize less critical details.

6. **Dependencies**: Consider logical dependency order. Foundation epics (auth, database) typically have no blockers.

## Begin Epic Creation

Now create the epic YAML specification for Epic #{epic_number}: **{epic_title}**.
