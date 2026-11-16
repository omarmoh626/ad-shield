import { readdir, readFile } from 'node:fs/promises'
import { join } from 'node:path'

async function filesUnder(directory) {
  let entries
  try {
    entries = await readdir(directory, { withFileTypes: true })
  } catch {
    return []
  }
  const nested = await Promise.all(entries.map(async (entry) => {
    const path = join(directory, entry.name)
    return entry.isDirectory() ? filesUnder(path) : [path]
  }))
  return nested.flat()
}

const safety = /\beval\s*\(|\bnew\s+Function\b|\bfetch\s*\(|XMLHttpRequest|WebSocket|child_process/
const nonLiteralImport = /\bimport\s*\(\s*([^)]*?)\s*\)/gs
const literalArgument = (argument) => /^(?:'(?:\\.|[^'\\])*'|"(?:\\.|[^"\\])*")$/.test(argument) || (argument.startsWith('`') && argument.endsWith('`') && !argument.includes('${'))
const purity = /\bDate\.now\b|\bnew\s+Date\s*\(|\bMath\.random\b|\bsetTimeout\b|\bsetInterval\b|\blocalStorage\b|\bwindow\.|\bdocument\./
const pureDirectories = ['src/domain', 'src/engine', 'src/access', 'src/ps', 'src/tickets']
const sourceFiles = await filesUnder('src')
const pureFiles = (await Promise.all(pureDirectories.map(filesUnder))).flat()
let failed = false

for (const path of sourceFiles) {
  const content = await readFile(path, 'utf8')
  if (safety.test(content) || [...content.matchAll(nonLiteralImport)].some((match) => !literalArgument(match[1].trim()))) {
    console.error(`${path}: safety pattern found`)
    failed = true
  }
}
for (const path of pureFiles) {
  const content = await readFile(path, 'utf8')
  if (purity.test(content)) {
    console.error(`${path}: purity pattern found`)
    failed = true
  }
}
if (failed) process.exitCode = 1
