import { useState, type KeyboardEvent, type MouseEvent } from 'react'
import type { Guid } from '../../domain/types'
import { actions, useStore } from '../store'
import ObjectProperties, { type PropertiesTab } from '../properties/ObjectProperties'
import AccountEditor from '../editors/AccountEditor'
import ResetPasswordEditor from '../editors/ResetPasswordEditor'
import MoveEditor from '../editors/MoveEditor'
import GroupsEditor from '../editors/GroupsEditor'
import NewUserEditor from '../editors/NewUserEditor'
import SharePermissionsEditor from '../editors/SharePermissionsEditor'
import { menuItemsFor, type EditorRequest, type MenuItem } from '../editors/requests'
import ObjectMenu, { QuickActions } from '../menus/ObjectMenu'
import { displayName } from './labels'
import { isContainer } from './tree'
import DirectoryTree from './DirectoryTree'

const PRINCIPALS = new Set(['user', 'computer', 'group', 'serviceAccount'])
const guidOfRow = (element: Element | null): Guid | null => {
  const row = element?.closest('[role="treeitem"]')
  return row ? row.id.replace(/^tree-/, '') as Guid : null
}

/**
 * Directory tab (DESIGN s6): tree on the left, details on the right, editors under the details.
 * It reads the active attempt's state; every change goes through an editor and `dispatchGui`.
 */
export default function DirectoryPanel() {
  const state = useStore((value) => value.campaign.active?.state)
  const selected = useStore((value) => value.selectedObject)
  // Mounted only while visible: hidden panels add no controls to the tab order. Selection and
  // open forms live in the store, and the tree reopens the path to the selection on mount.
  const visible = useStore((value) => value.screen === 'Work' && value.tab === 'Directory')
  const [tab, setTab] = useState<PropertiesTab>('General')
  const [menu, setMenu] = useState<{ at?: { x: number; y: number } } | null>(null)
  const [request, setRequest] = useState<EditorRequest>()
  const [shareOpen, setShareOpen] = useState(false)
  if (!visible) return null
  if (!state) return <div className="work-card placeholder">No case is open. Pick one from the inbox.</div>
  const object = selected ? state.objects[selected] : undefined
  const items = object ? menuItemsFor(object) : []

  const select = (guid: Guid) => {
    if (guid !== selected) { setShareOpen(false); setRequest(undefined) }
    actions.setSelectedObject(guid)
  }
  const choose = (item: MenuItem) => {
    setMenu(null)
    if (item.tab) setTab(item.tab)
    if (item.editor === 'share') setShareOpen(true)
    setRequest({ editor: item.editor, item: item.item, nonce: (request?.nonce ?? 0) + 1 })
  }
  const onContextMenu = (event: MouseEvent<HTMLDivElement>) => {
    const guid = guidOfRow(event.target as Element) ?? selected
    if (!guid) return
    event.preventDefault()
    select(guid)
    setMenu({ at: { x: event.clientX, y: event.clientY } })
  }
  const onKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    if (!(event.key === 'ContextMenu' || (event.key === 'F10' && event.shiftKey))) return
    const tree = (event.target as Element).closest('[role="tree"]')
    const cursor = tree?.getAttribute('aria-activedescendant')
    const guid = cursor ? cursor.replace(/^tree-/, '') as Guid : selected
    if (!guid) return
    event.preventDefault()
    select(guid)
    setMenu({})
  }

  const editors = (open: PropertiesTab) => {
    if (!object) return null
    const forTab = request && items.some((item) => item.editor === request.editor && item.tab === open) ? request : undefined
    if (open === 'Account' && object.objectClass === 'user') return <div className="editors">
      <AccountEditor object={object} request={forTab} />
      <ResetPasswordEditor object={object} request={forTab} />
    </div>
    if (open === 'Groups' && PRINCIPALS.has(object.objectClass)) return <div className="editors"><GroupsEditor state={state} object={object} request={forTab} /></div>
    if (open === 'General') return <div className="editors">
      {isContainer(object) && <NewUserEditor state={state} container={object} request={forTab} />}
      {object.objectClass !== 'domain' && <MoveEditor state={state} object={object} request={forTab} />}
    </div>
    return null
  }

  return <div className="work-card directory" onContextMenu={onContextMenu} onKeyDown={onKeyDown}>
    <DirectoryTree state={state} selected={selected} onSelect={select} />
    <div className="details">
      <ObjectProperties
        key={selected ?? 'none'}
        state={state}
        guid={selected}
        tab={tab}
        onTab={setTab}
        header={object && items.length > 0 && <button type="button" aria-haspopup="menu" aria-expanded={menu !== null} onClick={() => setMenu(menu ? null : {})}>Actions</button>}
        editors={editors}
      />
      {object && <QuickActions items={items} onChoose={choose} />}
      {menu && object && <ObjectMenu label={`Actions for ${displayName(object)}`} items={items} at={menu.at} onChoose={choose} onClose={() => setMenu(null)} />}
      {object && shareOpen && <SharePermissionsEditor state={state} object={object} request={request?.editor === 'share' ? request : undefined} />}
    </div>
  </div>
}
