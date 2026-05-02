/**
 * Regenerate the GitHub wiki markdown from the in-app HelpModal sections.
 *
 * The HelpModal is the single source of truth for help copy. This script
 * walks the section data's React element trees and emits a small set of
 * markdown files suitable for `mr-mpage/zoey-tracker.wiki`.
 *
 *   cd frontend && npx tsx scripts/build-wiki.ts --out /tmp/zoey-tracker.wiki
 *
 * Outputs:
 *   Home.md, Edit-mode-help.md, Viewer-mode-help.md, Glossary.md, _Sidebar.md
 */

import { Fragment, type ReactNode } from 'react'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import {
  buildEditSections,
  buildViewSections,
  type Section,
} from '../src/components/HelpModal'

const NAME = 'the baby'
const PARENTS = 'the parents'

function isElement(n: unknown): n is { type: unknown; props: { children?: ReactNode; className?: string } } {
  return typeof n === 'object' && n !== null && 'type' in (n as object) && 'props' in (n as object)
}

function walk(node: ReactNode): string {
  if (node == null || node === false || node === true) return ''
  if (typeof node === 'string') return node
  if (typeof node === 'number') return String(node)
  if (Array.isArray(node)) return node.map(walk).join('')
  if (!isElement(node)) return ''

  const { type, props } = node
  const childrenStr = walk(props.children)

  // <> Fragment </>
  if (type === Fragment) return childrenStr

  // Custom <H> heading helper used inside HelpModal section bodies.
  if (typeof type === 'function' && (type as { name?: string }).name === 'H') {
    return `\n#### ${childrenStr.trim()}\n\n`
  }

  // Drop SVG icons.
  if (typeof type === 'string' && type === 'svg') return ''

  if (typeof type === 'string') {
    switch (type) {
      case 'p':
        return `${childrenStr.trim()}\n\n`
      case 'ul':
      case 'ol':
        return `${childrenStr}\n`
      case 'li':
        return `- ${childrenStr.trim()}\n`
      case 'b':
      case 'strong':
        return `**${childrenStr}**`
      case 'i':
      case 'em':
        return `*${childrenStr}*`
      case 'br':
        return '\n'
      case 'span': {
        const cn = props.className ?? ''
        // Code-styled inline spans (zinc/pink background pill) → backticks.
        if (/bg-(zinc|pink)-\d/.test(cn)) return `\`${childrenStr}\``
        // Tone spans (text-amber-300 etc.) — keep text, drop styling.
        return childrenStr
      }
      case 'div':
        return childrenStr
      default:
        return childrenStr
    }
  }

  // Unknown component — recurse into children.
  return childrenStr
}

function tidy(md: string): string {
  return md
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim() + '\n'
}

function slug(id: string): string {
  return id.replace(/[^a-z0-9]+/gi, '-').toLowerCase()
}

function renderSections(sections: Section[]): string {
  const toc = sections
    .map((s) => `- [${s.title}](#${slug(s.id)}) — ${s.blurb}`)
    .join('\n')

  const bodies = sections
    .map((s) => {
      const md = tidy(walk(s.body))
      return [
        `<a id="${slug(s.id)}"></a>`,
        ``,
        `### ${s.title}`,
        ``,
        `*${s.blurb}*`,
        ``,
        md,
      ].join('\n')
    })
    .join('\n---\n\n')

  return `## Contents\n\n${toc}\n\n---\n\n${bodies}`
}

function buildHome(): string {
  return `# Zoey Tracker — wiki

Welcome to the wiki for [Zoey Tracker](https://github.com/mr-mpage/zoey-tracker) — a
self-hosted PWA for tracking a preterm baby's daily care.

This wiki mirrors the in-app **Help** modal so you can browse the user-facing
guidance before deploying the app. Pages are auto-generated from
\`frontend/src/components/HelpModal.tsx\` via \`frontend/scripts/build-wiki.ts\`, so
they stay in sync with the real UI.

## For parents using the app

- **[Edit-mode help](Edit-mode-help)** — the full guide for the parent doing the logging:
  Today screen, feeds, diapers, meds, pumps, weight & growth, vitals, schedule, and
  what to watch for.
- **[Viewer-mode help](Viewer-mode-help)** — for read-only viewers (the
  partner-on-night-shift, grandparents): what each screen shows.

## For operators deploying the app

- The [README](https://github.com/mr-mpage/zoey-tracker#readme) covers install,
  deploy, and configuration.
- [SECURITY.md](https://github.com/mr-mpage/zoey-tracker/blob/main/SECURITY.md)
  documents the threat model, data handling, and posture.

## Reference

- **[Glossary](Glossary)** — clinical and project-specific terms (PMA, Fenton, ml/kg/day,
  pace tier, etc.).
`
}

function buildSidebar(): string {
  return `### Zoey Tracker wiki

- [Home](Home)
- **For parents**
  - [Edit-mode help](Edit-mode-help)
  - [Viewer-mode help](Viewer-mode-help)
- **Reference**
  - [Glossary](Glossary)
- **Main repo**
  - [README](https://github.com/mr-mpage/zoey-tracker#readme)
  - [SECURITY.md](https://github.com/mr-mpage/zoey-tracker/blob/main/SECURITY.md)
`
}

function buildGlossary(): string {
  return `# Glossary

Terms that recur in the app and this wiki. Most come from preterm-care
literature; a few are app-specific.

### Postmenstrual age (PMA)

Gestational age at birth + how old the baby is, in weeks. A baby born at 35
weeks and now 14 days old is at 35 + 2 = 37 weeks PMA. Almost every preterm
growth metric is reported against PMA rather than calendar age.

### Term-equivalent

PMA 40 weeks — the moment a full-term baby would have been born. Growth velocity
expectations slow toward the term curve from here.

### Fenton 2025

The Fenton preterm growth chart, 2025 revision (girls / boys references). The
app plots weight history against the girls' percentile curves (3rd, 10th, 50th,
90th) on a PMA x-axis.

### ml/kg/day

Daily milk intake normalised to body weight. The standard preterm intake
target is 150–160 ml/kg/day (ESPGHAN 2022). The app's coloured trend bands:

- **rose** — under 135 · genuinely low
- **amber** — 135–150 · under target
- **lime** — 150–160 · at minimum
- **emerald** — 160–180 · solidly in zone
- **sky** — above 180 · often catch-up

### g/kg/day

Daily weight gain normalised to body weight. Expected band depends on PMA:
faster at younger PMA, slower near term. The app uses Fenton 2025 +
AAP/ESPGHAN 2022 bands to colour the daily gain.

### Pace tier

The Today screen's seven-tier chip grading where you are vs the expected
proportion of the daily target so far: *well behind* / *behind* /
*slightly behind* / *on track* / *slightly ahead* / *ahead* / *well ahead*.
Boundaries: ±5 % (on track), ±10 % (slightly), ±20 % (well off).

### Comparison badge

The ↓ ≈ ↑ badge on each feed, comparing it to the same feed-of-day across
the previous 7 days. ±15 % threshold.

### Day anchor / feeding day

The feeding day runs from the anchor time (default 02:30) to the same time
the next morning. Daily total resets at the anchor, not midnight. Configurable
in Settings → Feeding schedule.

### Extra feed

A top-up between regular feeds, tagged "EXT". Counts toward the daily total
but doesn't shift feed-of-day numbering or pace expectations.

### Auto-fill weight

On days without a manual weigh-in, the app interpolates between manual
entries (or extrapolates the trailing 7-day gain forward), so the daily ml
target keeps tracking growth. Auto rows are tagged \`EST\`; only manual
weights appear in the doctor report.

### Sustained SpO₂

The Owlet sock filters out short oxygen blips and publishes a smoothed
sustained value. The Vitals tab's "lowest sustained" is the lowest that
smoothed value reached on the day — the number worth flagging if it dips
persistently.

### Viewer mode

A read-only session opened by a separate viewer PIN. The UI hides destructive
controls; the API enforces it independently. Viewer sessions last 7 days
(edit sessions last 90).
`
}

function main() {
  const outArg = process.argv.indexOf('--out')
  if (outArg === -1 || !process.argv[outArg + 1]) {
    console.error('usage: tsx scripts/build-wiki.ts --out <path-to-wiki-clone>')
    process.exit(2)
  }
  const outDir = path.resolve(process.argv[outArg + 1])
  mkdirSync(outDir, { recursive: true })

  const editSections = buildEditSections(NAME, PARENTS)
  const viewSections = buildViewSections(NAME, PARENTS)

  const files: Record<string, string> = {
    'Home.md': buildHome(),
    'Edit-mode-help.md': `# Edit-mode help

The parent doing the logging gets the edit-mode session. This page mirrors
the in-app Help modal one section per topic.

${renderSections(editSections)}
`,
    'Viewer-mode-help.md': `# Viewer-mode help

Read-only viewers (the partner on night shift, grandparents, anyone with a
viewer PIN) see this version of the help. Everything is observation-only —
the API rejects writes from a viewer session even if the UI somehow let them
through.

${renderSections(viewSections)}
`,
    'Glossary.md': buildGlossary(),
    '_Sidebar.md': buildSidebar(),
  }

  for (const [name, content] of Object.entries(files)) {
    const p = path.join(outDir, name)
    writeFileSync(p, tidy(content))
    console.log(`wrote ${p}`)
  }
}

main()
