import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';
import { ESLint } from 'eslint';
import { describe, expect, it } from 'vitest';

const packageRoot = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const repositoryRoot = path.resolve(packageRoot, '../..');

async function lint(code: string, relativeFilePath: string): Promise<string[]> {
  const eslint = new ESLint({
    cwd: repositoryRoot,
    overrideConfigFile: path.join(packageRoot, 'eslint.config.js'),
  });
  const [result] = await eslint.lintText(code, {
    filePath: path.join(repositoryRoot, relativeFilePath),
  });
  return (result?.messages ?? []).map((message) => message.ruleId ?? 'fatal');
}

describe('shared configuration', () => {
  it('tsconfig.base.json has strict and noUncheckedIndexedAccess', () => {
    const tsconfig = JSON.parse(
      readFileSync(path.join(packageRoot, 'tsconfig.base.json'), 'utf8'),
    ) as { compilerOptions: Record<string, unknown> };

    expect(tsconfig.compilerOptions.strict).toBe(true);
    expect(tsconfig.compilerOptions.noUncheckedIndexedAccess).toBe(true);
  });

  // The first lint loads ESLint and the typed rules, which takes longer than 5 s on a busy machine.
  it('eslint config forbids explicit any', { timeout: 30_000 }, async () => {
    const rules = await lint('export const value: any = 1;\n', 'packages/config/sample.ts');

    expect(rules).toContain('@typescript-eslint/no-explicit-any');
  });

  it('eslint forbids deep imports between modules', async () => {
    const deep = await lint(
      "import { isPwnedPassword } from '@/modules/identity/hibp';\nexport { isPwnedPassword };\n",
      'apps/web/src/modules/audit/record.ts',
    );
    const publicEntry = await lint(
      "import { isPwnedPassword } from '@/modules/identity';\nexport { isPwnedPassword };\n",
      'apps/web/src/modules/audit/record.ts',
    );

    expect(deep).toContain('no-restricted-imports');
    expect(publicEntry).not.toContain('no-restricted-imports');
  });

  it('eslint rejects importing withSystemContext from app directory', async () => {
    const fromApp = await lint(
      "import { withSystemContext } from '@/platform/db';\nexport { withSystemContext };\n",
      'apps/web/src/app/[locale]/page.ts',
    );
    const fromModule = await lint(
      "import { withSystemContext } from '@/platform/db';\nexport { withSystemContext };\n",
      'apps/web/src/modules/events/dispatch.ts',
    );

    expect(fromApp).toContain('no-restricted-imports');
    expect(fromModule).not.toContain('no-restricted-imports');
  });

  it('eslint forbids literal text in application components', async () => {
    const rules = await lint(
      'export function Greeting() {\n  return <p>Hello</p>;\n}\n',
      'apps/web/src/components/greeting.tsx',
    );

    expect(rules).toContain('react/jsx-no-literals');
  });
});
