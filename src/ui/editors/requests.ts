import type { DirObject } from '../../domain/types'
import { isContainer } from '../directory/tree'

export type EditorKind = 'account' | 'password' | 'move' | 'groups' | 'newUser' | 'share'
export type PropertiesTab = 'General' | 'Account' | 'Groups'

/** One context-menu or quick-action item. Each opens an editor; nothing applies until Apply. */
export interface MenuItem {
  item: string
  label: string
  editor: EditorKind
  tab: PropertiesTab | null
}

/** A request from a menu item: open this editor, preset the draft, focus the right control. */
export interface EditorRequest {
  editor: EditorKind
  item: string
  nonce: number
}

const ACCOUNT_CLASSES = new Set(['user', 'computer', 'serviceAccount'])
const PRINCIPALS = new Set(['user', 'computer', 'group', 'serviceAccount'])

/** The actions offered for an object, in menu order. Menu and visible buttons use this same list. */
export function menuItemsFor(object: DirObject): MenuItem[] {
  const items: MenuItem[] = []
  if (object.objectClass === 'user') {
    if (object.attrs.lockedOut === true) items.push({ item: 'unlock', label: 'Unlock account…', editor: 'account', tab: 'Account' })
    items.push(object.attrs.enabled === false
      ? { item: 'enable', label: 'Enable account…', editor: 'account', tab: 'Account' }
      : { item: 'disable', label: 'Disable account…', editor: 'account', tab: 'Account' })
    items.push({ item: 'reset', label: 'Reset password…', editor: 'password', tab: 'Account' })
    items.push({ item: 'mustChange', label: 'Require new password at next sign-in…', editor: 'account', tab: 'Account' })
  }
  if (PRINCIPALS.has(object.objectClass)) items.push({ item: 'groups', label: 'Add to a group…', editor: 'groups', tab: 'Groups' })
  if (object.objectClass !== 'domain') items.push({ item: 'move', label: 'Move…', editor: 'move', tab: 'General' })
  if (isContainer(object)) items.push({ item: 'newUser', label: 'New user…', editor: 'newUser', tab: 'General' })
  if (PRINCIPALS.has(object.objectClass) && object.attrs.groupCategory !== 'Distribution') items.push({ item: 'share', label: 'Share permissions…', editor: 'share', tab: null })
  return items
}

export const hasAccount = (object: DirObject) => ACCOUNT_CLASSES.has(object.objectClass)
