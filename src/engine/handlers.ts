import { deriveDn } from '../domain/dn'
import { createObject, moveObject } from '../domain/graph'
import { findByDn, findBySamAccountName } from '../domain/indexes'
import type { AttrValue, DirObject, DomainState, Guid } from '../domain/types'
import type { Need } from './authz'
import { EVENT_ID, MEMBER_ADDED, MEMBER_REMOVED, simulatorEvent, windowsEvent, type EventDraft } from './events'
import { canNest, containsGroup, groupCategory, groupScope, isPrimaryGroupOf, memberKind } from './groups'
import type { Action, ActionCtx, ActionError, ActionType, ActionWarning, Change } from './types'
import { aclAddEntry, aclRemoveEntry } from './handlers/acl'
import { sessionEnd, sessionSignIn } from './handlers/session'

export interface Failure {
  error: ActionError
  message: string
}

export interface Applied {
  state: DomainState
  changes: Change[]
  events: EventDraft[]
  warnings: ActionWarning[]
}

/** What an action needs before it may run, plus the function that computes its result. */
export interface Plan {
  needs: Need[]
  touches: Guid[]
  apply: () => Applied | Failure
}

export type Handler<T extends ActionType> = (state: DomainState, action: Extract<Action, { type: T }>, ctx: ActionCtx) => Plan | Failure

/** RID of the Domain Users group. New users get it as their primary group. */
export const DOMAIN_USERS_RID = 513

/** Attributes that only a dedicated action may change. */
const PROTECTED_ATTRS = new Set(['sAMAccountName', 'enabled', 'lockedOut', 'badPwdCount', 'credentialVersion', 'pwdLastSet', 'primaryGroupID', 'whenCreated', 'objectClass', 'objectSid', 'objectGUID', 'distinguishedName', 'adminCount'])
const SAM_FORBIDDEN = /["/\\[\]:;|=,+*?<>@]/
const CONTAINER_CLASSES = new Set(['organizationalUnit', 'container', 'domain'])

const fail = (error: ActionError, message: string): Failure => ({ error, message })
const lower = (value: string): string => value.toLocaleLowerCase('en-US')
const same = (left: AttrValue | undefined, right: AttrValue | undefined): boolean => JSON.stringify(left ?? null) === JSON.stringify(right ?? null)

/** Returns a state where one object has new attribute values and the revision of this attempt. */
function patch(state: DomainState, guid: Guid, attrs: Record<string, AttrValue>): DomainState {
  const object = state.objects[guid]
  const next: DirObject = { ...object, attrs: { ...object.attrs, ...attrs }, rev: state.revision + 1 }
  return { ...state, objects: { ...state.objects, [guid]: next } }
}

function attrChanges(object: DirObject, attrs: Record<string, AttrValue>): Change[] {
  return Object.keys(attrs)
    .filter((key) => !same(object.attrs[key], attrs[key]))
    .map((key) => ({ kind: 'attr' as const, target: object.guid, key, before: object.attrs[key], after: attrs[key] }))
}

function domainRoot(state: DomainState, from: Guid): DirObject | undefined {
  const visited = new Set<Guid>()
  let current: DirObject | undefined = state.objects[from]
  while (current && current.parent !== null && !visited.has(current.guid)) {
    visited.add(current.guid)
    current = state.objects[current.parent]
  }
  return current?.objectClass === 'domain' ? current : undefined
}

function userTarget(state: DomainState, guid: Guid): DirObject | Failure {
  const object: DirObject | undefined = state.objects[guid]
  if (!object) return fail('notFound', 'The user object was not found.')
  if (object.objectClass !== 'user') return fail('invalid', 'The target is not a user account.')
  return object
}

const isFailure = (value: object): value is Failure => 'error' in value
const noChange = (state: DomainState, message: string): Applied => ({ state, changes: [], events: [], warnings: [{ code: 'noChange', message }] })

const userCreate: Handler<'user.create'> = (state, action, ctx) => {
  const root = domainRoot(state, ctx.actor)
  const parentGuid = action.parent ?? (root ? findByDn(state, `CN=Users,${deriveDn(state, root)}`) : undefined)
  const parent: DirObject | undefined = parentGuid ? state.objects[parentGuid] : undefined
  if (!parent) return fail('notFound', 'The target container was not found.')
  return {
    needs: [{ within: parent.guid, objectClass: 'user' }],
    touches: [],
    apply: () => {
      const name = action.name.trim()
      const sam = action.samAccountName.trim()
      if (!CONTAINER_CLASSES.has(parent.objectClass)) return fail('invalid', 'A user can be created only in a container or an organizational unit.')
      if (!name) return fail('invalid', 'The name cannot be empty.')
      if (!sam || sam.length > 20 || SAM_FORBIDDEN.test(sam)) return fail('invalid', 'The sAMAccountName must be 1 to 20 characters without " / \\ [ ] : ; | = , + * ? < > @.')
      const extra = action.attrs ?? {}
      const blocked = Object.keys(extra).find((key) => PROTECTED_ATTRS.has(key))
      if (blocked) return fail('invalid', `The attribute ${blocked} cannot be set directly.`)
      if (findBySamAccountName(state, sam)) return fail('conflict', `The sAMAccountName ${sam} is already in use.`)
      const siblings = state.indexes.childrenByParent[String(parent.guid)] ?? []
      if (siblings.some((guid) => lower(state.objects[guid].rdn) === lower(name))) return fail('conflict', `An object named ${name} already exists in this container.`)

      // The object is created first. The credential step can then fail and leave a disabled account.
      const accepted = action.credential?.policy === 'pass'
      const enabled = action.enabled === true && accepted
      const warnings: ActionWarning[] = []
      if (action.credential?.policy === 'fail') warnings.push({ code: 'passwordRejected', message: 'The simulated password did not meet the lab password policy. The account was created without a credential and is disabled.' })
      else if (action.enabled === true && !accepted) warnings.push({ code: 'notEnabled', message: 'The account was created disabled because it has no valid simulated credential.' })
      const attrs: Record<string, AttrValue> = {
        displayName: name,
        userPrincipalName: `${sam}@${root?.rdn ?? ''}`,
        ...extra,
        sAMAccountName: sam,
        enabled,
        lockedOut: false,
        badPwdCount: 0,
        credentialVersion: accepted ? 1 : 0,
        pwdLastSet: accepted ? state.now : 0,
        primaryGroupID: DOMAIN_USERS_RID,
        whenCreated: state.now,
      }
      const created = createObject(state, { objectClass: 'user', rdn: name, parent: parent.guid, attrs, securityPrincipal: true })
      const target = created.object.guid
      const events = [windowsEvent(created.state, EVENT_ID.userCreated, ctx.actor, target, { samAccountName: sam })]
      if (enabled) events.push(windowsEvent(created.state, EVENT_ID.userEnabled, ctx.actor, target))
      const changes: Change[] = [
        { kind: 'object', target, key: 'user', before: undefined, after: deriveDn(created.state, target) },
        ...Object.keys(attrs).map((key) => ({ kind: 'attr' as const, target, key, before: undefined, after: attrs[key] })),
      ]
      return { state: created.state, changes, events, warnings }
    },
  }
}

const userSetAttrs: Handler<'user.setAttrs'> = (state, action, ctx) => {
  const user = userTarget(state, action.target)
  if (isFailure(user)) return user
  return {
    needs: [{ within: user.parent, objectClass: 'user', target: user.guid }],
    touches: [user.guid],
    apply: () => {
      const blocked = Object.keys(action.attrs).find((key) => PROTECTED_ATTRS.has(key))
      if (blocked) return fail('invalid', `The attribute ${blocked} cannot be set directly.`)
      const changes = attrChanges(user, action.attrs)
      if (changes.length === 0) return noChange(state, 'The attributes already have these values.')
      const next = patch(state, user.guid, action.attrs)
      return { state: next, changes, events: [windowsEvent(next, EVENT_ID.userChanged, ctx.actor, user.guid, { attributes: changes.map((change) => change.key).join(',') })], warnings: [] }
    },
  }
}

const userSetEnabled: Handler<'user.setEnabled'> = (state, action, ctx) => {
  const user = userTarget(state, action.target)
  if (isFailure(user)) return user
  return {
    needs: [{ within: user.parent, objectClass: 'user', target: user.guid }],
    touches: [user.guid],
    apply: () => {
      if (user.attrs.enabled === action.enabled) return noChange(state, action.enabled ? 'The account is already enabled.' : 'The account is already disabled.')
      if (action.enabled && !(typeof user.attrs.credentialVersion === 'number' && user.attrs.credentialVersion > 0)) return fail('invalid', 'The account has no valid simulated credential. Reset the password first.')
      const attrs = { enabled: action.enabled }
      const next = patch(state, user.guid, attrs)
      return { state: next, changes: attrChanges(user, attrs), events: [windowsEvent(next, action.enabled ? EVENT_ID.userEnabled : EVENT_ID.userDisabled, ctx.actor, user.guid)], warnings: [] }
    },
  }
}

const userUnlock: Handler<'user.unlock'> = (state, action, ctx) => {
  const user = userTarget(state, action.target)
  if (isFailure(user)) return user
  return {
    needs: [{ within: user.parent, objectClass: 'user', target: user.guid }],
    touches: [user.guid],
    apply: () => {
      if (user.attrs.lockedOut !== true) return noChange(state, 'The account is not locked out.')
      const attrs = { lockedOut: false, badPwdCount: 0 }
      const next = patch(state, user.guid, attrs)
      return { state: next, changes: attrChanges(user, attrs), events: [windowsEvent(next, EVENT_ID.userUnlocked, ctx.actor, user.guid)], warnings: [] }
    },
  }
}

const userResetPassword: Handler<'user.resetPassword'> = (state, action, ctx) => {
  const user = userTarget(state, action.target)
  if (isFailure(user)) return user
  return {
    needs: [{ within: user.parent, objectClass: 'user', target: user.guid }],
    touches: [user.guid],
    apply: () => {
      if (action.credential.policy !== 'pass') return fail('invalid', 'The simulated password did not meet the lab password policy. Nothing was changed.')
      const version = typeof user.attrs.credentialVersion === 'number' ? user.attrs.credentialVersion : 0
      // A reset changes the credential only. It does not unlock the account or end issued sessions.
      const attrs = { credentialVersion: version + 1, pwdLastSet: state.now }
      const next = patch(state, user.guid, attrs)
      return { state: next, changes: attrChanges(user, attrs), events: [windowsEvent(next, EVENT_ID.passwordReset, ctx.actor, user.guid)], warnings: [] }
    },
  }
}

const objectMove: Handler<'object.move'> = (state, action, ctx) => {
  const target: DirObject | undefined = state.objects[action.target]
  const parent: DirObject | undefined = state.objects[action.newParent]
  if (!target) return fail('notFound', 'The object to move was not found.')
  if (!parent) return fail('notFound', 'The target container was not found.')
  return {
    needs: [{ within: target.parent, objectClass: target.objectClass, target: target.guid }, { within: parent.guid, objectClass: target.objectClass }],
    touches: [target.guid],
    apply: () => {
      if (target.parent === null) return fail('invalid', 'The domain root cannot be moved.')
      if (!CONTAINER_CLASSES.has(parent.objectClass)) return fail('invalid', 'The target must be a container or an organizational unit.')
      if (target.parent === parent.guid) return noChange(state, 'The object is already in this container.')
      const siblings = state.indexes.childrenByParent[String(parent.guid)] ?? []
      if (siblings.some((guid) => lower(state.objects[guid].rdn) === lower(target.rdn))) return fail('conflict', `An object named ${target.rdn} already exists in the target container.`)
      const before = deriveDn(state, target.guid)
      const next = moveObject(state, target.guid, parent.guid)
      const after = deriveDn(next, target.guid)
      return {
        state: next,
        changes: [{ kind: 'location', target: target.guid, key: 'distinguishedName', before, after }],
        events: [simulatorEvent(next, 'object.move', ctx.actor, target.guid, { fromDn: before, toDn: after })],
        warnings: [],
      }
    },
  }
}

function groupPair(state: DomainState, groupGuid: Guid, memberGuid: Guid): { group: DirObject; member: DirObject } | Failure {
  const group: DirObject | undefined = state.objects[groupGuid]
  const member: DirObject | undefined = state.objects[memberGuid]
  if (!group) return fail('notFound', 'The group was not found.')
  if (group.objectClass !== 'group') return fail('invalid', 'The target is not a group.')
  if (!member) return fail('notFound', 'The member object was not found.')
  return { group, member }
}

function membershipEvent(state: DomainState, ids: Record<'Global' | 'DomainLocal' | 'Universal', number>, kind: string, group: DirObject, member: DirObject, ctx: ActionCtx): EventDraft {
  const scope = groupScope(group) ?? 'Global'
  const data = { memberName: String(member.attrs.sAMAccountName ?? member.rdn), memberDn: deriveDn(state, member.guid), memberSid: member.sid ?? '', groupScope: scope, groupCategory: groupCategory(group) }
  // Only security groups use the Windows event IDs in this slice. A distribution group change is simulator activity.
  return groupCategory(group) === 'Security' ? windowsEvent(state, ids[scope], ctx.actor, group.guid, data) : simulatorEvent(state, kind, ctx.actor, group.guid, data)
}

const groupAddMember: Handler<'group.addMember'> = (state, action, ctx) => {
  const pair = groupPair(state, action.group, action.member)
  if (isFailure(pair)) return pair
  const { group, member } = pair
  return {
    needs: [{ within: group.parent, objectClass: 'group', target: group.guid }],
    // A membership form shows the group and the member, so a change to either one makes the save stale.
    touches: [group.guid, member.guid],
    apply: () => {
      const scope = groupScope(group)
      const kind = memberKind(member)
      if (!scope) return fail('invalid', 'The group has no valid scope.')
      if (group.guid === member.guid) return fail('invalid', 'A group cannot be a member of itself.')
      if (!kind || !member.sid) return fail('invalid', 'Only users, computers, and groups can be group members.')
      if (!canNest(scope, kind)) return fail('invalid', `A ${scope} group cannot contain a ${kind} ${member.objectClass === 'group' ? 'group' : 'account'}.`)
      if (isPrimaryGroupOf(group, member)) return fail('conflict', 'This group is already the primary group of the account.')
      if (state.memberships.some((row) => row.group === group.guid && row.member === member.guid)) return fail('conflict', 'The object is already a member of this group.')
      if (member.objectClass === 'group' && containsGroup(state, member.guid, group.guid)) return fail('invalid', 'This would make the two groups members of each other.')
      const next = { ...patch(state, group.guid, {}), memberships: [...state.memberships, { group: group.guid, member: member.guid }] }
      const warnings: ActionWarning[] = groupCategory(group) === 'Distribution'
        ? [{ code: 'notPermissionBearing', message: 'This is a distribution group. Membership in it never grants access to a resource.' }]
        : []
      return {
        state: next,
        changes: [{ kind: 'membership', target: group.guid, key: 'member', before: undefined, after: deriveDn(state, member.guid) }],
        events: [membershipEvent(next, MEMBER_ADDED, 'group.addMember', group, member, ctx)],
        warnings,
      }
    },
  }
}

const groupRemoveMember: Handler<'group.removeMember'> = (state, action, ctx) => {
  const pair = groupPair(state, action.group, action.member)
  if (isFailure(pair)) return pair
  const { group, member } = pair
  return {
    needs: [{ within: group.parent, objectClass: 'group', target: group.guid }],
    // A membership form shows the group and the member, so a change to either one makes the save stale.
    touches: [group.guid, member.guid],
    apply: () => {
      if (isPrimaryGroupOf(group, member)) return fail('invalid', 'This group is the primary group of the account. A primary group cannot be removed as a membership.')
      if (!state.memberships.some((row) => row.group === group.guid && row.member === member.guid)) return fail('notFound', 'The object is not a direct member of this group.')
      const next = { ...patch(state, group.guid, {}), memberships: state.memberships.filter((row) => !(row.group === group.guid && row.member === member.guid)) }
      return {
        state: next,
        changes: [{ kind: 'membership', target: group.guid, key: 'member', before: deriveDn(state, member.guid), after: undefined }],
        events: [membershipEvent(next, MEMBER_REMOVED, 'group.removeMember', group, member, ctx)],
        warnings: [],
      }
    },
  }
}

const clockAdvance: Handler<'clock.advance'> = (state, action, ctx) => ({
  needs: [],
  touches: [],
  apply: () => {
    if (!Number.isSafeInteger(action.milliseconds) || action.milliseconds <= 0) return fail('invalid', 'The lab clock can only move forward by a whole number of milliseconds.')
    if (!Number.isSafeInteger(state.now + action.milliseconds)) return fail('invalid', 'The lab clock cannot move that far forward.')
    const next = { ...state, now: state.now + action.milliseconds }
    return {
      state: next,
      changes: [{ kind: 'clock', key: 'now', before: state.now, after: next.now }],
      events: [simulatorEvent(next, 'clock.advance', ctx.actor, undefined, { milliseconds: String(action.milliseconds) })],
      warnings: [],
    }
  },
})

/** Tier 1 handlers. T01 built the directory and clock handlers; T04 added `acl.*` and `session.*`. */
export const handlers: { [T in ActionType]?: Handler<T> } = {
  'user.create': userCreate,
  'user.setAttrs': userSetAttrs,
  'user.setEnabled': userSetEnabled,
  'user.unlock': userUnlock,
  'user.resetPassword': userResetPassword,
  'object.move': objectMove,
  'group.addMember': groupAddMember,
  'group.removeMember': groupRemoveMember,
  'clock.advance': clockAdvance,
  'acl.addEntry': aclAddEntry,
  'acl.removeEntry': aclRemoveEntry,
  'session.signIn': sessionSignIn,
  'session.end': sessionEnd,
}
