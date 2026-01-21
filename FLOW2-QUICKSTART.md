# Flow 2 Quick Start Guide

## Prerequisites
- Node.js installed
- Claude API key in environment (`ANTHROPIC_API_KEY`)

## Step 1: Prepare Your PRD
Create your PRD document at `input/prd.md` (Markdown, YAML, or plain text)

## Step 2: Configure (Optional)
Edit `flow2-config.yaml` to set:
- `question_mode`: "thorough" | "balanced" | "minimal"
- `decomposition_strategy`: "thematic" | "functional" | "hybrid"

## Step 3: Run Flow 2
```bash
npm run flow2 -- --prd=input/prd.md
```

## Step 4: Review Outputs
- `analysis/prd-analysis.yaml` - Epic breakdown proposal
- `epics/epic-*.yaml` - Generated epics (2-18 files)
- `stories/pending/*.yaml` - Generated stories (30-200 files)
- `roadmap.yaml` - Execution plan with dependencies

## Step 5: Proceed to Flow 3
```bash
npm run flow3 -- --roadmap=roadmap.yaml
```
