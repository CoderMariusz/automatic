# LLM Providers Configuration

## Overview

The runner supports multiple LLM providers. Currently implemented:
- **claude**: Claude AI via CLI
- **glm**: GLM-4.7 via Z.ai API

## Configuration

### Default Mapping in `plan.yaml`

Provider mapping is configured in `plan.yaml` under the `providers` section:

```yaml
providers:
  P1: claude    # UX Design
  P2: glm       # Tests (RED)
  P3a: glm      # Backend Services
  P3b: glm      # Backend Routes
  P3c: glm      # Frontend Components
  P3d: glm      # Frontend Pages
  P4: claude    # Refactor
  P5: claude    # Code Review
  P6: claude    # QA
  P7: glm       # Documentation
```

### Per-Step Override

You can override the provider for a specific step in the step definition:

```yaml
steps:
  - id: P2
    file: "instructions/P2-tests-red.md"
    agent: "test-writer"
    provider: glm  # Override default
```

### Priority Order

1. `step.provider` (if defined)
2. `plan.providers[stepId]` (from plan.yaml)
3. `'claude'` (default fallback)

## Setup

### Claude Provider

Requires Claude CLI installed:
```bash
# Install from https://claude.ai/cli
claude --version
```

### GLM Provider (Z.ai)

Requires API key in environment. See `SETUP-ZAI.md` for detailed setup instructions.

**Quick setup:**
```bash
# Windows PowerShell
$env:ZAI_API_KEY="your-api-key-here"

# Windows CMD
set ZAI_API_KEY=your-api-key-here

# Linux/Mac
export ZAI_API_KEY="your-api-key-here"
```

**Optional parameters:**
```bash
export ZAI_API_URL="https://api.z.ai/api/paas/v4/chat/completions"  # Default endpoint
export ZAI_MODEL="glm-4.7"                                           # Default model
export ZAI_MAX_TOKENS="128000"                                       # Default max output tokens
```

**Configuration file (.env.local - not committed to repo):**
```
ZAI_API_KEY=your-api-key-here
ZAI_API_URL=https://api.z.ai/api/paas/v4/chat/completions
ZAI_MODEL=glm-4.7
ZAI_MAX_TOKENS=128000
```

## Usage

Run normally - providers are selected automatically based on configuration:

```bash
npm start
```

In logs, you'll see which provider is used:
```
>>> P2 | test-writer [glm]
[P2] Executing GLM-4.7 via Z.ai API (timeout: 3600s)...
```

## Quality Checklists

Each step has a 2-point quality checklist (to be defined per step):

### P1: UX Design
- [ ] Design aligns with user requirements
- [ ] Wireframes/mockups included

### P2: Tests (RED)
- [ ] Tests fail as expected
- [ ] Coverage adequate for story

### P3: Implementation
- [ ] Code implements acceptance criteria
- [ ] No linting errors

### P4: Refactor
- [ ] Code follows best practices
- [ ] No performance regressions

### P5: Code Review
- [ ] Code quality standards met
- [ ] Security considerations addressed

### P6: QA
- [ ] All acceptance criteria verified
- [ ] Edge cases handled

### P7: Documentation
- [ ] API/docs updated
- [ ] Examples included

## Troubleshooting

### GLM API Errors

If you see `GLM API error`, check:
1. `ZAI_API_KEY` is set correctly
2. API endpoint is accessible
3. Model name is correct
4. Rate limits not exceeded

### Provider Not Found

If you see `Unknown provider type`, ensure:
1. Provider name matches exactly: `'claude'` or `'glm'`
2. Provider is properly imported in `provider-factory.ts`

## Adding New Providers

1. Create provider class in `providers/` implementing `LLMProvider`
2. Add to `provider-factory.ts`
3. Update `ProviderType` in `base-provider.ts`
4. Document in this file
