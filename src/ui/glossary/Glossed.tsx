import { useId, useState } from 'react'
import type { GlossaryTerm, Segment } from './terms'

/** A term on first use: dotted underline, definition in place on click or Enter, and always available to screen readers as its description. */
export function Term({ text, term }: { text: string; term: GlossaryTerm }) {
  const [open, setOpen] = useState(false)
  const id = useId()
  return <span className="term-wrap">
    <button type="button" className="term" aria-expanded={open} aria-describedby={id} onClick={() => setOpen(!open)}>{text}</button>
    {/* Closed: hidden text that aria-describedby still reads, so it is announced once and never splits the sentence. */}
    <span id={id} className="term-def" hidden={!open}>{` (${term.definition}) `}</span>
  </span>
}

/** Renders segments from markFirstUses. */
export function Glossed({ segments }: { segments: Segment[] }) {
  return <>{segments.map((segment, index) => 'term' in segment
    ? <Term key={index} text={segment.text} term={segment.term} />
    : <span key={index}>{segment.text}</span>)}</>
}

/** The Read screen's "New words in this ticket" list. */
export function GlossaryList({ terms }: { terms: GlossaryTerm[] }) {
  return <details className="glossary">
    <summary>New words in this ticket ({terms.length})</summary>
    <dl>{terms.map((term) => <div key={term.term}><dt>{term.term}</dt><dd>{term.definition}</dd></div>)}</dl>
  </details>
}
