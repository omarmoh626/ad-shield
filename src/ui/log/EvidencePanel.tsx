import { useStore } from '../store'
import AttemptTimeline from '../timeline/AttemptTimeline'
import AuditLog from './AuditLog'

/** Evidence tab (DESIGN s6): audit log first, then the attempt timeline. P2 adds the access inspector and diff. */
export default function EvidencePanel() {
  const attempt = useStore((value) => value.campaign.active)
  // Mounted only while visible, like the Directory tab.
  const visible = useStore((value) => value.screen === 'Work' && value.tab === 'Evidence')
  if (!visible) return null
  if (!attempt) return <div className="work-card placeholder">No case is open. Pick one from the inbox.</div>
  return <div className="work-card evidence">
    <AuditLog state={attempt.state} />
    <AttemptTimeline attempt={attempt} />
  </div>
}
