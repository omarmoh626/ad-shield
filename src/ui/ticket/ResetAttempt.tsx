import { useState } from 'react'
import { actions } from '../store'

/** DESIGN s6 Work rail item 6: a quiet text button with a confirmation step. */
export default function ResetAttempt() {
  const [asking, setAsking] = useState(false)
  if (!asking) return <button type="button" className="quiet" onClick={() => setAsking(true)}>Reset this attempt</button>
  return <div className="confirm" role="group" aria-label="Confirm reset">
    <p>Reset this attempt? The simulated domain and lab clock go back to when the case opened. Earlier completions and your cheat sheet stay.</p>
    <button type="button" onClick={() => { actions.resetAttempt(); setAsking(false) }}>Yes, reset</button>
    <button type="button" onClick={() => setAsking(false)}>Cancel</button>
  </div>
}
