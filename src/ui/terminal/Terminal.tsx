import { forwardRef, useEffect, useImperativeHandle, useRef, useState, type KeyboardEvent } from 'react'
import { complete } from '../../ps/completion'
import { highlight } from '../../ps/highlight'
import { run, createDefaultRegistry, createRuntime, type TranscriptEntry } from '../../ps/runtime'
import { actions, getStore, operatorGuid, useStore } from '../store'
import { getTicket } from '../../tickets/cases'

const registry = createDefaultRegistry()
export interface TerminalHandle { runLine(text: string): void; setDraft(text: string): void; focus(): void }
const Terminal = forwardRef<TerminalHandle>(function Terminal(_props, ref) {
  const campaign = useStore((value) => value.campaign)
  const draft = useStore((value) => value.draft)
  const [output, setOutput] = useState<TranscriptEntry[]>([])
  const [secure, setSecure] = useState<{ prompt: string; source: string } | undefined>()
  const [confirmPrompt, setConfirmPrompt] = useState<{ prompt: string; source: string } | undefined>()
  const [script, setScript] = useState(false)
  const [scriptLine, setScriptLine] = useState(0)
  const input = useRef<HTMLInputElement>(null)
  const secureRef = useRef<HTMLInputElement>(null)
  const historyIndex = useRef(-1)
  const history = useRef<string[]>([])
  const answers = useRef<({ kind: 'secure'; policy: 'pass' | 'fail' } | { kind: 'confirm'; value: boolean })[]>([])
  const fixture = campaign.active ? getTicket(campaign.active.id)?.build(campaign.active.seed) : undefined
  function runSource(source: string) {
    const active = actionsStateCampaign()
    if (!active?.active) return
    let consumed = 0
    const take = (kind: 'secure' | 'confirm') => {
      const answer = answers.current[consumed]
      if (!answer || answer.kind !== kind) return undefined
      consumed += 1
      return answer
    }
    const rt = createRuntime({ registry, actor: operatorGuid,
      readSecure: () => { const answer = take('secure'); return answer?.kind === 'secure' ? { policy: answer.policy } : undefined },
      confirm: () => { const answer = take('confirm'); return answer?.kind === 'confirm' ? answer.value : undefined },
      tickets: {
      getCampaign: () => actionsStateCampaign(), setCampaign: actions.setCampaign,
      getFixture: () => fixture,
    } })
    const result = run(source, rt, active.active.state)
    // Replay (CONTRACTS s7): keep every queued answer while the run is pending; clear the queue once it finishes.
    if (!result.pending) answers.current = []
    if (result.pending?.kind === 'secure') { setSecure({ prompt: `${result.pending.prompt} (simulated)`, source }); setConfirmPrompt(undefined); return }
    if (result.pending?.kind === 'confirm') { setConfirmPrompt({ prompt: `${result.pending.prompt} (simulated)`, source }); setSecure(undefined); return }
    const next = rt.getTicketCampaign() ?? active
    actions.setCampaign(next.active && next === active && result.state !== active.active.state ? { ...active, active: { ...active.active, state: result.state } } : next)
    setOutput((entries) => [...entries, { kind: 'input', text: source }, ...(result.output ? [{ kind: 'output' as const, text: result.output }] : []), ...result.errors.map((error) => ({ kind: 'error' as const, text: `Error: ${error.message}` }))])
    if (result.committed.length) actions.toast('Change applied · simulated')
    else if (result.errors.length) actions.toast('Command returned an error')
  }
  function actionsStateCampaign() { return getCampaign() }
  function submit() {
    const source = draft.trim()
    if (!source) return
    history.current.push(source); historyIndex.current = -1
    actions.setDraft(''); runSource(source)
  }
  function submitSecure() {
    // The characters live only in the uncontrolled DOM field. Keep the verdict, then clear the field.
    const field = secureRef.current
    const policy = field ? passwordVerdict(field.value) : 'fail'
    if (field) field.value = ''
    const source = secure?.source
    setSecure(undefined)
    if (source) { answers.current.push({ kind: 'secure', policy }); runSource(source) }
  }
  function runNextLine() {
    const lines = draft.split('\n')
    let index = scriptLine
    while (index < lines.length && !lines[index]!.trim()) index += 1
    if (index >= lines.length) { setScriptLine(0); actions.toast('Script pad: no more lines. Starting again from line 1.'); return }
    runSource(lines[index]!)
    setScriptLine(index + 1 >= lines.length ? 0 : index + 1)
  }
  function submitConfirm(value: boolean) {
    const source = confirmPrompt?.source
    setConfirmPrompt(undefined)
    if (source) { answers.current.push({ kind: 'confirm', value }); runSource(source) }
  }
  function onKeyDown(event: KeyboardEvent<HTMLInputElement>) {
    if (event.key === 'Enter') { event.preventDefault(); submit() }
    if (event.key === 'ArrowUp') { event.preventDefault(); const index = historyIndex.current < 0 ? history.current.length - 1 : Math.max(0, historyIndex.current - 1); historyIndex.current = index; actions.setDraft(history.current[index] ?? '') }
    if (event.key === 'ArrowDown') { event.preventDefault(); const index = Math.min(history.current.length, historyIndex.current + 1); historyIndex.current = index; actions.setDraft(history.current[index] ?? '') }
    if (event.key === 'Tab') {
      if (!draft.trim()) return
      const result = complete(draft, draft.length, registry)
      if (!result.candidates.length) return
      event.preventDefault()
      if (result.candidates.length === 1) actions.setDraft(draft.slice(0, result.start) + result.candidates[0] + ' ')
      else if (result.candidates.length) setOutput((entries) => [...entries, { kind: 'output', text: result.candidates.join('  ') }])
    }
  }
  useImperativeHandle(ref, () => ({ runLine: (text) => runSource(text), setDraft: actions.setDraft, focus: () => input.current?.focus() }))
  const spans = highlight(draft, registry)
  useEffect(() => { if (secure) secureRef.current?.focus() }, [secure])
  return <section className="console" aria-label="PowerShell practice console">
    <div className="console-head"><strong>PowerShell</strong> <span className="placeholder">Practice console · simulated</span> <button onClick={() => setScript(!script)}>{script ? 'Command line' : 'Script pad'}</button></div>
    <div className="transcript" aria-live="polite">{output.map((entry, i) => <div className={`entry ${entry.kind}`} key={i}>{entry.kind === 'input' ? `PS C:\\Lab> ${entry.text}` : entry.text}</div>)}
      {draft && <div aria-hidden="true">{spans.map((span, i) => <span className={`syntax-${span.kind}`} key={i}>{draft.slice(span.start, span.end)}</span>)}</div>}
    </div>
    {script && <><label htmlFor="script-pad">Script pad</label><textarea id="script-pad" className="script-pad" value={draft} onChange={(event) => { actions.setDraft(event.target.value); setScriptLine(0) }} /><div><button onClick={runNextLine}>Run one line · next: line {scriptLine + 1}</button> <button onClick={() => { setScriptLine(0); runSource(draft) }}>Run all</button></div></>}
    {secure ? <form className="command-row" onSubmit={(event) => { event.preventDefault(); submitSecure() }}><label htmlFor="secure">{secure.prompt}</label><input ref={secureRef} id="secure" type="password" autoComplete="new-password" defaultValue="" /><button>Submit simulated input</button></form> : confirmPrompt ? <div className="command-row" role="group" aria-label="Confirmation prompt"><span>{confirmPrompt.prompt}</span><button onClick={() => submitConfirm(true)}>Yes</button><button onClick={() => submitConfirm(false)}>No</button></div> : <form className="command-row" onSubmit={(event) => { event.preventDefault(); submit() }}>
      <label className="mono" htmlFor="command">PS C:\Lab&gt;</label><input ref={input} id="command" aria-label="PowerShell command" value={draft} onChange={(event) => actions.setDraft(event.target.value)} onKeyDown={onKeyDown} /><button type="submit">Run</button>
    </form>}
  </section>
})
export default Terminal
function getCampaign() { return getStore().campaign }

/** Simplified lab password policy (docs/SUPPORT.md): 12+ characters with upper case, lower case, and a digit. */
function passwordVerdict(value: string): 'pass' | 'fail' {
  return value.length >= 12 && /[A-Z]/.test(value) && /[a-z]/.test(value) && /\d/.test(value) ? 'pass' : 'fail'
}
