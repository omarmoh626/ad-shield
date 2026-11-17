export interface SourcePosition { line: number; column: number }
export interface ParseError extends SourcePosition { message: string; unsupported?: string }

export function parseError(message: string, line: number, column: number, unsupported?: string): ParseError {
  return { message, line, column, ...(unsupported ? { unsupported } : {}) }
}
