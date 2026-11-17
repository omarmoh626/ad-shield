import type { ScriptBlockExpr } from './ast'

export const HASHTABLE = 'System.Collections.Hashtable'
export const SCRIPTBLOCK = 'System.Management.Automation.ScriptBlock'
export const SECURE = 'System.Security.SecureString'

/** A typed pipeline object. `text` is what the object shows when it is turned into a string. */
export interface PsObject {
  typeName: string
  properties: Record<string, PsValue>
  text?: string
}

export interface PsScriptBlock extends PsObject {
  typeName: typeof SCRIPTBLOCK
  block: ScriptBlockExpr
}

/**
 * The result of simulated secure input. It holds the policy verdict only.
 * The characters the learner typed never reach the console runtime.
 */
export interface PsSecure extends PsObject {
  typeName: typeof SECURE
  credential: { policy: 'pass' | 'fail' }
}

export type PsValue = string | number | boolean | null | PsValue[] | PsObject

export interface PsErrorInfo {
  identity?: string
  line?: number
  column?: number
  help?: string
}

/** An error the console shows to the learner. `help` is a command the learner can run next. */
export class PsError extends Error {
  identity?: string
  line?: number
  column?: number
  help?: string
  constructor(message: string, info: PsErrorInfo = {}) {
    super(message)
    this.name = 'PsError'
    Object.assign(this, info)
  }
}

export function isObject(value: PsValue | undefined): value is PsObject {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

export function isScriptBlock(value: PsValue | undefined): value is PsScriptBlock {
  return isObject(value) && value.typeName === SCRIPTBLOCK
}

export function isHashtable(value: PsValue | undefined): value is PsObject {
  return isObject(value) && value.typeName === HASHTABLE
}

export function isSecure(value: PsValue | undefined): value is PsSecure {
  return isObject(value) && value.typeName === SECURE
}

export function typeNameOf(value: PsValue): string {
  if (value === null) return 'System.Object'
  if (typeof value === 'string') return 'System.String'
  if (typeof value === 'number') return Number.isInteger(value) ? 'System.Int32' : 'System.Double'
  if (typeof value === 'boolean') return 'System.Boolean'
  if (Array.isArray(value)) return 'System.Object[]'
  return value.typeName
}

/** Property names a value exposes, in display order. */
export function propertyNames(value: PsValue): string[] {
  if (typeof value === 'string') return ['Length']
  if (Array.isArray(value)) return ['Count', 'Length']
  if (isObject(value)) return Object.keys(value.properties)
  return []
}

/** Case-insensitive property read. Returns `undefined` when the value has no such property. */
export function getProperty(value: PsValue, name: string): PsValue | undefined {
  const wanted = name.toLowerCase()
  if (typeof value === 'string') return wanted === 'length' ? value.length : undefined
  if (Array.isArray(value)) {
    if (wanted === 'count' || wanted === 'length') return value.length
    // Member enumeration: a property read on a list reads that property from each item.
    const found = value.map((item) => getProperty(item, name)).filter((item): item is PsValue => item !== undefined)
    return found.length ? found : undefined
  }
  if (!isObject(value)) return undefined
  const key = Object.keys(value.properties).find((candidate) => candidate.toLowerCase() === wanted)
  return key === undefined ? undefined : value.properties[key]
}

/** The string form of a value, as PowerShell shows it inside a string or a table cell. */
export function toText(value: PsValue): string {
  if (value === null) return ''
  if (typeof value === 'string') return value
  if (typeof value === 'number') return String(value)
  if (typeof value === 'boolean') return value ? 'True' : 'False'
  if (Array.isArray(value)) return value.map(toText).join(' ')
  if (value.text !== undefined) return value.text
  const name = getProperty(value, 'Name')
  return typeof name === 'string' && !isHashtable(value) ? name : value.typeName
}

export function isTruthy(value: PsValue): boolean {
  if (value === null) return false
  if (typeof value === 'boolean') return value
  if (typeof value === 'number') return value !== 0
  if (typeof value === 'string') return value.length > 0
  if (Array.isArray(value)) return value.length === 1 ? isTruthy(value[0]) : value.length > 0
  return true
}

function asNumber(value: PsValue): number | undefined {
  if (typeof value === 'number') return value
  if (typeof value === 'string' && /^-?\d+(?:\.\d+)?$/.test(value.trim())) return Number(value)
  return undefined
}

/** Ordering used by -gt, -ge, -lt, -le. The left operand decides the comparison type. */
export function psCompare(left: PsValue, right: PsValue): number {
  if (typeof left === 'number') {
    const other = asNumber(right)
    if (other !== undefined) return left === other ? 0 : left < other ? -1 : 1
  }
  if (typeof left === 'boolean') return Number(left) - Number(isTruthy(right))
  const a = toText(left).toLowerCase(), b = toText(right).toLowerCase()
  return a === b ? 0 : a < b ? -1 : 1
}

/** Equality used by -eq and -ne. String comparison ignores case. */
export function psEquals(left: PsValue, right: PsValue): boolean {
  if (left === null || right === null) return left === right
  if (typeof left === 'boolean') return typeof right === 'boolean' ? left === right : left === isTruthy(right)
  if (isObject(left) || isObject(right)) return left === right
  return psCompare(left, right) === 0
}

/** Wildcard match for -like. Supports `*` and `?`, ignores case, and runs in linear space. */
export function wildcardMatch(pattern: string, text: string): boolean {
  const p = pattern.toLowerCase(), t = text.toLowerCase()
  let pi = 0, ti = 0, star = -1, mark = 0
  while (ti < t.length) {
    if (pi < p.length && (p[pi] === '?' || p[pi] === t[ti])) { pi++; ti++ }
    else if (pi < p.length && p[pi] === '*') { star = pi++; mark = ti }
    else if (star !== -1) { pi = star + 1; ti = ++mark }
    else return false
  }
  while (pi < p.length && p[pi] === '*') pi++
  return pi === p.length
}
