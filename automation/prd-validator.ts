/**
 * PRD Validator - Validates PRD completeness and consistency
 *
 * Validates that prd.md covers all elements from discovery.yaml and brainstorm.yaml:
 * - Goals coverage (FAIL if missing)
 * - MVP Features coverage (FAIL if missing)
 * - Modules coverage (WARN if missing)
 * - User Flows coverage (WARN if missing)
 * - Technical Decisions (WARN if missing)
 * - Success Metrics (FAIL if missing)
 * - Required Sections (FAIL if missing)
 *
 * This script uses ZERO LLM tokens - pure deterministic validation.
 *
 * Environment variables (set by prd-runner):
 * - PROJECT_DIR: Path to project directory containing discovery.yaml, brainstorm.yaml, prd.md
 * - PROJECT_ID: Project identifier
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolve } from 'path';

// ============== TYPES ==============

type CheckStatus = 'PASS' | 'FAIL' | 'WARN';

interface CheckResult {
    category: string;
    item: string;
    status: CheckStatus;
    checkbox: string;
    details: string;
}

interface CategoryResults {
    [item: string]: {
        status: CheckStatus;
        details: string;
    };
}

interface ValidationReport {
    generated_at: string;
    summary: {
        total_checks: number;
        passed: number;
        failed: number;
        warnings: number;
        score: number;
    };
    status: 'VALID' | 'NEEDS_REVIEW';
    results_by_category: Record<string, CategoryResults>;
    checklist: CheckResult[];
}

interface DiscoveryYaml {
    goals?: {
        primary?: Array<{ goal: string; [key: string]: any }>;
        [key: string]: any;
    };
    scope?: {
        mvp_features?: string[];
        [key: string]: any;
    };
    success_metrics?: Array<{ metric: string; [key: string]: any }>;
    [key: string]: any;
}

interface BrainstormYaml {
    modules?: Array<{ name: string; [key: string]: any }>;
    user_flows?: Array<{ name: string; [key: string]: any }>;
    technical_decisions?: Array<{ decision: string; [key: string]: any }>;
    [key: string]: any;
}

// ============== ENVIRONMENT ==============

const PROJECT_DIR = process.env.PROJECT_DIR;
const PROJECT_ID = process.env.PROJECT_ID;

if (!PROJECT_DIR) {
    console.error('[PRD-VALIDATOR] ERROR: Missing required environment variable PROJECT_DIR');
    process.exit(1);
}

// ============== VALIDATION STATE ==============

const results: CheckResult[] = [];

function addResult(category: string, item: string, status: CheckStatus, details: string): void {
    const checkbox = status === 'PASS' ? '[x]' : '[ ]';
    results.push({ category, item, status, checkbox, details });
}

// ============== HELPERS ==============

function loadYamlFile<T>(filename: string): T | null {
    const path = resolve(PROJECT_DIR!, filename);
    if (!existsSync(path)) {
        console.error(`[PRD-VALIDATOR] ERROR: File not found: ${path}`);
        process.exit(1);
    }
    try {
        const content = readFileSync(path, 'utf-8');
        return parseYaml(content) as T;
    } catch (err: any) {
        console.error(`[PRD-VALIDATOR] ERROR: Failed to parse ${filename}: ${err.message}`);
        process.exit(1);
    }
}

function loadPrdFile(): string {
    const path = resolve(PROJECT_DIR!, 'prd.md');
    if (!existsSync(path)) {
        console.error(`[PRD-VALIDATOR] ERROR: File not found: ${path}`);
        process.exit(1);
    }
    try {
        return readFileSync(path, 'utf-8');
    } catch (err: any) {
        console.error(`[PRD-VALIDATOR] ERROR: Failed to read prd.md: ${err.message}`);
        process.exit(1);
    }
}

function searchInPrd(prdContent: string, searchTerm: string): boolean {
    const lowerPrd = prdContent.toLowerCase();
    const lowerSearch = searchTerm.toLowerCase();
    return lowerPrd.includes(lowerSearch);
}

function groupByCategory(checkResults: CheckResult[]): Record<string, CategoryResults> {
    const grouped: Record<string, CategoryResults> = {};

    for (const result of checkResults) {
        if (!grouped[result.category]) {
            grouped[result.category] = {};
        }
        grouped[result.category][result.item] = {
            status: result.status,
            details: result.details,
        };
    }

    return grouped;
}

// ============== VALIDATORS ==============

/**
 * AC-1: Check 1 - Goals coverage (FAIL if missing)
 * For each discovery.goals.primary[].goal:
 *   - Takes first 20 characters
 *   - Searches PRD (case-insensitive substring match)
 *   - Status: PASS if found, FAIL if not found
 */
function checkGoalsCoverage(discovery: DiscoveryYaml, prdContent: string): void {
    const primaryGoals = discovery.goals?.primary || [];

    if (primaryGoals.length === 0) {
        console.log('[PRD-VALIDATOR] No primary goals found in discovery.yaml');
        return;
    }

    for (const goalObj of primaryGoals) {
        const goal = goalObj.goal || '';
        const searchTerm = goal.substring(0, 20);
        const found = searchInPrd(prdContent, searchTerm);

        if (found) {
            addResult('Goals', goal, 'PASS', 'Found in PRD');
        } else {
            addResult('Goals', goal, 'FAIL', 'NOT FOUND in PRD - goal may be missing');
        }
    }
}

/**
 * AC-2: Check 2 - MVP Features coverage (FAIL if missing)
 * For each discovery.scope.mvp_features[]:
 *   - Takes first 15 characters
 *   - Searches PRD (case-insensitive)
 *   - Status: PASS if found, FAIL if not
 */
function checkMvpFeaturesCoverage(discovery: DiscoveryYaml, prdContent: string): void {
    const mvpFeatures = discovery.scope?.mvp_features || [];

    if (mvpFeatures.length === 0) {
        console.log('[PRD-VALIDATOR] No MVP features found in discovery.yaml');
        return;
    }

    for (const feature of mvpFeatures) {
        const searchTerm = feature.substring(0, 15);
        const found = searchInPrd(prdContent, searchTerm);

        if (found) {
            addResult('MVP Features', feature, 'PASS', 'Found in PRD');
        } else {
            addResult('MVP Features', feature, 'FAIL', 'NOT FOUND in PRD - feature may be missing');
        }
    }
}

/**
 * AC-3: Check 3 - Modules coverage (WARN if missing)
 * For each brainstorm.modules[].name:
 *   - Searches for 'Module: {name}' or case-insensitive match
 *   - Status: PASS if found, WARN if not
 */
function checkModulesCoverage(brainstorm: BrainstormYaml, prdContent: string): void {
    const modules = brainstorm.modules || [];

    if (modules.length === 0) {
        console.log('[PRD-VALIDATOR] No modules found in brainstorm.yaml');
        return;
    }

    for (const moduleObj of modules) {
        const moduleName = moduleObj.name || '';
        const modulePattern = `Module: ${moduleName}`;
        const foundExplicit = searchInPrd(prdContent, modulePattern);
        const foundName = searchInPrd(prdContent, moduleName);

        if (foundExplicit || foundName) {
            addResult('Modules', moduleName, 'PASS', 'Found in PRD');
        } else {
            addResult('Modules', moduleName, 'WARN', 'Module name not explicitly found');
        }
    }
}

/**
 * AC-4: Check 4 - User Flows coverage (WARN if missing)
 * For each brainstorm.user_flows[].name:
 *   - Searches for 'Flow: {name}' or match
 *   - Status: PASS if found, WARN if not
 */
function checkUserFlowsCoverage(brainstorm: BrainstormYaml, prdContent: string): void {
    const userFlows = brainstorm.user_flows || [];

    if (userFlows.length === 0) {
        console.log('[PRD-VALIDATOR] No user flows found in brainstorm.yaml');
        return;
    }

    for (const flowObj of userFlows) {
        const flowName = flowObj.name || '';
        const flowPattern = `Flow: ${flowName}`;
        const foundExplicit = searchInPrd(prdContent, flowPattern);
        const foundName = searchInPrd(prdContent, flowName);

        if (foundExplicit || foundName) {
            addResult('User Flows', flowName, 'PASS', 'Found in PRD');
        } else {
            addResult('User Flows', flowName, 'WARN', 'User flow not explicitly found');
        }
    }
}

/**
 * AC-5: Check 5 - Technical Decisions (WARN if missing)
 * For each brainstorm.technical_decisions[].decision:
 *   - Takes first 15 chars, searches in PRD
 *   - Status: PASS if found, WARN if not
 */
function checkTechnicalDecisions(brainstorm: BrainstormYaml, prdContent: string): void {
    const decisions = brainstorm.technical_decisions || [];

    if (decisions.length === 0) {
        console.log('[PRD-VALIDATOR] No technical decisions found in brainstorm.yaml');
        return;
    }

    for (const decisionObj of decisions) {
        const decision = decisionObj.decision || '';
        const searchTerm = decision.substring(0, 15);
        const found = searchInPrd(prdContent, searchTerm);

        if (found) {
            addResult('Technical Decisions', decision, 'PASS', 'Found in PRD');
        } else {
            addResult('Technical Decisions', decision, 'WARN', 'Technical decision not explicitly found');
        }
    }
}

/**
 * AC-6: Check 6 - Success Metrics (FAIL if missing)
 * For each discovery.success_metrics[].metric:
 *   - Takes first 10 chars, searches in PRD
 *   - Status: PASS if found, FAIL if not
 */
function checkSuccessMetrics(discovery: DiscoveryYaml, prdContent: string): void {
    const metrics = discovery.success_metrics || [];

    if (metrics.length === 0) {
        console.log('[PRD-VALIDATOR] No success metrics found in discovery.yaml');
        return;
    }

    for (const metricObj of metrics) {
        const metric = metricObj.metric || '';
        const searchTerm = metric.substring(0, 10);
        const found = searchInPrd(prdContent, searchTerm);

        if (found) {
            addResult('Success Metrics', metric, 'PASS', 'Found in PRD');
        } else {
            addResult('Success Metrics', metric, 'FAIL', 'NOT FOUND in PRD - metric may be missing');
        }
    }
}

/**
 * AC-7: Check 7 - Required Sections (FAIL if missing)
 * Required sections:
 *   - 'Executive Summary'
 *   - 'Problem Statement'
 *   - 'Goals'
 *   - 'Target Users'
 *   - 'Features'
 *   - 'Technical Architecture'
 *   - 'Risks'
 * For each, searches for '## {section}' (case-insensitive)
 * Status: PASS if found, FAIL if missing
 */
function checkRequiredSections(prdContent: string): void {
    const requiredSections = [
        'Executive Summary',
        'Problem Statement',
        'Goals',
        'Target Users',
        'Features',
        'Technical Architecture',
        'Risks',
    ];

    for (const section of requiredSections) {
        const sectionPattern = `## ${section}`;
        const found = searchInPrd(prdContent, sectionPattern);

        if (found) {
            addResult('Required Sections', section, 'PASS', 'Found in PRD');
        } else {
            addResult('Required Sections', section, 'FAIL', 'Section header not found in PRD');
        }
    }
}

// ============== REPORT GENERATION ==============

/**
 * AC-8: Generate validation-report.yaml with structure:
 *   generated_at: {ISO timestamp}
 *   summary:
 *     total_checks: {count}
 *     passed: {count}
 *     failed: {count}
 *     warnings: {count}
 *     score: {(passed/total)*100}
 *   status: 'VALID' if failed===0, else 'NEEDS_REVIEW'
 *   results_by_category: {grouped results}
 *   checklist[] - category, item, status, checkbox, details
 */
function generateReport(): ValidationReport {
    const totalChecks = results.length;
    const passed = results.filter(r => r.status === 'PASS').length;
    const failed = results.filter(r => r.status === 'FAIL').length;
    const warnings = results.filter(r => r.status === 'WARN').length;
    const score = totalChecks > 0 ? Math.round((passed / totalChecks) * 100) : 0;

    const report: ValidationReport = {
        generated_at: new Date().toISOString(),
        summary: {
            total_checks: totalChecks,
            passed,
            failed,
            warnings,
            score,
        },
        status: failed === 0 ? 'VALID' : 'NEEDS_REVIEW',
        results_by_category: groupByCategory(results),
        checklist: results,
    };

    return report;
}

function saveReport(report: ValidationReport): void {
    const reportPath = resolve(PROJECT_DIR!, 'validation-report.yaml');
    const yamlContent = stringifyYaml(report, { lineWidth: 0 });
    writeFileSync(reportPath, yamlContent);
    console.log(`[PRD-VALIDATOR] Report saved: ${reportPath}`);
}

// ============== MAIN ==============

async function main(): Promise<void> {
    console.log(`[PRD-VALIDATOR] ════════════════════════════════════════════`);
    console.log(`[PRD-VALIDATOR] Project: ${PROJECT_ID || 'unknown'}`);
    console.log(`[PRD-VALIDATOR] Directory: ${PROJECT_DIR}`);
    console.log(`[PRD-VALIDATOR] ════════════════════════════════════════════`);

    // Load files (AC-9)
    console.log('[PRD-VALIDATOR] Loading files...');
    const discovery = loadYamlFile<DiscoveryYaml>('discovery.yaml');
    const brainstorm = loadYamlFile<BrainstormYaml>('brainstorm.yaml');
    const prdContent = loadPrdFile();

    if (!discovery || !brainstorm) {
        console.error('[PRD-VALIDATOR] ERROR: Failed to load required YAML files');
        process.exit(1);
    }

    console.log('[PRD-VALIDATOR] Files loaded successfully');
    console.log(`[PRD-VALIDATOR] PRD size: ${prdContent.length} characters`);

    // Run all checks
    console.log('[PRD-VALIDATOR] Running validation checks...');

    // AC-1: Goals coverage
    console.log('[PRD-VALIDATOR] Check 1: Goals coverage');
    checkGoalsCoverage(discovery, prdContent);

    // AC-2: MVP Features coverage
    console.log('[PRD-VALIDATOR] Check 2: MVP Features coverage');
    checkMvpFeaturesCoverage(discovery, prdContent);

    // AC-3: Modules coverage
    console.log('[PRD-VALIDATOR] Check 3: Modules coverage');
    checkModulesCoverage(brainstorm, prdContent);

    // AC-4: User Flows coverage
    console.log('[PRD-VALIDATOR] Check 4: User Flows coverage');
    checkUserFlowsCoverage(brainstorm, prdContent);

    // AC-5: Technical Decisions
    console.log('[PRD-VALIDATOR] Check 5: Technical Decisions');
    checkTechnicalDecisions(brainstorm, prdContent);

    // AC-6: Success Metrics
    console.log('[PRD-VALIDATOR] Check 6: Success Metrics');
    checkSuccessMetrics(discovery, prdContent);

    // AC-7: Required Sections
    console.log('[PRD-VALIDATOR] Check 7: Required Sections');
    checkRequiredSections(prdContent);

    // Generate and save report (AC-8)
    console.log('[PRD-VALIDATOR] Generating report...');
    const report = generateReport();
    saveReport(report);

    // Summary
    console.log(`[PRD-VALIDATOR] ════════════════════════════════════════════`);
    console.log(`[PRD-VALIDATOR] VALIDATION COMPLETE`);
    console.log(`[PRD-VALIDATOR] Total checks: ${report.summary.total_checks}`);
    console.log(`[PRD-VALIDATOR] Passed: ${report.summary.passed}`);
    console.log(`[PRD-VALIDATOR] Failed: ${report.summary.failed}`);
    console.log(`[PRD-VALIDATOR] Warnings: ${report.summary.warnings}`);
    console.log(`[PRD-VALIDATOR] Score: ${report.summary.score}%`);
    console.log(`[PRD-VALIDATOR] Status: ${report.status}`);
    console.log(`[PRD-VALIDATOR] LLM tokens used: 0 (pure script)`);
    console.log(`[PRD-VALIDATOR] ════════════════════════════════════════════`);

    // AC-10: Always exit with code 0 (validation failures are in report)
    process.exit(0);
}

main().catch((err: Error) => {
    // AC-10: Script errors exit with code 1
    console.error('[PRD-VALIDATOR] Fatal error:', err.message);
    process.exit(1);
});
