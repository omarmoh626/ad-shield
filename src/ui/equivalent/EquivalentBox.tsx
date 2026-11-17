import { useState } from 'react'

/** "Same change in PowerShell" box (DESIGN s6): the generated command and a Copy button. */
export default function EquivalentBox({ command }: { command: string }) {
  const [copied, setCopied] = useState(false)
  const copy = () => {
    void navigator.clipboard?.writeText(command).then(() => setCopied(true), () => setCopied(false))
  }
  return <div className="equivalent">
    <p className="label">Same change in PowerShell</p>
    <pre className="code" aria-label="Same change in PowerShell">{command}</pre>
    <button type="button" onClick={copy}>{copied ? 'Copied' : 'Copy'}</button>
  </div>
}
