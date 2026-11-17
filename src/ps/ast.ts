import type { SourcePosition } from './errors'

export type Expr = LiteralExpr | VariableExpr | PropertyExpr | ArrayExpr | HashtableExpr | ScriptBlockExpr | SplatExpr | UnaryExpr | BinaryExpr
export interface BaseNode extends SourcePosition { kind: string }
export interface LiteralExpr extends BaseNode { kind: 'literal'; value: string | number | boolean | null; quote?: 'single' | 'double'; expandable?: boolean; parts?: ({ kind: 'text'; value: string; line: number; column: number } | { kind: 'variable'; name: string; line: number; column: number })[] }
export interface VariableExpr extends BaseNode { kind: 'variable'; name: string; automatic?: boolean }
export interface PropertyExpr extends BaseNode { kind: 'property'; target: Expr; name: string }
export interface ArrayExpr extends BaseNode { kind: 'array'; items: Expr[] }
export interface HashtableExpr extends BaseNode { kind: 'hashtable'; entries: { key: string; value: Expr; line: number; column: number }[] }
export interface ScriptBlockExpr extends BaseNode { kind: 'scriptBlock'; statements: Statement[] }
export interface SplatExpr extends BaseNode { kind: 'splat'; variable: VariableExpr }
export interface UnaryExpr extends BaseNode { kind: 'unary'; operator: string; operand: Expr }
export interface BinaryExpr extends BaseNode { kind: 'binary'; operator: string; left: Expr; right: Expr }
export interface Argument extends BaseNode { value: Expr }
export interface Parameter extends BaseNode { name: string; value?: Expr; switch: boolean; colon: boolean }
export interface Command extends BaseNode { kind: 'command'; name: string; expression?: Expr; parameters: Parameter[]; arguments: Argument[] }
export interface Assignment extends BaseNode { kind: 'assignment'; target: VariableExpr; value: Pipeline }
export interface Pipeline extends BaseNode { kind: 'pipeline'; commands: Command[] }
export interface Statement extends BaseNode { kind: 'statement'; pipeline: Pipeline | Assignment }
export interface Script extends BaseNode { kind: 'script'; statements: Statement[] }
