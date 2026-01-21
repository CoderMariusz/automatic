/**
 * YAML Spec Validator
 *
 * Validates structure of context/{story_id}/*.yaml files before scaffold generation.
 * Ensures required fields are present and patterns are properly formatted.
 *
 * Environment variables (set by runner.ts):
 * - STORY_ID: Story identifier
 * - CONTEXT_DIR: Path to context/{story_id}/
 */

import { readFileSync, existsSync, readdirSync } from 'fs';
import { parse as parseYaml } from 'yaml';
import { resolve } from 'path';

// ============== ENVIRONMENT ==============

const STORY_ID = process.env.STORY_ID;
const CONTEXT_DIR = process.env.CONTEXT_DIR;

if (!STORY_ID || !CONTEXT_DIR) {
    console.error('[VALIDATE] ERROR: Missing required environment variables');
    console.error('  STORY_ID:', STORY_ID);
    console.error('  CONTEXT_DIR:', CONTEXT_DIR);
    process.exit(1);
}

// ============== TYPES ==============

interface ValidationError {
    file: string;
    path: string;
    severity: 'error' | 'warning';
    message: string;
}

interface ValidationResult {
    valid: boolean;
    errors: ValidationError[];
    warnings: ValidationError[];
    filesChecked: string[];
}

// ============== VALIDATION STATE ==============

const result: ValidationResult = {
    valid: true,
    errors: [],
    warnings: [],
    filesChecked: []
};

function addError(file: string, path: string, message: string) {
    result.errors.push({ file, path, severity: 'error', message });
    result.valid = false;
    console.error(`[VALIDATE] ✗ ${file}: ${path} - ${message}`);
}

function addWarning(file: string, path: string, message: string) {
    result.warnings.push({ file, path, severity: 'warning', message });
    console.warn(`[VALIDATE] ⚠ ${file}: ${path} - ${message}`);
}

// ============== VALIDATORS ==============

function validateIndex(data: any) {
    if (!data) {
        addError('_index.yaml', 'root', 'File is empty or invalid');
        return;
    }

    // Required fields
    if (!data.story_id) {
        addError('_index.yaml', 'story_id', 'Required field missing');
    } else if (data.story_id !== STORY_ID) {
        addWarning('_index.yaml', 'story_id', `Mismatch: expected "${STORY_ID}", got "${data.story_id}"`);
    }

    // Optional but recommended
    if (!data.type) {
        addWarning('_index.yaml', 'type', 'Type not specified (backend|frontend|fullstack)');
    }

    if (!data.requirements) {
        addWarning('_index.yaml', 'requirements', 'Requirements section not specified');
    }

    // Validate acceptance_criteria_mapping if present
    if (data.acceptance_criteria_mapping) {
        const mapping = data.acceptance_criteria_mapping;
        for (const [acId, paths] of Object.entries(mapping)) {
            if (!Array.isArray(paths)) {
                addError('_index.yaml', `acceptance_criteria_mapping.${acId}`, 'Must be an array of paths');
            }
        }
    }
}

function validateDatabase(data: any) {
    if (!data) {
        addError('database.yaml', 'root', 'File is empty or invalid');
        return;
    }

    // Must have either tables or migration_sql
    if (!data.tables && !data.migration_sql) {
        addError('database.yaml', 'root', 'Must have either "tables" or "migration_sql"');
        return;
    }

    // Validate tables
    if (data.tables) {
        if (!Array.isArray(data.tables)) {
            addError('database.yaml', 'tables', 'Must be an array');
            return;
        }

        data.tables.forEach((table: any, i: number) => {
            if (!table.name) {
                addError('database.yaml', `tables[${i}].name`, 'Required field missing');
            }
            if (!table.columns || !Array.isArray(table.columns)) {
                addError('database.yaml', `tables[${i}].columns`, 'Required array missing');
            } else {
                table.columns.forEach((col: any, j: number) => {
                    if (!col.name) {
                        addError('database.yaml', `tables[${i}].columns[${j}].name`, 'Required');
                    }
                    if (!col.type) {
                        addError('database.yaml', `tables[${i}].columns[${j}].type`, 'Required');
                    }
                });
            }
        });
    }

    // Validate migration_sql is a string
    if (data.migration_sql && typeof data.migration_sql !== 'string') {
        addError('database.yaml', 'migration_sql', 'Must be a string (use | for multiline)');
    }
}

function validateApi(data: any) {
    if (!data) {
        addError('api.yaml', 'root', 'File is empty or invalid');
        return;
    }

    // Validate endpoints
    if (data.endpoints) {
        if (!Array.isArray(data.endpoints)) {
            addError('api.yaml', 'endpoints', 'Must be an array');
        } else {
            data.endpoints.forEach((ep: any, i: number) => {
                if (!ep.path) {
                    addError('api.yaml', `endpoints[${i}].path`, 'Required');
                }
                if (!ep.method) {
                    addError('api.yaml', `endpoints[${i}].method`, 'Required');
                }
            });
        }
    }

    // Validate patterns - this is the critical section for scaffold generation
    if (data.patterns) {
        if (Array.isArray(data.patterns)) {
            data.patterns.forEach((p: any, i: number) => {
                if (!p.file) {
                    addError('api.yaml', `patterns[${i}].file`, 'Required for scaffold generation');
                }
                if (!p.content) {
                    addError('api.yaml', `patterns[${i}].content`, 'Required - must contain actual code');
                } else if (typeof p.content !== 'string') {
                    addError('api.yaml', `patterns[${i}].content`, 'Must be a string (use | for multiline code)');
                } else if (p.content.length < 50) {
                    addWarning('api.yaml', `patterns[${i}].content`, 'Content seems too short - ensure it contains full implementation');
                }
            });
        } else if (typeof data.patterns === 'object') {
            // Legacy object format
            for (const [key, value] of Object.entries(data.patterns)) {
                if (typeof value !== 'string') {
                    addError('api.yaml', `patterns.${key}`, 'Must be a string containing code');
                }
            }
        }
    }

    // Validate services
    if (data.services) {
        if (!Array.isArray(data.services)) {
            addError('api.yaml', 'services', 'Must be an array');
        } else {
            data.services.forEach((s: any, i: number) => {
                if (!s.name && !s.path && !s.file) {
                    addWarning('api.yaml', `services[${i}]`, 'Should have name, path, or file');
                }
            });
        }
    }
}

function validateFrontend(data: any) {
    if (!data) {
        addError('frontend.yaml', 'root', 'File is empty or invalid');
        return;
    }

    // Validate types - critical for scaffold
    if (data.types) {
        if (!Array.isArray(data.types)) {
            addError('frontend.yaml', 'types', 'Must be an array');
        } else {
            data.types.forEach((t: any, i: number) => {
                const typePath = t.path || t.file;
                if (!typePath) {
                    addError('frontend.yaml', `types[${i}].path`, 'Required for scaffold generation');
                }
                if (!t.content) {
                    addError('frontend.yaml', `types[${i}].content`, 'Required - must contain TypeScript interface/type definition');
                } else if (typeof t.content !== 'string') {
                    addError('frontend.yaml', `types[${i}].content`, 'Must be a string (use | for multiline)');
                } else if (!t.content.includes('export') && !t.content.includes('interface') && !t.content.includes('type ')) {
                    addWarning('frontend.yaml', `types[${i}].content`, 'Should contain export/interface/type declarations');
                }
            });
        }
    }

    // Validate components
    if (data.components) {
        if (!Array.isArray(data.components)) {
            addError('frontend.yaml', 'components', 'Must be an array');
        } else {
            data.components.forEach((c: any, i: number) => {
                if (!c.name) {
                    addError('frontend.yaml', `components[${i}].name`, 'Required');
                }
                const componentPath = c.path || c.file;
                if (!componentPath) {
                    addError('frontend.yaml', `components[${i}].path`, 'Required');
                }

                // If status is 'new', must have pattern
                if (c.status === 'new' && !c.pattern) {
                    addError('frontend.yaml', `components[${i}].pattern`, 'Required for new components');
                }

                // Validate pattern content if present
                if (c.pattern) {
                    if (typeof c.pattern !== 'string') {
                        addError('frontend.yaml', `components[${i}].pattern`, 'Must be a string (use | for multiline)');
                    } else if (c.pattern.length < 50) {
                        addWarning('frontend.yaml', `components[${i}].pattern`, 'Pattern seems too short');
                    }
                }
            });
        }
    }

    // Validate hooks
    if (data.hooks) {
        if (!Array.isArray(data.hooks)) {
            addError('frontend.yaml', 'hooks', 'Must be an array');
        } else {
            data.hooks.forEach((h: any, i: number) => {
                const hookPath = h.path || h.file;
                if (!hookPath) {
                    addWarning('frontend.yaml', `hooks[${i}].path`, 'Path recommended for scaffold generation');
                }
            });
        }
    }
}

function validateTests(data: any) {
    if (!data) {
        addWarning('tests.yaml', 'root', 'File is empty or invalid');
        return;
    }

    // Validate acceptance_criteria
    if (data.acceptance_criteria) {
        if (!Array.isArray(data.acceptance_criteria)) {
            addError('tests.yaml', 'acceptance_criteria', 'Must be an array');
        } else {
            data.acceptance_criteria.forEach((ac: any, i: number) => {
                if (!ac.id) {
                    addError('tests.yaml', `acceptance_criteria[${i}].id`, 'Required');
                }
                if (!ac.name && !ac.title) {
                    addWarning('tests.yaml', `acceptance_criteria[${i}]`, 'Should have name or title');
                }
            });
        }
    } else {
        addWarning('tests.yaml', 'acceptance_criteria', 'No acceptance criteria defined');
    }
}

// ============== MAIN ==============

async function main() {
    console.log(`[VALIDATE] ════════════════════════════════════════════`);
    console.log(`[VALIDATE] Story: ${STORY_ID}`);
    console.log(`[VALIDATE] Context: ${CONTEXT_DIR}`);
    console.log(`[VALIDATE] ════════════════════════════════════════════`);

    // Check context directory exists
    if (!existsSync(CONTEXT_DIR!)) {
        console.error(`[VALIDATE] Context directory not found: ${CONTEXT_DIR}`);
        console.log(`[VALIDATE] Hint: Run P0 (YAML spec generation) first`);
        process.exit(1);
    }

    // List available spec files
    const specFiles = readdirSync(CONTEXT_DIR!).filter(f => f.endsWith('.yaml'));
    console.log(`[VALIDATE] Found spec files: ${specFiles.join(', ') || 'none'}`);

    if (specFiles.length === 0) {
        console.error(`[VALIDATE] No YAML specs found in ${CONTEXT_DIR}`);
        process.exit(1);
    }

    // Validate each spec file
    for (const file of specFiles) {
        result.filesChecked.push(file);
        const path = resolve(CONTEXT_DIR!, file);

        try {
            const content = readFileSync(path, 'utf-8');
            const data = parseYaml(content);

            console.log(`[VALIDATE] Checking ${file}...`);

            switch (file) {
                case '_index.yaml':
                    validateIndex(data);
                    break;
                case 'database.yaml':
                    validateDatabase(data);
                    break;
                case 'api.yaml':
                    validateApi(data);
                    break;
                case 'frontend.yaml':
                    validateFrontend(data);
                    break;
                case 'tests.yaml':
                    validateTests(data);
                    break;
                default:
                    console.log(`[VALIDATE] Skipping unknown file: ${file}`);
            }
        } catch (err: any) {
            if (err.code === 'ENOENT') {
                // File doesn't exist - might be optional
                console.log(`[VALIDATE] File not found: ${file}`);
            } else {
                addError(file, 'parse', `YAML parse error: ${err.message}`);
            }
        }
    }

    // Summary
    console.log(`[VALIDATE] ════════════════════════════════════════════`);
    console.log(`[VALIDATE] Files checked: ${result.filesChecked.length}`);
    console.log(`[VALIDATE] Errors: ${result.errors.length}`);
    console.log(`[VALIDATE] Warnings: ${result.warnings.length}`);

    if (result.valid) {
        console.log(`[VALIDATE] ✓ All specs valid`);
        console.log(`[VALIDATE] ════════════════════════════════════════════`);
        process.exit(0);
    } else {
        console.error(`[VALIDATE] ✗ Validation failed with ${result.errors.length} error(s)`);
        console.log(`[VALIDATE] ════════════════════════════════════════════`);
        process.exit(1);
    }
}

main().catch(err => {
    console.error('[VALIDATE] Fatal error:', err.message);
    process.exit(1);
});
