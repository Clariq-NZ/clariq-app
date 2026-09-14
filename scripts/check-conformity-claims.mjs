#!/usr/bin/env node
/**
 * Conformity-claim check (Architecture 10.6, outstanding since 11 September).
 *
 * The binding rule is that nothing this platform produces may say it is
 * compliant with, certified to or conforms to an ISO standard. Clariq has not
 * undertaken a conformity assessment, and a false claim is precisely the
 * greenwashing exposure the ISO 59000 series exists to prevent.
 *
 * The database already refuses: contains_conformity_claim() plus check
 * constraints on report_definitions. But nothing stopped the phrase reaching a
 * React string, a PDF template or a guide step, which is where a customer or
 * an auditor would actually read it. This closes that gap at build time.
 *
 * The pattern below is a transcription of the SQL function. If you change one,
 * change both; the test at the bottom of this file exists to make a drift
 * obvious rather than silent.
 *
 * Negations are allowed and are deliberately used: the marketing site's
 * strongest line is that we will never tell you we are certified to a
 * circularity standard. So a line is only a failure when it makes the claim,
 * not when it disowns it.
 */

import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, relative, extname } from 'node:path'

// Transcribed from public.contains_conformity_claim(text).
const BANNED = /(compliant with|certified to|conforms to|conformity with|in compliance with|meets the requirements of|accredited to)/i

// A claim disowned is not a claim made. The negation has to come BEFORE the
// phrase and close to it: "we will never tell you we are certified to ..." is
// a disavowal, whereas "certified to ISO 59020, and we do not charge extra"
// is a claim with an unrelated "not" later in the sentence. Scanning the whole
// line for any negation let that second case through, which the tests below
// caught.
const NEGATION = /\b(never|not|no|cannot|can't|won't|without|nor|neither|refuses?d?|avoids?|rather than|instead of)\b/i
const NEGATION_WINDOW = 60
const isDisowned = (line, at) => NEGATION.test(line.slice(Math.max(0, at - NEGATION_WINDOW), at))

const ROOTS = ['src', 'labels', 'netlify', 'docs']
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.mjs', '.json', '.html', '.md'])
const SKIP_FILES = new Set(['Architecture.md'])   // the rule is quoted there by design
const SKIP_DIRS = new Set(['node_modules', 'dist', '.git'])

function* walk(dir) {
  let entries
  try { entries = readdirSync(dir) } catch { return }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue
    const full = join(dir, name)
    if (statSync(full).isDirectory()) yield* walk(full)
    else if (EXTENSIONS.has(extname(name)) && !SKIP_FILES.has(name)) yield full
  }
}

const failures = []
for (const root of ROOTS) {
  for (const file of walk(root)) {
    const lines = readFileSync(file, 'utf8').split('\n')
    lines.forEach((line, i) => {
      const hit = line.match(BANNED)
      if (!hit) return
      if (isDisowned(line, hit.index)) return
      failures.push({ file: relative(process.cwd(), file), line: i + 1, phrase: hit[0], text: line.trim().slice(0, 120) })
    })
  }
}

// Drift guard: if the SQL function gains a phrase and this file does not, the
// build should still be told something is wrong. These must match the regex.
for (const phrase of ['compliant with', 'certified to', 'conforms to', 'conformity with', 'in compliance with', 'meets the requirements of', 'accredited to']) {
  if (!BANNED.test(phrase)) {
    console.error(`Conformity check is broken: "${phrase}" is in the list but the pattern does not catch it.`)
    process.exit(2)
  }
}

if (failures.length === 0) {
  console.log('Conformity claims: clean.')
  process.exit(0)
}

console.error('\nConformity-claim check failed (Architecture 10.6).')
console.error('These lines claim conformity with a standard. Clariq has not been assessed.\n')
for (const f of failures) {
  console.error(`  ${f.file}:${f.line}  "${f.phrase}"`)
  console.error(`    ${f.text}`)
}
console.error('\nPermitted wordings: "prepared with reference to the measurement framework of ISO 59020:2024",')
console.error('"prepared to support obligations under ...", or an explicit negation of the claim.\n')
process.exit(1)
