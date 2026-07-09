import fs from 'fs';
import path from 'path';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import crypto from 'crypto';

const BASE_SANDBOX_DIR = path.join(__dirname, 'test_sandbox', 'ms');

export function applyPatchAndTest(newContent, backupFirst = true) {
  const runId = crypto.randomBytes(8).toString('hex');
  const SANDBOX_DIR = path.join(__dirname, 'test_sandbox', `ms_${runId}`);
  const TARGET_FILE = path.join(SANDBOX_DIR, 'src', 'index.ts');

  if (!fs.existsSync(BASE_SANDBOX_DIR)) {
    return { success: false, output: 'Target base source directory does not exist in sandbox.' };
  }

  try {
    fs.cpSync(BASE_SANDBOX_DIR, SANDBOX_DIR, { 
      recursive: true,
      filter: (src) => !src.includes('node_modules')
    });
    // Symlink node_modules to avoid massive copy time
    fs.symlinkSync(path.join(BASE_SANDBOX_DIR, 'node_modules'), path.join(SANDBOX_DIR, 'node_modules'), 'junction');

    // 1. Write the new code content
    fs.writeFileSync(TARGET_FILE, newContent, 'utf8');
    console.log('[Patch Runner] Successfully wrote proposed patch to src/index.ts.');

    // 2. Run TypeScript typecheck to verify types
    console.log('[Patch Runner] Running Type Check...');
    try {
      execSync('node node_modules/typescript/bin/tsc --noEmit', { cwd: SANDBOX_DIR, stdio: 'pipe' });
    } catch (tscError) {
      const typeErrorLog = tscError.stdout?.toString() || tscError.stderr?.toString() || tscError.message;
      console.warn('[Patch Runner] Type check failed!');
      fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
      return { success: false, output: `TypeScript Typecheck Failed:\n${typeErrorLog}` };
    }

    // 3. Run Jest unit test suite
    console.log('[Patch Runner] Running Jest Tests...');
    try {
      const testOutput = execSync('node node_modules/jest/bin/jest.js --config jest.config.cjs --env node --no-cache 2>&1', { cwd: SANDBOX_DIR, stdio: 'pipe', timeout: 15000 });
      console.log('[Patch Runner] Tests passed successfully!');
      fs.rmSync(SANDBOX_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      return { success: true, output: testOutput.toString() };
    } catch (testError) {
      const testErrorLog = testError.stdout?.toString() || testError.stderr?.toString() || testError.message;
      console.warn('[Patch Runner] Jest tests failed!');
      fs.rmSync(SANDBOX_DIR, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 });
      return { success: false, output: `Jest Test Suite Failed:\n${testErrorLog}` };
    }

  } catch (err) {
    if (fs.existsSync(SANDBOX_DIR)) {
      fs.rmSync(SANDBOX_DIR, { recursive: true, force: true });
    }
    return { success: false, output: `Execution error: ${err.message}` };
  }
}

// Support running via command line directly
if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const patchFile = process.argv[2];
  if (!patchFile || !fs.existsSync(patchFile)) {
    console.error('Usage: node patch_runner.js <path_to_patch_file>');
    process.exit(1);
  }

  const newContent = fs.readFileSync(patchFile, 'utf8');
  const result = applyPatchAndTest(newContent, true);
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.success ? 0 : 1);
}
