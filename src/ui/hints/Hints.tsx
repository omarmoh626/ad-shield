import { useState } from 'react'
import type { CaseFixture, ScriptStep } from '../../tickets/types'
import { actions } from '../store'
import { Glossed } from '../glossary/Glossed'
import { markFirstUses, termsFor } from '../glossary/terms'

/** "Inspect the account. Expected here: X." -> annotation "Inspect the account.", meaning "Expected here: X." */
export function splitExplain(explain: string): { annotation: string; meaning: string } {
  const match = explain.match(/^(.+?[.!?])\s+(.+)$/)
  return match ? { annotation: match[1]!, meaning: match[2]! } : { annotation: explain, meaning: explain }
}

/**
 * Level 3 player (SPEC "The analyst's shift" 3): one line at a time. The learner runs a line,
 * sees the result in the console, reads what it means, then decides when to advance. Nothing runs by itself.
 */
export function ScriptStepper({ steps, gui }: { steps: ScriptStep[]; gui: CaseFixture['routes']['gui'] }) {
  const [index, setIndex] = useState(0)
  const [ran, setRan] = useState(false)
  const step = steps[index]
  if (!step) return null
  const { annotation, meaning } = splitExplain(step.explain)
  const last = index === steps.length - 1
  return <div className="stepper" aria-label="Step-by-step script">
    <p className="label">Step {index + 1} of {steps.length}</p>
    <pre className="code"><code><span className="syntax-comment"># {annotation}</span>{'\n'}{step.code}</code></pre>
    {!ran
      ? <button type="button" onClick={() => { actions.terminal.runLine(step.code); setRan(true) }}>Run this line</button>
      : <>
        <p className="muted">The result is in the PowerShell console.</p>
        <div className="meaning" role="status"><strong>What this means</strong><p>{meaning}</p></div>
        {last
          ? <p className="muted">That was the last line. Check <strong>What done looks like</strong> above.</p>
          : <button type="button" onClick={() => { setIndex(index + 1); setRan(false) }}>Next line</button>}
      </>}
    {gui.length > 0 && <div className="gui-steps">
      <p className="label">Same change with the Directory</p>
      <ol>{gui.map((route, i) => <li key={i}>{route.path.join(' → ')}</li>)}</ol>
      <p className="muted">The Directory tab is built in T07. Until then, use the console.</p>
    </div>}
  </div>
}

/**
 * DESIGN s6 Work, left rail "Stuck?" card. Hints start closed for every ticket: the parent
 * remounts this component with a new key when the case or variant changes.
 */
export default function Hints({ fixture }: { fixture: CaseFixture }) {
  const [level, setLevel] = useState(0)
  const [one, two] = markFirstUses([fixture.hints[0].content, fixture.hints[1].content], termsFor(fixture.request.glossary))
  return <section className="card stuck" aria-labelledby="stuck-title">
    <h2 id="stuck-title" className="label">Stuck?</h2>
    {level >= 1 && <div className="hint"><p className="label">Hint 1 of 3 · the idea</p><p><Glossed segments={one!} /></p></div>}
    {level >= 2 && <div className="hint"><p className="label">Hint 2 of 3 · the tools</p><p><Glossed segments={two!} /></p></div>}
    {level >= 3 && <div className="hint"><p className="label">Hint 3 of 3 · step by step</p><ScriptStepper steps={fixture.routes.script} gui={fixture.routes.gui} /></div>}
    {level < 3 && <button type="button" onClick={() => setLevel(level + 1)}>Show hint {level + 1} of 3</button>}
  </section>
}
