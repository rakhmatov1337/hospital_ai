#!/usr/bin/env node
/**
 * Lint rule: NO patient-visible string literals in patient-facing code.
 *
 * Dev Build Board (Infra, P1): "Lint rule: no string literals in patient
 * components". Golden rule #2: every patient-visible string resolves from the
 * content library by ID — a literal in a patient response is a string nobody
 * signed off on, which is exactly what the content library exists to prevent.
 *
 * Scope: the patient-facing surface only (`aud:"patient"` modules). The staff
 * dashboard is deliberately out of scope — staff copy is lower-risk and uses
 * ordinary i18n files, per the ADR.
 *
 * What is allowed (and why):
 *   - content keys (`today.title`, `clinical.x.day_1`) — that IS the library
 *   - enum/code values (`snake_case`, `UPPER_SNAKE`), route paths, header names
 *   - Swagger/@Api* decorator text — developer documentation, never rendered
 *   - AppError messages — the spec states the patient client renders `code`,
 *     never the raw `message`
 *   - logger / console output — server-side only
 *
 * What fails: prose-like literals (3+ words) anywhere else in these files —
 * i.e. text that looks like something a human would read on a screen.
 */
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { fileURLToPath } from 'node:url';
import ts from 'typescript';

const API_ROOT = fileURLToPath(new URL('..', import.meta.url));

/** Patient-facing modules: everything a patient token can reach. */
const PATIENT_DIRS = ['src/me', 'src/checkins', 'src/tasks'];

/** Decorators whose string arguments are docs/routing, never rendered. */
const DOC_DECORATORS = new Set([
  'ApiOperation', 'ApiTags', 'ApiProperty', 'ApiHeader', 'ApiResponse', 'ApiBearerAuth',
  'ApiQuery', 'ApiParam', 'ApiBody', 'ApiOkResponse', 'ApiCreatedResponse',
  'Controller', 'Get', 'Post', 'Patch', 'Put', 'Delete', 'Headers', 'Param', 'Query', 'Audience',
]);

/** Calls whose string arguments are server-side only. */
const SAFE_CALLS = new Set([
  'AppError', 'Error', 'BadRequestException', 'NotFoundException', 'ForbiddenException',
  'UnauthorizedException', 'log', 'warn', 'error', 'debug', 'verbose', 'emit',
]);

const listFiles = (dir) => {
  const out = [];
  const walk = (d) => {
    for (const e of readdirSync(d)) {
      const p = join(d, e);
      if (statSync(p).isDirectory()) walk(p);
      else if (p.endsWith('.ts') && !p.endsWith('.spec.ts')) out.push(p);
    }
  };
  try { walk(dir); } catch { /* dir may not exist */ }
  return out;
};

/** Prose = 3+ whitespace-separated words containing a letter. */
const looksLikeProse = (s) => {
  const t = s.trim();
  if (t.length < 12) return false;
  if (/^[a-z0-9_]+(\.[a-z0-9_]+)+$/i.test(t)) return false; // content key
  if (/^[A-Z0-9_]+$/.test(t)) return false;                  // ERROR_CODE
  if (t.startsWith('/') || t.startsWith('http')) return false; // route / url
  const words = t.split(/\s+/).filter((w) => /[a-zA-Z]/.test(w));
  return words.length >= 3;
};

const violations = [];

for (const rel of PATIENT_DIRS) {
  for (const file of listFiles(join(API_ROOT, rel))) {
    const src = ts.createSourceFile(
      file,
      readFileSync(file, 'utf8'),
      ts.ScriptTarget.Latest,
      true,
    );

    const visit = (node) => {
      if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) {
        if (looksLikeProse(node.text)) {
          // Walk up: is this inside an allowed context?
          let allowed = false;
          for (let p = node.parent; p && !allowed; p = p.parent) {
            if (ts.isDecorator(p)) allowed = true;
            else if (ts.isCallExpression(p)) {
              const e = p.expression;
              const name = ts.isIdentifier(e) ? e.text
                : ts.isPropertyAccessExpression(e) ? e.name.text
                : undefined;
              if (name && (DOC_DECORATORS.has(name) || SAFE_CALLS.has(name))) allowed = true;
            } else if (ts.isNewExpression(p)) {
              const e = p.expression;
              if (ts.isIdentifier(e) && SAFE_CALLS.has(e.text)) allowed = true;
            } else if (ts.isImportDeclaration(p) || ts.isExportDeclaration(p)) allowed = true;
          }
          if (!allowed) {
            const { line } = src.getLineAndCharacterOfPosition(node.getStart());
            violations.push({
              file: relative(API_ROOT, file).replace(/\\/g, '/'),
              line: line + 1,
              text: node.text.slice(0, 70),
            });
          }
        }
      }
      ts.forEachChild(node, visit);
    };
    visit(src);
  }
}

const scanned = PATIENT_DIRS.map((d) => `${d}/**`).join(', ');
if (violations.length === 0) {
  console.log(`no-patient-literals: OK — no patient-visible string literals in ${scanned}`);
  process.exit(0);
}

console.error(`no-patient-literals: ${violations.length} violation(s) — patient-visible text must come from the content library by key:\n`);
for (const v of violations) console.error(`  ${v.file}:${v.line}  "${v.text}"`);
console.error('\nFix: return a content KEY and let the client resolve it via GET /v1/content/:key.');
process.exit(1);
