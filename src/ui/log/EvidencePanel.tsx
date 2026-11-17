import { useStore } from '../store'
import AttemptTimeline from '../timeline/AttemptTimeline'
import AuditLog from './AuditLog'
import AccessInspector from '../inspectors/access/AccessInspector'
import AttemptDiff from '../diff/AttemptDiff'

/** Evidence tab (DESIGN s6): audit log first, then the access inspector, then the before/after diff and the attempt timeline. */
export default function EvidencePanel() {
  const attempt = useStore((value) => value.campaign.active)
  const selected = useStore((value) => value.selectedObject)
  // Mounted only while visible, like the Directory tab.
  const visible = useStore((value) => value.screen === 'Work' && value.tab === 'Evidence')
  if (!visible) return null
  if (!attempt) return <div className="work-card placeholder">No case is open. Pick one from the inbox.</div>
  return <div className="work-card evidence">
    <AuditLog state={attempt.state} />
    <AccessInspector state={attempt.state} initial={selected} />
    <AttemptDiff attempt={attempt} />
    <AttemptTimeline attempt={attempt} />
  </div>
}
