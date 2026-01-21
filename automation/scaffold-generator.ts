/**
 * Scaffold Generator - Deterministic code extraction from YAML specs
 *
 * Reads context/{story_id}/*.yaml and generates files:
 * - database.yaml.migration_sql → supabase/migrations/
 * - api.yaml.patterns → app/api/ and lib/services/
 * - frontend.yaml.types[].content → lib/types/
 * - frontend.yaml.components[].pattern → components/
 *
 * This script uses ZERO LLM tokens - it's purely deterministic extraction.
 *
 * Environment variables (set by runner.ts):
 * - STORY_ID: Story identifier
 * - CONTEXT_DIR: Path to context/{story_id}/
 * - PROJECT_ROOT: Root directory for output files
 */

import { readFileSync, writeFileSync, existsSync, mkdirSync, readdirSync } from 'fs';
import { parse as parseYaml, stringify as stringifyYaml } from 'yaml';
import { resolve, dirname, basename } from 'path';

// ============== TYPES ==============

interface ScaffoldManifest {
    storyId: string;
    timestamp: string;
    files: Array<{
        path: string;
        source: string;
        lines: number;
    }>;
    stats: {
        totalFiles: number;
        totalLines: number;
    };
}

interface DatabaseSpec {
    tables?: Array<{
        name: string;
        columns: Array<{ name: string; type: string; constraints?: string }>;
        rls?: boolean;
        rls_pattern?: string;
        indexes?: string[];
    }>;
    migration_sql?: string;
}

interface ApiSpec {
    endpoints?: Array<{
        path: string;
        method: string;
        file?: string;
        handler?: string;
        auth?: boolean;
    }>;
    services?: Array<{
        name: string;
        path?: string;
        file?: string;
        methods?: Array<{ name: string; signature?: string }>;
    }>;
    validation?: {
        path?: string;
        schemas?: Array<{
            name: string;
            fields?: Record<string, any>;
        }>;
    };
    patterns?: Array<{
        file: string;
        content: string;
    }> | Record<string, string>;
}

interface FrontendSpec {
    types?: Array<{
        name?: string;
        path?: string;
        file?: string;
        content: string;
    }>;
    components?: Array<{
        name: string;
        path?: string;
        file?: string;
        status?: 'new' | 'update';
        props?: string;
        pattern?: string;
    }>;
    hooks?: Array<{
        name?: string;
        path?: string;
        file?: string;
        exports?: Array<{ name: string; returns?: string }>;
        pattern?: string;
        content?: string;
    }>;
}

interface TestsSpec {
    acceptance_criteria?: Array<{
        id: string;
        name?: string;
        title?: string;
        given?: string;
        when?: string;
        then?: string | string[];
        test_type?: string;
        priority?: string;
    }>;
    unit_tests?: any;
    integration_tests?: any;
    coverage?: { unit?: number; integration?: number };
}

interface IndexSpec {
    story_id: string;
    version?: number;
    type?: 'backend' | 'frontend' | 'fullstack';
    requirements?: {
        database?: boolean;
        api?: boolean;
        frontend?: boolean;
    };
    dependencies?: {
        npm?: string[];
        supabase?: string[];
    };
    acceptance_criteria_mapping?: Record<string, string[]>;
}

// ============== ENVIRONMENT ==============

const STORY_ID = process.env.STORY_ID;
const CONTEXT_DIR = process.env.CONTEXT_DIR;
const PROJECT_ROOT = process.env.PROJECT_ROOT || process.cwd();

if (!STORY_ID || !CONTEXT_DIR) {
    console.error('[SCAFFOLD] ERROR: Missing required environment variables');
    console.error('  STORY_ID:', STORY_ID);
    console.error('  CONTEXT_DIR:', CONTEXT_DIR);
    process.exit(1);
}

// ============== MANIFEST ==============

const manifest: ScaffoldManifest = {
    storyId: STORY_ID,
    timestamp: new Date().toISOString(),
    files: [],
    stats: { totalFiles: 0, totalLines: 0 }
};

// ============== HELPERS ==============

function loadSpec<T>(filename: string): T | null {
    const path = resolve(CONTEXT_DIR!, filename);
    if (!existsSync(path)) {
        console.log(`[SCAFFOLD] Skipping ${filename} - not found`);
        return null;
    }
    try {
        const content = readFileSync(path, 'utf-8');
        return parseYaml(content) as T;
    } catch (err: any) {
        console.error(`[SCAFFOLD] Error parsing ${filename}: ${err.message}`);
        return null;
    }
}

function ensureDir(filePath: string) {
    const dir = dirname(filePath);
    if (!existsSync(dir)) {
        mkdirSync(dir, { recursive: true });
    }
}

function writeOutput(relativePath: string, content: string, source: string) {
    const fullPath = resolve(PROJECT_ROOT, relativePath);
    ensureDir(fullPath);

    // Don't overwrite existing files unless they're in context/
    if (existsSync(fullPath) && !relativePath.startsWith('context/')) {
        console.log(`[SCAFFOLD] Skipping (exists): ${relativePath}`);
        return;
    }

    writeFileSync(fullPath, content);
    const lines = content.split('\n').length;

    manifest.files.push({ path: relativePath, source, lines });
    manifest.stats.totalFiles++;
    manifest.stats.totalLines += lines;

    console.log(`[SCAFFOLD] Generated: ${relativePath} (${lines} lines)`);
}

function generateHeader(storyId: string, source: string): string {
    return `/**
 * AUTO-GENERATED by scaffold-generator
 * Story: ${storyId}
 * Source: ${source}
 * Generated: ${new Date().toISOString()}
 *
 * This file was extracted from YAML specs.
 * Modify with caution - changes may be overwritten.
 */

`;
}

function generateTimestamp(): string {
    return new Date()
        .toISOString()
        .replace(/[-:T]/g, '')
        .slice(0, 14);
}

// ============== GENERATORS ==============

function generateFromDatabase(spec: DatabaseSpec): number {
    let generated = 0;

    // Generate migration from migration_sql
    if (spec.migration_sql) {
        const timestamp = generateTimestamp();
        const fileName = `${timestamp}_${STORY_ID!.replace(/\./g, '_')}.sql`;
        const relativePath = `supabase/migrations/${fileName}`;

        const content = `-- Migration: ${STORY_ID}
-- Generated: ${new Date().toISOString()}
-- Source: context/${STORY_ID}/database.yaml

${spec.migration_sql}
`;
        writeOutput(relativePath, content, 'database.yaml:migration_sql');
        generated++;
    }

    // If no migration_sql but tables defined, generate basic migration
    if (!spec.migration_sql && spec.tables && spec.tables.length > 0) {
        const timestamp = generateTimestamp();
        const fileName = `${timestamp}_${STORY_ID!.replace(/\./g, '_')}.sql`;
        const relativePath = `supabase/migrations/${fileName}`;

        let sql = `-- Migration: ${STORY_ID}\n-- Auto-generated from table definitions\n\n`;

        for (const table of spec.tables) {
            sql += `-- Table: ${table.name}\n`;
            sql += `CREATE TABLE IF NOT EXISTS ${table.name} (\n`;
            sql += table.columns
                .map(col => `    ${col.name} ${col.type}${col.constraints ? ' ' + col.constraints : ''}`)
                .join(',\n');
            sql += '\n);\n\n';

            if (table.rls) {
                sql += `ALTER TABLE ${table.name} ENABLE ROW LEVEL SECURITY;\n`;
                if (table.rls_pattern) {
                    sql += `\n${table.rls_pattern}\n`;
                }
                sql += '\n';
            }

            if (table.indexes) {
                for (const idx of table.indexes) {
                    sql += `CREATE INDEX IF NOT EXISTS ${idx};\n`;
                }
                sql += '\n';
            }
        }

        writeOutput(relativePath, sql, 'database.yaml:tables');
        generated++;
    }

    return generated;
}

function generateFromApi(spec: ApiSpec): number {
    let generated = 0;

    // Handle patterns as array
    if (Array.isArray(spec.patterns)) {
        for (const pattern of spec.patterns) {
            if (pattern.file && pattern.content) {
                const content = generateHeader(STORY_ID!, `api.yaml:patterns`) + pattern.content;
                writeOutput(pattern.file, content, 'api.yaml:patterns');
                generated++;
            }
        }
    }

    // Handle patterns as object (legacy format from blueprint)
    if (spec.patterns && !Array.isArray(spec.patterns)) {
        const patternsObj = spec.patterns as Record<string, string>;

        // api_route pattern
        if (patternsObj.api_route && spec.endpoints) {
            for (const endpoint of spec.endpoints) {
                if (endpoint.file) {
                    const content = generateHeader(STORY_ID!, 'api.yaml:patterns.api_route') + patternsObj.api_route;
                    writeOutput(endpoint.file, content, 'api.yaml:patterns.api_route');
                    generated++;
                }
            }
        }

        // service_pattern
        if (patternsObj.service_pattern && spec.services) {
            for (const service of spec.services) {
                const servicePath = service.path || service.file;
                if (servicePath) {
                    const content = generateHeader(STORY_ID!, 'api.yaml:patterns.service_pattern') + patternsObj.service_pattern;
                    writeOutput(servicePath, content, 'api.yaml:patterns.service_pattern');
                    generated++;
                }
            }
        }
    }

    // Generate validation schemas
    if (spec.validation?.path && spec.validation?.schemas) {
        const schemaContent = spec.validation.schemas
            .map(s => `export const ${s.name}Schema = z.object(${JSON.stringify(s.fields || {}, null, 2)});`)
            .join('\n\n');

        const content = generateHeader(STORY_ID!, 'api.yaml:validation') +
            `import { z } from 'zod';\n\n` + schemaContent;
        writeOutput(spec.validation.path, content, 'api.yaml:validation');
        generated++;
    }

    return generated;
}

function generateFromFrontend(spec: FrontendSpec): number {
    let generated = 0;

    // Generate type files
    if (spec.types) {
        for (const type of spec.types) {
            const typePath = type.path || type.file;
            if (typePath && type.content) {
                const content = generateHeader(STORY_ID!, 'frontend.yaml:types') + type.content;
                writeOutput(typePath, content, 'frontend.yaml:types');
                generated++;
            }
        }
    }

    // Generate component files (only those marked as 'new' or with pattern)
    if (spec.components) {
        for (const component of spec.components) {
            const componentPath = component.path || component.file;
            if (componentPath && component.pattern) {
                // Only generate if status is 'new' or not specified
                if (!component.status || component.status === 'new') {
                    const content = generateHeader(STORY_ID!, 'frontend.yaml:components') + component.pattern;
                    writeOutput(componentPath, content, 'frontend.yaml:components');
                    generated++;
                }
            }
        }
    }

    // Generate hook files
    if (spec.hooks) {
        for (const hook of spec.hooks) {
            const hookPath = hook.path || hook.file;
            const hookContent = hook.pattern || hook.content;
            if (hookPath && hookContent) {
                const content = generateHeader(STORY_ID!, 'frontend.yaml:hooks') + hookContent;
                writeOutput(hookPath, content, 'frontend.yaml:hooks');
                generated++;
            }
        }
    }

    return generated;
}

function saveManifest() {
    const manifestPath = resolve(CONTEXT_DIR!, 'scaffold-manifest.json');
    writeFileSync(manifestPath, JSON.stringify(manifest, null, 2));
    console.log(`[SCAFFOLD] Manifest saved: context/${STORY_ID}/scaffold-manifest.json`);
}

// ============== MAIN ==============

async function main() {
    console.log(`[SCAFFOLD] ════════════════════════════════════════════`);
    console.log(`[SCAFFOLD] Story: ${STORY_ID}`);
    console.log(`[SCAFFOLD] Context: ${CONTEXT_DIR}`);
    console.log(`[SCAFFOLD] Output: ${PROJECT_ROOT}`);
    console.log(`[SCAFFOLD] ════════════════════════════════════════════`);

    // Check context directory exists
    if (!existsSync(CONTEXT_DIR!)) {
        console.error(`[SCAFFOLD] Context directory not found: ${CONTEXT_DIR}`);
        console.log(`[SCAFFOLD] Hint: Run P0 (YAML spec generation) first`);
        process.exit(1);
    }

    // List available spec files
    const specFiles = readdirSync(CONTEXT_DIR!).filter(f => f.endsWith('.yaml'));
    console.log(`[SCAFFOLD] Found spec files: ${specFiles.join(', ') || 'none'}`);

    if (specFiles.length === 0) {
        console.log(`[SCAFFOLD] No YAML specs found - nothing to generate`);
        process.exit(0);
    }

    let totalGenerated = 0;

    // Load and process _index.yaml for metadata
    const indexSpec = loadSpec<IndexSpec>('_index.yaml');
    if (indexSpec) {
        console.log(`[SCAFFOLD] Story type: ${indexSpec.type || 'unknown'}`);
        console.log(`[SCAFFOLD] Requirements: database=${indexSpec.requirements?.database}, api=${indexSpec.requirements?.api}, frontend=${indexSpec.requirements?.frontend}`);
    }

    // Process database.yaml
    const dbSpec = loadSpec<DatabaseSpec>('database.yaml');
    if (dbSpec) {
        const count = generateFromDatabase(dbSpec);
        totalGenerated += count;
        console.log(`[SCAFFOLD] Database: ${count} files generated`);
    }

    // Process api.yaml
    const apiSpec = loadSpec<ApiSpec>('api.yaml');
    if (apiSpec) {
        const count = generateFromApi(apiSpec);
        totalGenerated += count;
        console.log(`[SCAFFOLD] API: ${count} files generated`);
    }

    // Process frontend.yaml
    const frontendSpec = loadSpec<FrontendSpec>('frontend.yaml');
    if (frontendSpec) {
        const count = generateFromFrontend(frontendSpec);
        totalGenerated += count;
        console.log(`[SCAFFOLD] Frontend: ${count} files generated`);
    }

    // Save manifest
    saveManifest();

    // Summary
    console.log(`[SCAFFOLD] ════════════════════════════════════════════`);
    console.log(`[SCAFFOLD] COMPLETE`);
    console.log(`[SCAFFOLD] Total files: ${manifest.stats.totalFiles}`);
    console.log(`[SCAFFOLD] Total lines: ${manifest.stats.totalLines}`);
    console.log(`[SCAFFOLD] LLM tokens used: 0 (deterministic)`);
    console.log(`[SCAFFOLD] ════════════════════════════════════════════`);
}

main().catch(err => {
    console.error('[SCAFFOLD] Fatal error:', err.message);
    process.exit(1);
});
