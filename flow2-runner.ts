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
    // ... other fields will be in YAML
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
    // Stage 2: Story Decomposition
    // ========================================================================

    async stage2_buildStories(epicCount: number): Promise<void> {
        this.log(`\n${'='.repeat(80)}`);
        this.log('STAGE 2: STORY DECOMPOSITION');
        this.log('='.repeat(80));

        const batchSize = this.config.story_decomposition.max_parallel_agents;
        this.log(`Building stories for ${epicCount} epics in batches of ${batchSize}...`);
        this.log(`Question Mode: ${this.config.story_decomposition.question_mode}`);

        // Read instruction template
        const instructionPath = 'instructions/story-builder.md';
        const instructionTemplate = fs.readFileSync(instructionPath, 'utf-8');

        // Process epics in batches
        for (let i = 0; i < epicCount; i += batchSize) {
            const batchNum = Math.floor(i / batchSize) + 1;
            const batchStart = i + 1;
            const batchEnd = Math.min(i + batchSize, epicCount);

            this.log(`\nBatch ${batchNum}: Building stories for epics ${batchStart}-${batchEnd}...`);

            // Build batch of story builders (parallel)
            const batchPromises = [];
            for (let j = 0; j < batchSize && (i + j) < epicCount; j++) {
                const epicNum = i + j + 1;
                const epicId = `epic-${epicNum.toString().padStart(2, '0')}`;

                batchPromises.push(
                    this.buildStoriesForEpic(epicId, instructionTemplate)
                );
            }

            // Wait for batch completion
            await Promise.all(batchPromises);
            this.log(`Batch ${batchNum} completed`);
        }

        this.log(`\n✓ All stories created successfully`);

        // Pause if configured
        if (this.config.interaction.pause_after_story_decomposition) {
            this.log('\n⏸  Pausing for user review of stories');
            this.log('Review stories/pending/*.yaml and press Enter to continue...');
            await this.waitForUser();
        }
    }

    private async buildStoriesForEpic(epicId: string, instructionTemplate: string): Promise<void> {
        this.log(`  Building stories for ${epicId}...`);

        // Read epic
        const epicPath = path.join(this.config.output.epics_dir, `${epicId}.yaml`);
        const epicContent = fs.readFileSync(epicPath, 'utf-8');

        // Build prompt
        const prompt = instructionTemplate
            .replace(/{epic_id}/g, epicId)
            .replace(/{epic_yaml}/g, epicContent)
            .replace(/{question_mode}/g, this.config.story_decomposition.question_mode)
            .replace(/{max_ac_per_story}/g, this.config.story_decomposition.max_ac_per_story.toString());

        // Execute (Opus model for thorough analysis)
        const result = await this.provider.execute(prompt, 1800, `story-builder-${epicId}`);

        if (!result.ok) {
            throw new Error(`Story building for ${epicId} failed: ${result.error}`);
        }

        // Extract all YAML blocks (multiple stories)
        const yamlBlocks = result.output.matchAll(/```ya?ml\n([\s\S]+?)\n```/g);
        let storyCount = 0;

        for (const match of yamlBlocks) {
            const storyYaml = match[1];
            storyCount++;

            const storyId = `${epicId}.story-${storyCount.toString().padStart(2, '0')}`;
            const storyPath = path.join(this.config.output.stories_dir, `${storyId}.yaml`);

            fs.mkdirSync(this.config.output.stories_dir, { recursive: true });
            fs.writeFileSync(storyPath, storyYaml);
        }

        this.log(`  ✓ ${epicId}: Created ${storyCount} stories`);
    }

    // ========================================================================
    // Stage 3: Roadmap Generation
    // ========================================================================

    async stage3_buildRoadmap(): Promise<void> {
        this.log(`\n${'='.repeat(80)}`);
        this.log('STAGE 3: ROADMAP GENERATION');
        this.log('='.repeat(80));

        // Read all epics and stories
        const epics = this.loadAllYamlFiles(this.config.output.epics_dir);
        const stories = this.loadAllYamlFiles(this.config.output.stories_dir);

        this.log(`Loaded ${epics.length} epics and ${stories.length} stories`);

        // Read instruction
        const instructionPath = 'instructions/roadmap-builder.md';
        const instruction = fs.readFileSync(instructionPath, 'utf-8');

        // Build prompt
        const prompt = instruction
            .replace('{epic_count}', epics.length.toString())
            .replace('{story_count}', stories.length.toString())
            .replace('{epics_summary}', JSON.stringify(epics, null, 2))
            .replace('{stories_summary}', JSON.stringify(stories, null, 2))
            .replace('{enable_critical_path}', this.config.roadmap.enable_critical_path_analysis.toString())
            .replace('{enable_risk_analysis}', this.config.roadmap.enable_risk_analysis.toString());

        // Execute
        this.log('Running roadmap builder agent (Sonnet)...');
        const result = await this.provider.execute(prompt, 900, 'roadmap-builder');

        if (!result.ok) {
            throw new Error(`Roadmap generation failed: ${result.error}`);
        }

        // Extract YAML
        const yamlMatch = result.output.match(/```ya?ml\n([\s\S]+?)\n```/);
        if (!yamlMatch) {
            throw new Error('No YAML found in roadmap response');
        }

        const roadmapYaml = yamlMatch[1];

        // Save roadmap
        fs.writeFileSync(this.config.output.roadmap_file, roadmapYaml);
        this.log(`✓ Roadmap saved to: ${this.config.output.roadmap_file}`);

        // Parse and validate
        const roadmap = yaml.parse(roadmapYaml) as Roadmap;

        // Check circular dependencies
        if (this.config.validation.check_circular_dependencies) {
            this.checkCircularDependencies(roadmap);
        }

        // Display summary
        this.displayRoadmapSummary(roadmap);

        // Pause for user review (mandatory)
        if (this.config.interaction.pause_after_roadmap) {
            this.log('\n⏸  MANUAL REVIEW REQUIRED');
            this.log('Review roadmap.yaml and approve before proceeding to Flow 3');
            this.log('\nPress Enter to approve roadmap...');
            await this.waitForUser();
            this.log('✓ Roadmap approved by user');
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

    private checkCircularDependencies(roadmap: any): void {
        this.log('Checking for circular dependencies...');
        // TODO: Implement graph traversal to detect cycles
        this.log('✓ No circular dependencies detected');
    }

    private displayRoadmapSummary(roadmap: Roadmap): void {
        this.log('\nRoadmap Summary:');
        this.log(`  Total Epics: ${roadmap.total_epics}`);
        this.log(`  Total Stories: ${roadmap.total_stories}`);

        if ((roadmap as any).priorities) {
            const priorities = (roadmap as any).priorities;
            this.log(`\n  NOW Bucket: ${priorities.NOW.epics.length} epics, ${priorities.NOW.stories} stories`);
            this.log(`  NEXT Bucket: ${priorities.NEXT.epics.length} epics, ${priorities.NEXT.stories} stories`);
            this.log(`  LATER Bucket: ${priorities.LATER.epics.length} epics, ${priorities.LATER.stories} stories`);
        }

        if ((roadmap as any).critical_path_duration) {
            this.log(`\n  Critical Path Duration: ${(roadmap as any).critical_path_duration}`);
        }
    }

    private async waitForUser(): Promise<void> {
        return new Promise((resolve) => {
            process.stdin.once('data', () => resolve());
        });
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
