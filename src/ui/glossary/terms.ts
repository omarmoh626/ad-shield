/** One glossary entry. `match` lists the spellings that count as a use of the term. */
export interface GlossaryTerm { term: string; definition: string; match: string[] }

/**
 * Terms every ticket can use. SPEC "The analyst's shift" requires OU, GPO, and ACL
 * to be defined in place on first use. A case's own glossary is added on top.
 */
export const BASE_TERMS: GlossaryTerm[] = [
  { term: 'Organizational unit (OU)', definition: 'A folder in the directory that holds accounts, groups, and computers so they can be managed together.', match: ['organizational unit', 'OU'] },
  { term: 'Group Policy object (GPO)', definition: 'A named set of settings that Windows applies to the users and computers in the OUs it is linked to.', match: ['Group Policy object', 'GPO'] },
  { term: 'Access control list (ACL)', definition: "The list of permission entries on a file, folder, share, or directory object. Each entry allows or denies a right to a user or group.", match: ['access control list', 'ACL', 'permissions'] },
]

/** Builds the term list for a ticket: its own glossary first, then base terms it does not already define. */
export function termsFor(glossary: { term: string; definition: string }[] = []): GlossaryTerm[] {
  const own = glossary.map((entry) => ({ ...entry, match: spellings(entry.term) }))
  const covered = new Set(own.flatMap((entry) => entry.match.map((word) => word.toLowerCase())))
  return [...own, ...BASE_TERMS.filter((entry) => !entry.match.some((word) => covered.has(word.toLowerCase())))]
}

/** "Sign-in name (sAMAccountName)" -> ["Sign-in name", "sAMAccountName"]. */
function spellings(term: string): string[] {
  const inner = term.match(/^(.*?)\s*\(([^)]+)\)\s*$/)
  return inner ? [inner[1]!, inner[2]!] : [term]
}

export type Segment = { text: string } | { text: string; term: GlossaryTerm }

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Splits each text into plain segments and term segments. Only the first use of
 * each term across all texts, in order, becomes a term segment. Pure.
 */
export function markFirstUses(texts: string[], terms: GlossaryTerm[]): Segment[][] {
  const seen = new Set<string>()
  const words = terms.flatMap((term) => term.match.map((word) => ({ word, term })))
    .sort((a, b) => b.word.length - a.word.length)
  if (!words.length) return texts.map((text) => [{ text }])
  const pattern = new RegExp(words.map(({ word }) => `(?<![\\w-])${escape(word)}(?![\\w-])`).join('|'), 'gi')
  // Short all-caps abbreviations count only in capitals, so a standalone "ou" or "acl" is not a use of OU or ACL.
  const isAbbreviation = (word: string) => /^[A-Z]{2,4}$/.test(word)
  return texts.map((text) => {
    const segments: Segment[] = []
    let last = 0
    for (const found of text.matchAll(pattern)) {
      const hit = words.find(({ word }) => isAbbreviation(word) ? word === found[0] : word.toLowerCase() === found[0].toLowerCase())
      if (!hit || seen.has(hit.term.term)) continue
      seen.add(hit.term.term)
      if (found.index > last) segments.push({ text: text.slice(last, found.index) })
      segments.push({ text: found[0], term: hit.term })
      last = found.index + found[0].length
    }
    if (last < text.length) segments.push({ text: text.slice(last) })
    return segments
  })
}
