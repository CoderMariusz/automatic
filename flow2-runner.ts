#!/usr/bin/env node
/**
 * Flow 2 Runner - PRD to Epic to Story Decomposition
 *
 * Orchestrates 4 stages:
 * - Stage 0: PRD Analysis (determine epic count)
 * - Stage 1: Epic Decomposition (parallel agents, max 3)
 * - Stage 2: Story Decomposition (parallel agents with interactive Q&A)
 * - Stage 3: Roadmap Generation (dependency graph, batches)
 * - Stage 4: User Review (manual gate before Flow 3)
 */

import fs from 'fs';
import path from 'path';
import yaml from 'yaml';
import readline from 'readline';
import { LLMProvider } from './providers/base-provider';
import { createProvider } from './providers/provider-factory';

// ============================================================================
// Types
// ============================================================================

interface Flow2Config {
    version: string;
    prd_analysis: {
        min_epic_count: number;
        max_epic_count: number;
        decomposition_strategy: 'thematic' | 'functional' | 'hybrid';
    };
    epic_decomposition: {
        model: 'sonnet' | 'opus';
        token_budget_per_epic: number;
        max_parallel_agents: number;
    };
    story_decomposition: {
        model: 'sonnet' | 'opus';
        question_mode: 'thorough' | 'balanced' | 'minimal';
        max_parallel_agents: number;
        target_story_size: string;
        max_ac_per_story: number;
    };
    roadmap: {
        model: 'sonnet' | 'opus';
        execution_mode: 'auto' | 'manual_review' | 'batch_approval';
        enable_critical_path_analysis: boolean;
        enable_risk_analysis: boolean;
    };
    providers: {
        claude: {
            api_key_source: string;
            model_mapping: {
                sonnet: string;
                opus: string;
            };
        };
    };
    validation: {
        validate_schemas: boolean;
        strict_mode: boolean;
        check_circular_dependencies: boolean;
    };
    logging: {
        level: string;
        output_dir: string;
        save_agent_prompts: boolean;
        save_agent_responses: boolean;
        log_token_usage: boolean;
    };
    output: {
        analysis_dir: string;
        epics_dir: string;
        stories_dir: string;
        roadmap_file: string;
    };
    quality_gates: {
        epic_min_ac: number;
        epic_max_ac: number;
        story_min_ac: number;
        story_max_ac: number;
        max_epic_token_warning: number;
    };
    interaction: {
        pause_after_prd_analysis: boolean;
        pause_after_epic_decomposition: boolean;
        pause_after_story_decomposition: boolean;
        pause_after_roadmap: boolean;
    };
    advanced: {
        enable_epic_splitting: boolean;
        enable_story_consolidation: boolean;
        parallel_question_mode: boolean;
    };
}

interface PRDAnalysis {
    analysis_version: string;
    analyzed_at: string;
    prd_metadata: {
        total_requirements: number;
        functional_requirements?: number;
        non_functional_requirements?: number;
        complexity_score: number;
    };
    recommended_epic_count: number;
    decomposition_strategy: string;
    proposed_epics: Array<{
        epic_id: string;
        title: string;
        scope: string;
        estimated_ac: number;
        rationale: string;
    }>;
    quality_issues?: Array<{
        severity: string;
        issue: string;
        recommendation: string;
    }>;
}

interface Epic {
    epic_id: string;
    title: string;
    // ... other fields will be in YAML
}

interface Story {
    story_id: string;
    epic: string;
    type: 'frontend' | 'backend' | 'fullstack';
    priority: string;
    complexity: 'S' | 'M' | 'L';
    status: string;
    title: string;
    description: string;
    acceptance_criteria: AcceptanceCriterion[];
    technical_notes?: string[];
    ux_notes?: string[];
    dependencies?: string[];
    estimated_effort?: string;
}

interface AcceptanceCriterion {
    id: string;
    title: string;
    given: string;
    when: string;
    then: string | string[];
    implementation?: {
        component: string;
        hooks?: string[];
        api_endpoint?: string;
        test_file: string;
        dependencies?: string[];
    };
}

interface StoryValidationResult {
    valid: boolean;
    errors: string[];
    warnings: string[];
}

interface Roadmap {
    roadmap_version: string;
    generated_at: string;
    total_epics: number;
    total_stories: number;
    // ... other fields
}

// ============================================================================
// Flow 2 Runner Class
// ============================================================================

class Flow2Runner {
    private config: Flow2Config;
    private provider: LLMProvider;
    private logDir: string;
    private runId: string;
    private storyContext: Record<string, string> = {};
    private rl: readline.Interface | null = null;

    constructor(configPath: string = 'flow2-config.yaml') {
        // Load config
        const configContent = fs.readFileSync(configPath, 'utf-8');
        this.config = yaml.parse(configContent) as Flow2Config;

        // Setup logging first (needed for provider)
        this.runId = new Date().toISOString().replace(/[:.]/g, '-');
        this.logDir = path.join(this.config.logging.output_dir, this.runId);
        fs.mkdirSync(this.logDir, { recursive: true });

        // Create log functions for provider
        const logFn = (msg: string) => this.log(msg, 'info');
        const logErrFn = (msg: string) => this.log(msg, 'error');
        const rawLogDir = path.join(this.logDir, 'raw');
        fs.mkdirSync(rawLogDir, { recursive: true });

        // Create provider with all required params
        this.provider = createProvider('claude', logFn, logErrFn, false, false, rawLogDir);

        this.log('Flow 2 Runner initialized', 'info');
    }

    // ========================================================================
    // Logging
    // ========================================================================

    private log(message: string, level: 'info' | 'warn' | 'error' | 'debug' = 'info') {
        const timestamp = new Date().toISOString();
        const logMessage = `[${timestamp}] [${level.toUpperCase()}] ${message}`;

        console.log(logMessage);

        // Write to log file
        const logFile = path.join(this.logDir, 'flow2.log');
        fs.appendFileSync(logFile, logMessage + '\n');
    }

    // ========================================================================
    // Stage 0: PRD Analysis
    // ========================================================================

    async stage0_analyzePRD(prdPath: string): Promise<PRDAnalysis> {
        this.log(`\n${'='.repeat(80)}`);
        this.log('STAGE 0: PRD ANALYSIS');
        this.log('='.repeat(80));

        // Read PRD
        const prdContent = fs.readFileSync(prdPath, 'utf-8');
        this.log(`Read PRD from: ${prdPath} (${prdContent.length} chars)`);

        // Read instruction
        const instructionPath = 'instructions/prd-analyzer.md';
        const instruction = fs.readFileSync(instructionPath, 'utf-8');

        // Build prompt
        const prompt = instruction
            .replace('{prd_content}', prdContent)
            .replace('{decomposition_strategy}', this.config.prd_analysis.decomposition_strategy)
            .replace('{min_epic_count}', this.config.prd_analysis.min_epic_count.toString())
            .replace('{max_epic_count}', this.config.prd_analysis.max_epic_count.toString());

        // Save prompt if configured
        if (this.config.logging.save_agent_prompts) {
            const promptFile = path.join(this.logDir, 'stage0-prompt.md');
            fs.writeFileSync(promptFile, prompt);
        }

        // Execute
        this.log('Running PRD analyzer agent (Sonnet)...');
        const startTime = Date.now();
        const result = await this.provider.execute(prompt, 600, 'prd-analyzer');
        const duration = ((Date.now() - startTime) / 1000).toFixed(1);

        if (!result.ok) {
            throw new Error(`PRD analysis failed: ${result.error}`);
        }

        this.log(`PRD analysis completed in ${duration}s`);

        // Save response
        if (this.config.logging.save_agent_responses) {
            const responseFile = path.join(this.logDir, 'stage0-response.txt');
            fs.writeFileSync(responseFile, result.output);
        }

        // Extract YAML from response
        const yamlMatch = result.output.match(/```ya?ml\n([\s\S]+?)\n```/);
        if (!yamlMatch) {
            throw new Error('No YAML found in PRD analysis response');
        }

        const analysis = yaml.parse(yamlMatch[1]) as PRDAnalysis;

        // Validate
        if (this.config.validation.validate_schemas) {
            this.validatePRDAnalysis(analysis);
        }

        // Save analysis
        const analysisPath = path.join(this.config.output.analysis_dir, 'prd-analysis.yaml');
        fs.mkdirSync(this.config.output.analysis_dir, { recursive: true });
        fs.writeFileSync(analysisPath, yaml.stringify(analysis));
        this.log(`Saved PRD analysis to: ${analysisPath}`);

        // Summary
        this.log(`\nPRD Analysis Summary:`);
        this.log(`  - Recommended Epic Count: ${analysis.recommended_epic_count}`);
        this.log(`  - Total Requirements: ${analysis.prd_metadata.total_requirements}`);
        this.log(`  - Complexity Score: ${analysis.prd_metadata.complexity_score}/10`);
        this.log(`  - Quality Issues: ${analysis.quality_issues?.length || 0}`);

        if (analysis.quality_issues && analysis.quality_issues.length > 0) {
            this.log(`\nQuality Issues Found:`);
            analysis.quality_issues.forEach(issue => {
                this.log(`  - [${issue.severity.toUpperCase()}] ${issue.issue}`);
            });
        }

        // Pause if configured
        if (this.config.interaction.pause_after_prd_analysis) {
            this.log('\n⏸  Pausing for user review of PRD analysis');
            this.log('Review analysis/prd-analysis.yaml and press Enter to continue...');
            await this.waitForUser();
        }

        return analysis;
    }

    // ========================================================================
    // Stage 1: Epic Decomposition
    // ========================================================================

    async stage1_buildEpics(prdPath: string, analysis: PRDAnalysis): Promise<void> {
        this.log(`\n${'='.repeat(80)}`);
        this.log('STAGE 1: EPIC DECOMPOSITION');
        this.log('='.repeat(80));

        const epicCount = analysis.recommended_epic_count;
        const batchSize = this.config.epic_decomposition.max_parallel_agents;

        this.log(`Building ${epicCount} epics in batches of ${batchSize}...`);

        // Read PRD
        const prdContent = fs.readFileSync(prdPath, 'utf-8');

        // Read instruction template
        const instructionPath = 'instructions/epic-builder.md';
        const instructionTemplate = fs.readFileSync(instructionPath, 'utf-8');

        // Process in batches
        for (let i = 0; i < epicCount; i += batchSize) {
            const batchNum = Math.floor(i / batchSize) + 1;
            const batchStart = i + 1;
            const batchEnd = Math.min(i + batchSize, epicCount);

            this.log(`\nBatch ${batchNum}: Building epics ${batchStart}-${batchEnd}...`);

            // Build batch of epic builders (parallel)
            const batchPromises = [];
            for (let j = 0; j < batchSize && (i + j) < epicCount; j++) {
                const epicNum = i + j + 1;
                const proposedEpic = analysis.proposed_epics[epicNum - 1];

                batchPromises.push(
                    this.buildSingleEpic(
                        prdContent,
                        instructionTemplate,
                        epicNum,
                        epicCount,
                        proposedEpic
                    )
                );
            }

            // Wait for batch completion
            await Promise.all(batchPromises);
            this.log(`Batch ${batchNum} completed`);
        }

        this.log(`\n✓ All ${epicCount} epics created successfully`);

        // Pause if configured
        if (this.config.interaction.pause_after_epic_decomposition) {
            this.log('\n⏸  Pausing for user review of epics');
            this.log('Review epics/*.yaml and press Enter to continue...');
            await this.waitForUser();
        }
    }

    private async buildSingleEpic(
        prdContent: string,
        instructionTemplate: string,
        epicNum: number,
        totalEpics: number,
        proposedEpic: any
    ): Promise<void> {
        const epicId = `epic-${epicNum.toString().padStart(2, '0')}`;

        this.log(`  Building ${epicId}: ${proposedEpic.title}...`);

        // Build prompt
        const prompt = instructionTemplate
            .replace(/{prd_content}/g, prdContent)
            .replace(/{epic_number}/g, epicNum.toString())
            .replace(/{total_epics}/g, totalEpics.toString())
            .replace(/{epic_title}/g, proposedEpic.title)
            .replace(/{epic_scope}/g, proposedEpic.scope)
            .replace(/{decomposition_strategy}/g, this.config.prd_analysis.decomposition_strategy);

        // Execute
        const result = await this.provider.execute(prompt, 900, `epic-builder-${epicId}`);

        if (!result.ok) {
            throw new Error(`Epic ${epicId} build failed: ${result.error}`);
        }

        // Extract YAML
        const yamlMatch = result.output.match(/```ya?ml\n([\s\S]+?)\n```/);
        if (!yamlMatch) {
            throw new Error(`No YAML found in ${epicId} response`);
        }

        const epicYaml = yamlMatch[1];

        // Save epic
        const epicPath = path.join(this.config.output.epics_dir, `${epicId}.yaml`);
        fs.mkdirSync(this.config.output.epics_dir, { recursive: true });
        fs.writeFileSync(epicPath, epicYaml);

        this.log(`  ✓ ${epicId} saved to ${epicPath}`);
    }

    // ========================================================================
    // Stage 2: Story Decomposition (with Q&A and Confirmation)
    // ========================================================================

    async stage2_buildStories(epicCount: number): Promise<void> {
        this.log(`\n${'='.repeat(80)}`);
        this.log('STAGE 2: STORY DECOMPOSITION');
        this.log('='.repeat(80));

        const questionMode = this.config.story_decomposition.question_mode;
        this.log(`Question Mode: ${questionMode}`);

        // Step 1: Collect Q&A context if in thorough mode
        if (questionMode === 'thorough') {
            this.log('\n--- Q&A PHASE ---');
            await this.collectStoryQuestionsInteractive(epicCount);
        }

        // Step 2: Generate stories for all epics
        this.log('\n--- STORY GENERATION PHASE ---');
        const allStories = await this.generateAllStories(epicCount);

        // Step 3: Validate stories against schema
        this.log('\n--- VALIDATION PHASE ---');
        const validationResults = this.validateAllStories(allStories);
        this.displayValidationResults(validationResults);

        // Step 4: Confirmation loop
        this.log('\n--- CONFIRMATION PHASE ---');
        const confirmed = await this.confirmStoriesWithUser(allStories);

        if (!confirmed) {
            this.log('Story generation cancelled by user');
            return;
        }

        // Step 5: Save confirmed stories
        this.log('\n--- SAVING STORIES ---');
        await this.saveStories(allStories);

        this.log(`\n✓ All stories created and saved successfully`);
    }

    private async collectStoryQuestionsInteractive(epicCount: number): Promise<void> {
        this.log('Collecting project context for story generation...\n');

        // Define Q&A categories for thorough mode
        const questions = [
            {
                key: 'state_management',
                question: 'State management approach?',
                options: ['useState (local)', 'Zustand', 'Redux', 'Context API'],
                default: 'useState (local)'
            },
            {
                key: 'styling',
                question: 'Styling solution?',
                options: ['Tailwind CSS', 'CSS Modules', 'styled-components', 'Vanilla CSS'],
                default: 'Tailwind CSS'
            },
            {
                key: 'error_handling',
                question: 'Error handling UI?',
                options: ['Toast notifications', 'Inline errors', 'Both toast + inline', 'Modal dialogs'],
                default: 'Toast notifications'
            },
            {
                key: 'loading_states',
                question: 'Loading state UI?',
                options: ['Skeleton loaders', 'Spinner', 'Progressive loading', 'None (instant)'],
                default: 'Skeleton loaders'
            },
            {
                key: 'data_persistence',
                question: 'Data persistence (MVP)?',
                options: ['localStorage', 'API from start', 'IndexedDB', 'Memory only'],
                default: 'localStorage'
            },
            {
                key: 'wcag_level',
                question: 'WCAG accessibility level?',
                options: ['A (minimum)', 'AA (standard)', 'AAA (strict)', 'None'],
                default: 'AA (standard)'
            },
            {
                key: 'empty_state',
                question: 'Empty state design?',
                options: ['Simple text', 'Illustration + CTA', 'Guided onboarding', 'Hidden until data'],
                default: 'Simple text'
            },
            {
                key: 'form_handling',
                question: 'Form library?',
                options: ['React Hook Form', 'Formik', 'Native forms', 'Custom hooks'],
                default: 'React Hook Form'
            }
        ];

        // Ask each question
        for (const q of questions) {
            const answer = await this.askUserQuestion(q.question, q.options, q.default);
            this.storyContext[q.key] = answer;
            this.log(`  ${q.key}: ${answer}`);
        }

        this.log('\n✓ Q&A context collected');
    }

    private async askUserQuestion(question: string, options: string[], defaultOption: string): Promise<string> {
        return new Promise((resolve) => {
            console.log(`\n${question}`);
            options.forEach((opt, i) => {
                const isDefault = opt === defaultOption ? ' (default)' : '';
                console.log(`  ${i + 1}. ${opt}${isDefault}`);
            });
            console.log(`  Enter 1-${options.length} or press Enter for default: `);

            if (!this.rl) {
                this.rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
            }

            this.rl.question('> ', (answer) => {
                const trimmed = answer.trim();
                if (trimmed === '') {
                    resolve(defaultOption);
                } else {
                    const num = parseInt(trimmed, 10);
                    if (num >= 1 && num <= options.length) {
                        resolve(options[num - 1]);
                    } else {
                        resolve(defaultOption);
                    }
                }
            });
        });
    }

    private async generateAllStories(epicCount: number): Promise<Map<string, Story[]>> {
        const allStories = new Map<string, Story[]>();
        const batchSize = this.config.story_decomposition.max_parallel_agents;

        this.log(`Generating stories for ${epicCount} epics in batches of ${batchSize}...`);

        // Read instruction template
        const instructionPath = 'instructions/story-builder.md';
        const instructionTemplate = fs.readFileSync(instructionPath, 'utf-8');

        // Process epics in batches
        for (let i = 0; i < epicCount; i += batchSize) {
            const batchNum = Math.floor(i / batchSize) + 1;
            const batchStart = i + 1;
            const batchEnd = Math.min(i + batchSize, epicCount);

            this.log(`\nBatch ${batchNum}: Generating stories for epics ${batchStart}-${batchEnd}...`);

            const batchPromises = [];
            for (let j = 0; j < batchSize && (i + j) < epicCount; j++) {
                const epicNum = i + j + 1;
                const epicId = `epic-${epicNum.toString().padStart(2, '0')}`;

                batchPromises.push(
                    this.generateStoriesForEpic(epicId, instructionTemplate)
                );
            }

            const results = await Promise.all(batchPromises);
            results.forEach(({ epicId, stories }) => {
                allStories.set(epicId, stories);
            });

            this.log(`Batch ${batchNum} completed`);
        }

        return allStories;
    }

    private async generateStoriesForEpic(
        epicId: string,
        instructionTemplate: string
    ): Promise<{ epicId: string; stories: Story[] }> {
        this.log(`  Generating stories for ${epicId}...`);

        // Read epic
        const epicPath = path.join(this.config.output.epics_dir, `${epicId}.yaml`);
        const epicContent = fs.readFileSync(epicPath, 'utf-8');

        // Build context string from Q&A
        const contextStr = Object.entries(this.storyContext)
            .map(([key, value]) => `- ${key}: ${value}`)
            .join('\n');

        // Build prompt with context
        let prompt = instructionTemplate
            .replace(/{epic_id}/g, epicId)
            .replace(/{epic_yaml}/g, epicContent)
            .replace(/{question_mode}/g, this.config.story_decomposition.question_mode)
            .replace(/{max_ac_per_story}/g, this.config.story_decomposition.max_ac_per_story.toString());

        // Add Q&A context if available
        if (Object.keys(this.storyContext).length > 0) {
            prompt += `\n\n## User Context (from Q&A)\n${contextStr}`;
        }

        // Execute
        const result = await this.provider.execute(prompt, 1800, `story-builder-${epicId}`);

        if (!result.ok) {
            throw new Error(`Story building for ${epicId} failed: ${result.error}`);
        }

        // Extract all YAML blocks
        const yamlBlocks = result.output.matchAll(/```ya?ml\n([\s\S]+?)\n```/g);
        const stories: Story[] = [];
        let storyNum = 0;

        for (const match of yamlBlocks) {
            storyNum++;
            try {
                const story = yaml.parse(match[1]) as Story;
                // Ensure story_id is set correctly
                story.story_id = `${epicId}.story-${storyNum.toString().padStart(2, '0')}`;
                story.epic = epicId;
                stories.push(story);
            } catch (e) {
                this.log(`  Warning: Failed to parse story ${storyNum} for ${epicId}`, 'warn');
            }
        }

        this.log(`  ✓ ${epicId}: Generated ${stories.length} stories`);
        return { epicId, stories };
    }

    private validateAllStories(allStories: Map<string, Story[]>): Map<string, StoryValidationResult[]> {
        const results = new Map<string, StoryValidationResult[]>();

        for (const [epicId, stories] of allStories) {
            const epicResults: StoryValidationResult[] = [];
            for (const story of stories) {
                epicResults.push(this.validateStorySchema(story));
            }
            results.set(epicId, epicResults);
        }

        return results;
    }

    private validateStorySchema(story: Story): StoryValidationResult {
        const errors: string[] = [];
        const warnings: string[] = [];

        // Required fields
        if (!story.story_id) errors.push('Missing story_id');
        if (!story.epic) errors.push('Missing epic');
        if (!story.type) errors.push('Missing type');
        if (!story.priority) errors.push('Missing priority');
        if (!story.complexity) errors.push('Missing complexity');
        if (!story.title) errors.push('Missing title');
        if (!story.description) errors.push('Missing description');

        // AC validation
        if (!story.acceptance_criteria || story.acceptance_criteria.length === 0) {
            errors.push('Missing acceptance_criteria');
        } else {
            // Check AC count vs complexity
            const acCount = story.acceptance_criteria.length;
            const expectedRanges: Record<string, [number, number]> = {
                'S': [1, 2],
                'M': [2, 3],
                'L': [3, 4]
            };
            const [min, max] = expectedRanges[story.complexity] || [1, 4];
            if (acCount < min || acCount > max) {
                warnings.push(`AC count (${acCount}) outside expected range for ${story.complexity} complexity [${min}-${max}]`);
            }

            // Check each AC for implementation section
            story.acceptance_criteria.forEach((ac, i) => {
                if (!ac.given) errors.push(`AC-${i + 1}: Missing 'given'`);
                if (!ac.when) errors.push(`AC-${i + 1}: Missing 'when'`);
                if (!ac.then) errors.push(`AC-${i + 1}: Missing 'then'`);
                if (!ac.implementation) {
                    warnings.push(`AC-${i + 1}: Missing 'implementation' section (needed for scaffold)`);
                } else {
                    if (!ac.implementation.component) warnings.push(`AC-${i + 1}: Missing implementation.component`);
                    if (!ac.implementation.test_file) warnings.push(`AC-${i + 1}: Missing implementation.test_file`);
                }
            });
        }

        return {
            valid: errors.length === 0,
            errors,
            warnings
        };
    }

    private displayValidationResults(results: Map<string, StoryValidationResult[]>): void {
        let totalErrors = 0;
        let totalWarnings = 0;

        for (const [epicId, storyResults] of results) {
            for (const result of storyResults) {
                totalErrors += result.errors.length;
                totalWarnings += result.warnings.length;
            }
        }

        if (totalErrors === 0 && totalWarnings === 0) {
            this.log('✓ All stories passed validation');
        } else {
            this.log(`Validation: ${totalErrors} errors, ${totalWarnings} warnings`);
            if (totalErrors > 0) {
                this.log('\nErrors:', 'error');
                for (const [epicId, storyResults] of results) {
                    storyResults.forEach((result, i) => {
                        if (result.errors.length > 0) {
                            this.log(`  ${epicId}.story-${(i + 1).toString().padStart(2, '0')}:`, 'error');
                            result.errors.forEach(e => this.log(`    - ${e}`, 'error'));
                        }
                    });
                }
            }
        }
    }

    private async confirmStoriesWithUser(allStories: Map<string, Story[]>): Promise<boolean> {
        // Display summary
        this.displayStorySummary(allStories);

        // Confirmation loop
        let confirmed = false;
        while (!confirmed) {
            const action = await this.askUserQuestion(
                '\nCo chcesz zrobić?',
                [
                    'Zaakceptuj wszystkie',
                    'Przejrzyj konkretne story',
                    'Regeneruj z nowymi wymaganiami',
                    'Anuluj'
                ],
                'Zaakceptuj wszystkie'
            );

            if (action === 'Zaakceptuj wszystkie') {
                confirmed = true;
            } else if (action === 'Przejrzyj konkretne story') {
                await this.reviewSpecificStory(allStories);
            } else if (action === 'Regeneruj z nowymi wymaganiami') {
                this.log('Regeneration not implemented yet - accepting current stories');
                confirmed = true;
            } else {
                return false;
            }
        }

        return true;
    }

    private displayStorySummary(allStories: Map<string, Story[]>): void {
        let totalStories = 0;
        let totalAC = 0;
        const complexityCounts = { S: 0, M: 0, L: 0 };
        const typeCounts = { frontend: 0, backend: 0, fullstack: 0 };

        this.log('\n📊 STORY SUMMARY');
        this.log('─'.repeat(70));
        this.log('| # | Epic ID  | Story ID              | Title                    | Type     | Cmplx |');
        this.log('─'.repeat(70));

        let num = 0;
        for (const [epicId, stories] of allStories) {
            for (const story of stories) {
                num++;
                totalStories++;
                totalAC += story.acceptance_criteria?.length || 0;
                complexityCounts[story.complexity]++;
                typeCounts[story.type]++;

                const title = story.title.substring(0, 24).padEnd(24);
                const type = story.type.padEnd(8);
                const storyId = story.story_id.padEnd(21);
                this.log(`| ${num.toString().padStart(2)} | ${epicId} | ${storyId} | ${title} | ${type} | ${story.complexity}     |`);
            }
        }

        this.log('─'.repeat(70));
        this.log(`\n📈 STATISTICS:`);
        this.log(`  - Total stories: ${totalStories}`);
        this.log(`  - Total AC: ${totalAC}`);
        this.log(`  - Complexity: S=${complexityCounts.S}, M=${complexityCounts.M}, L=${complexityCounts.L}`);
        this.log(`  - Types: frontend=${typeCounts.frontend}, backend=${typeCounts.backend}, fullstack=${typeCounts.fullstack}`);
    }

    private async reviewSpecificStory(allStories: Map<string, Story[]>): Promise<void> {
        // Get all story IDs
        const storyIds: string[] = [];
        for (const [, stories] of allStories) {
            for (const story of stories) {
                storyIds.push(story.story_id);
            }
        }

        const storyId = await this.askUserQuestion(
            'Które story chcesz przejrzeć?',
            storyIds.slice(0, 4), // Show first 4 options
            storyIds[0]
        );

        // Find and display the story
        for (const [, stories] of allStories) {
            for (const story of stories) {
                if (story.story_id === storyId) {
                    this.log(`\n--- ${story.story_id} ---`);
                    this.log(yaml.stringify(story));
                    return;
                }
            }
        }
    }

    private async saveStories(allStories: Map<string, Story[]>): Promise<void> {
        fs.mkdirSync(this.config.output.stories_dir, { recursive: true });

        let savedCount = 0;
        for (const [, stories] of allStories) {
            for (const story of stories) {
                const storyPath = path.join(this.config.output.stories_dir, `${story.story_id}.yaml`);
                fs.writeFileSync(storyPath, yaml.stringify(story));
                savedCount++;
            }
        }

        this.log(`\n✅ ZAPISANO ${savedCount} STORIES:`);
        for (const [, stories] of allStories) {
            for (const story of stories) {
                this.log(`  - ${this.config.output.stories_dir}/${story.story_id}.yaml`);
            }
        }
    }

    // ========================================================================
    // Stage 3: Roadmap Generation (Algorithmic - No LLM)
    // ========================================================================

    async stage3_buildRoadmap(): Promise<void> {
        this.log(`\n${'='.repeat(80)}`);
        this.log('STAGE 3: ROADMAP GENERATION (Algorithmic)');
        this.log('='.repeat(80));

        // Read all stories
        const stories = this.loadAllYamlFiles(this.config.output.stories_dir) as Story[];
        const epics = this.loadAllYamlFiles(this.config.output.epics_dir);

        this.log(`Loaded ${epics.length} epics and ${stories.length} stories`);

        // Step 1: Build dependency graph
        this.log('\n1. Building dependency graph...');
        const graph = this.buildDependencyGraph(stories);

        // Step 2: Check for circular dependencies
        this.log('2. Checking for circular dependencies...');
        const cycle = this.detectCircularDependencies(graph, stories);
        if (cycle) {
            throw new Error(`CIRCULAR DEPENDENCY DETECTED: ${cycle.join(' → ')}`);
        }
        this.log('   ✓ No circular dependencies');

        // Step 3: Topological sort to create execution batches
        this.log('3. Creating execution batches...');
        const batches = this.createExecutionBatches(graph, stories);
        this.log(`   ✓ Created ${batches.length} batches`);

        // Step 4: Calculate critical path
        let criticalPath: string[] = [];
        let criticalPathDuration = '0h';
        if (this.config.roadmap.enable_critical_path_analysis) {
            this.log('4. Calculating critical path...');
            const result = this.calculateCriticalPath(graph, stories);
            criticalPath = result.path;
            criticalPathDuration = result.duration;
            this.log(`   ✓ Critical path: ${criticalPath.length} stories, ${criticalPathDuration}`);
        }

        // Step 5: Assign NOW/NEXT/LATER priorities
        this.log('5. Assigning priorities...');
        const priorities = this.assignPriorities(batches, stories, epics);

        // Step 6: Build simplified roadmap object
        // Format: stories with dependencies and phase for runner.ts consumption
        const roadmap = {
            roadmap_version: '2.0',
            generated_at: new Date().toISOString(),
            total_stories: stories.length,

            // Execution config for runner.ts
            execution: {
                max_parallel: 3,
                target_phase: 'MVP'  // Runner will only process stories in this phase
            },

            // Simple story list with dependencies and phase
            stories: stories.map(story => ({
                story_id: story.story_id,
                depends_on: story.dependencies || [],
                phase: this.assignPhase(story, priorities),
                complexity: story.complexity,
                type: story.type
            })),

            // Phase summary
            phases: {
                MVP: {
                    story_count: stories.filter(s => this.assignPhase(s, priorities) === 'MVP').length,
                    description: 'Core functionality - must have'
                },
                P2: {
                    story_count: stories.filter(s => this.assignPhase(s, priorities) === 'P2').length,
                    description: 'Important features - should have'
                },
                P3: {
                    story_count: stories.filter(s => this.assignPhase(s, priorities) === 'P3').length,
                    description: 'Nice to have - could have'
                }
            },

            // Keep critical path for reference
            critical_path: criticalPath,
            critical_path_duration: criticalPathDuration
        };

        // Save roadmap
        const roadmapYaml = yaml.stringify(roadmap);
        fs.writeFileSync(this.config.output.roadmap_file, roadmapYaml);
        this.log(`\n✓ Roadmap saved to: ${this.config.output.roadmap_file}`);

        // Display summary
        this.displayRoadmapSummaryAlgorithmic(roadmap);

        // Pause for user review
        if (this.config.interaction.pause_after_roadmap) {
            this.log('\n⏸  MANUAL REVIEW REQUIRED');
            this.log('Review roadmap.yaml and approve before proceeding to Flow 3');
            this.log('\nPress Enter to approve roadmap...');
            await this.waitForUser();
            this.log('✓ Roadmap approved by user');
        }
    }

    private buildDependencyGraph(stories: Story[]): Map<string, string[]> {
        const graph = new Map<string, string[]>();

        for (const story of stories) {
            graph.set(story.story_id, story.dependencies || []);
        }

        return graph;
    }

    private detectCircularDependencies(graph: Map<string, string[]>, stories: Story[]): string[] | null {
        const visited = new Set<string>();
        const recStack = new Set<string>();
        const path: string[] = [];

        const dfs = (storyId: string): string[] | null => {
            visited.add(storyId);
            recStack.add(storyId);
            path.push(storyId);

            const deps = graph.get(storyId) || [];
            for (const dep of deps) {
                if (!visited.has(dep)) {
                    const cycle = dfs(dep);
                    if (cycle) return cycle;
                } else if (recStack.has(dep)) {
                    // Found cycle
                    const cycleStart = path.indexOf(dep);
                    return [...path.slice(cycleStart), dep];
                }
            }

            path.pop();
            recStack.delete(storyId);
            return null;
        };

        for (const story of stories) {
            if (!visited.has(story.story_id)) {
                const cycle = dfs(story.story_id);
                if (cycle) return cycle;
            }
        }

        return null;
    }

    private createExecutionBatches(graph: Map<string, string[]>, stories: Story[]): Array<{ stories: string[]; duration: string }> {
        const batches: Array<{ stories: string[]; duration: string }> = [];
        const completed = new Set<string>();
        const storyMap = new Map(stories.map(s => [s.story_id, s]));

        while (completed.size < stories.length) {
            // Find all stories whose dependencies are satisfied
            const ready: string[] = [];

            for (const story of stories) {
                if (completed.has(story.story_id)) continue;

                const deps = graph.get(story.story_id) || [];
                const allDepsMet = deps.every(dep => completed.has(dep));

                if (allDepsMet) {
                    ready.push(story.story_id);
                }
            }

            if (ready.length === 0 && completed.size < stories.length) {
                // Shouldn't happen if no circular deps, but safety check
                const remaining = stories.filter(s => !completed.has(s.story_id)).map(s => s.story_id);
                this.log(`Warning: ${remaining.length} stories cannot be scheduled`, 'warn');
                break;
            }

            // Calculate batch duration (max of individual durations since parallel)
            let maxHours = 0;
            for (const storyId of ready) {
                const story = storyMap.get(storyId);
                if (story?.estimated_effort) {
                    const hours = this.parseEffortToHours(story.estimated_effort);
                    maxHours = Math.max(maxHours, hours);
                }
            }

            batches.push({
                stories: ready,
                duration: maxHours > 0 ? `${maxHours}h` : '4h'
            });

            // Mark as completed
            ready.forEach(id => completed.add(id));
        }

        return batches;
    }

    private parseEffortToHours(effort: string): number {
        const match = effort.match(/^(\d+)(h|d)$/);
        if (!match) return 4; // default
        const value = parseInt(match[1], 10);
        return match[2] === 'd' ? value * 8 : value;
    }

    private calculateCriticalPath(graph: Map<string, string[]>, stories: Story[]): { path: string[]; duration: string } {
        const storyMap = new Map(stories.map(s => [s.story_id, s]));
        const memo = new Map<string, { path: string[]; hours: number }>();

        const longestPath = (storyId: string): { path: string[]; hours: number } => {
            if (memo.has(storyId)) return memo.get(storyId)!;

            const story = storyMap.get(storyId);
            const myHours = story ? this.parseEffortToHours(story.estimated_effort || '4h') : 4;

            const deps = graph.get(storyId) || [];
            if (deps.length === 0) {
                const result = { path: [storyId], hours: myHours };
                memo.set(storyId, result);
                return result;
            }

            let longest = { path: [] as string[], hours: 0 };
            for (const dep of deps) {
                const depResult = longestPath(dep);
                if (depResult.hours > longest.hours) {
                    longest = depResult;
                }
            }

            const result = {
                path: [...longest.path, storyId],
                hours: longest.hours + myHours
            };
            memo.set(storyId, result);
            return result;
        };

        // Find story with longest total path
        let criticalPath = { path: [] as string[], hours: 0 };
        for (const story of stories) {
            const result = longestPath(story.story_id);
            if (result.hours > criticalPath.hours) {
                criticalPath = result;
            }
        }

        const days = Math.ceil(criticalPath.hours / 8);
        return {
            path: criticalPath.path,
            duration: days <= 5 ? `${criticalPath.hours}h` : `${days}d`
        };
    }

    private assignPriorities(
        batches: Array<{ stories: string[]; duration: string }>,
        stories: Story[],
        epics: any[]
    ): { NOW: any; NEXT: any; LATER: any } {
        const storyMap = new Map(stories.map(s => [s.story_id, s]));
        const epicStories = new Map<string, string[]>();

        // Group stories by epic
        for (const story of stories) {
            const epicId = story.epic;
            if (!epicStories.has(epicId)) {
                epicStories.set(epicId, []);
            }
            epicStories.get(epicId)!.push(story.story_id);
        }

        // NOW = first 1-2 batches (foundation)
        // NEXT = middle batches
        // LATER = last batches
        const nowBatches = Math.max(1, Math.floor(batches.length * 0.3));
        const nextBatches = Math.max(1, Math.floor(batches.length * 0.4));

        const nowStories = new Set(batches.slice(0, nowBatches).flatMap(b => b.stories));
        const nextStories = new Set(batches.slice(nowBatches, nowBatches + nextBatches).flatMap(b => b.stories));
        const laterStories = new Set(batches.slice(nowBatches + nextBatches).flatMap(b => b.stories));

        // Determine epic assignments
        const nowEpics = new Set<string>();
        const nextEpics = new Set<string>();
        const laterEpics = new Set<string>();

        for (const [epicId, storyIds] of epicStories) {
            const inNow = storyIds.filter(s => nowStories.has(s)).length;
            const inNext = storyIds.filter(s => nextStories.has(s)).length;
            const inLater = storyIds.filter(s => laterStories.has(s)).length;

            // Assign epic to bucket with most stories
            if (inNow >= inNext && inNow >= inLater) nowEpics.add(epicId);
            else if (inNext >= inLater) nextEpics.add(epicId);
            else laterEpics.add(epicId);
        }

        return {
            NOW: {
                epics: Array.from(nowEpics),
                stories: nowStories.size,
                rationale: 'Foundation work with no blocking dependencies'
            },
            NEXT: {
                epics: Array.from(nextEpics),
                stories: nextStories.size,
                rationale: 'Builds on NOW foundation, high business value'
            },
            LATER: {
                epics: Array.from(laterEpics),
                stories: laterStories.size,
                rationale: 'Lower priority or blocked by earlier work'
            }
        };
    }

    private generateRecommendations(batches: Array<{ stories: string[]; duration: string }>, stories: Story[]): string[] {
        const recommendations: string[] = [];

        if (batches.length > 0) {
            recommendations.push(`Start with batch-01 (${batches[0].stories.length} stories, no dependencies)`);
        }

        // Find parallel opportunities
        const parallelBatches = batches.filter(b => b.stories.length > 1);
        if (parallelBatches.length > 0) {
            recommendations.push(`${parallelBatches.length} batches can run stories in parallel`);
        }

        // Find large stories
        const largeStories = stories.filter(s => s.complexity === 'L');
        if (largeStories.length > 0) {
            recommendations.push(`${largeStories.length} large (L) stories - consider breaking down if possible`);
        }

        return recommendations;
    }

    private assignPhase(story: Story, priorities: { NOW: any; NEXT: any; LATER: any }): 'MVP' | 'P2' | 'P3' {
        // MVP = NOW bucket (P0 priority stories)
        // P2 = NEXT bucket (P1 priority stories)
        // P3 = LATER bucket (P2-P3 priority stories)

        const nowEpics = new Set(priorities.NOW.epics);
        const nextEpics = new Set(priorities.NEXT.epics);

        // Also check story priority directly
        if (story.priority === 'P0' || nowEpics.has(story.epic)) {
            return 'MVP';
        } else if (story.priority === 'P1' || nextEpics.has(story.epic)) {
            return 'P2';
        } else {
            return 'P3';
        }
    }

    private displayRoadmapSummaryAlgorithmic(roadmap: any): void {
        this.log('\n📊 ROADMAP SUMMARY (v2.0)');
        this.log('─'.repeat(50));
        this.log(`Total Stories: ${roadmap.total_stories}`);
        this.log(`Max Parallel: ${roadmap.execution.max_parallel}`);
        this.log(`Target Phase: ${roadmap.execution.target_phase}`);

        this.log('\n📈 PHASES:');
        this.log(`  MVP: ${roadmap.phases.MVP.story_count} stories (${roadmap.phases.MVP.description})`);
        this.log(`  P2:  ${roadmap.phases.P2.story_count} stories (${roadmap.phases.P2.description})`);
        this.log(`  P3:  ${roadmap.phases.P3.story_count} stories (${roadmap.phases.P3.description})`);

        if (roadmap.critical_path.length > 0) {
            this.log(`\n🔥 Critical Path: ${roadmap.critical_path.length} stories, ${roadmap.critical_path_duration}`);
        }

        // Show first 5 stories with dependencies
        this.log('\n📋 STORIES (first 5):');
        roadmap.stories.slice(0, 5).forEach((s: any) => {
            const deps = s.depends_on.length > 0 ? `→ [${s.depends_on.join(', ')}]` : '(no deps)';
            this.log(`  ${s.story_id} [${s.phase}] ${deps}`);
        });
        if (roadmap.stories.length > 5) {
            this.log(`  ... and ${roadmap.stories.length - 5} more`);
        }
    }

    // ========================================================================
    // Helper Methods
    // ========================================================================

    private validatePRDAnalysis(analysis: PRDAnalysis): void {
        if (analysis.recommended_epic_count < this.config.prd_analysis.min_epic_count ||
            analysis.recommended_epic_count > this.config.prd_analysis.max_epic_count) {
            throw new Error(
                `Epic count ${analysis.recommended_epic_count} outside valid range ` +
                `[${this.config.prd_analysis.min_epic_count}, ${this.config.prd_analysis.max_epic_count}]`
            );
        }
    }

    private loadAllYamlFiles(dir: string): any[] {
        const files = fs.readdirSync(dir).filter(f => f.endsWith('.yaml'));
        return files.map(f => {
            const content = fs.readFileSync(path.join(dir, f), 'utf-8');
            return yaml.parse(content);
        });
    }


    private async waitForUser(): Promise<void> {
        return new Promise((resolve) => {
            if (!this.rl) {
                this.rl = readline.createInterface({
                    input: process.stdin,
                    output: process.stdout
                });
            }
            this.rl.question('', () => resolve());
        });
    }

    private cleanup(): void {
        if (this.rl) {
            this.rl.close();
            this.rl = null;
        }
    }

    // ========================================================================
    // Main Execution
    // ========================================================================

    async run(prdPath: string): Promise<void> {
        const startTime = Date.now();
        this.log(`\nFlow 2 Starting...`);
        this.log(`PRD: ${prdPath}`);
        this.log(`Run ID: ${this.runId}\n`);

        try {
            // Stage 0: PRD Analysis
            const analysis = await this.stage0_analyzePRD(prdPath);

            // Stage 1: Epic Decomposition
            await this.stage1_buildEpics(prdPath, analysis);

            // Stage 2: Story Decomposition
            await this.stage2_buildStories(analysis.recommended_epic_count);

            // Stage 3: Roadmap Generation
            await this.stage3_buildRoadmap();

            // Success
            const duration = ((Date.now() - startTime) / 1000 / 60).toFixed(1);
            this.log(`\n${'='.repeat(80)}`);
            this.log(`✓ Flow 2 Complete (${duration} minutes)`);
            this.log('='.repeat(80));
            this.log('\nNext Steps:');
            this.log('1. Review roadmap.yaml');
            this.log('2. Run Flow 3 with: npm run flow3 -- --roadmap=roadmap.yaml');
        } catch (error) {
            this.log(`\n❌ Flow 2 Failed: ${(error as Error).message}`, 'error');
            throw error;
        } finally {
            this.cleanup();
        }
    }
}

// ============================================================================
// CLI Entry Point
// ============================================================================

async function main() {
    const args = process.argv.slice(2);

    // Parse arguments
    let prdPath = 'input/prd.md';
    let configPath = 'flow2-config.yaml';

    for (const arg of args) {
        if (arg.startsWith('--prd=')) {
            prdPath = arg.substring(6);
        } else if (arg.startsWith('--config=')) {
            configPath = arg.substring(9);
        }
    }

    // Validate PRD exists
    if (!fs.existsSync(prdPath)) {
        console.error(`Error: PRD file not found: ${prdPath}`);
        console.error('\nUsage: npm run flow2 -- --prd=<path-to-prd>');
        process.exit(1);
    }

    // Run Flow 2
    const runner = new Flow2Runner(configPath);
    await runner.run(prdPath);
}

// Run if called directly (ESM compatible)
import { fileURLToPath } from 'url';
const __filename = fileURLToPath(import.meta.url);

if (process.argv[1] === __filename || process.argv[1]?.endsWith('flow2-runner.ts')) {
    main().catch(error => {
        console.error('Fatal error:', error);
        process.exit(1);
    });
}

export { Flow2Runner };
