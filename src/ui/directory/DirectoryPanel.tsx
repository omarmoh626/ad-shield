import { actions, useStore } from '../store'
import ObjectProperties from '../properties/ObjectProperties'
import DirectoryTree from './DirectoryTree'

/**
 * Directory tab (DESIGN s6): tree on the left, details on the right. It reads the active
 * attempt's state and writes only the UI selection. P2 adds editors under the properties.
 */
export default function DirectoryPanel() {
  const state = useStore((value) => value.campaign.active?.state)
  const selected = useStore((value) => value.selectedObject)
  // Mounted only while visible: hidden panels add no controls to the tab order. Selection lives in the store,
  // and the tree reopens the path to it on mount.
  const visible = useStore((value) => value.screen === 'Work' && value.tab === 'Directory')
  if (!visible) return null
  if (!state) return <div className="work-card placeholder">No case is open. Pick one from the inbox.</div>
  return <div className="work-card directory">
    <DirectoryTree state={state} selected={selected} onSelect={actions.setSelectedObject} />
    <ObjectProperties key={selected ?? 'none'} state={state} guid={selected} />
  </div>
}
