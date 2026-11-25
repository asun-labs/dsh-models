import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'

export const skillUrl = new URL('./skills/dsh-models-use/SKILL.md', import.meta.url)
export async function loadSkill() {
  const text = await readFile(skillUrl, 'utf8')
  const match = /^---\r?\nname: ([^\r\n]+)\r?\ndescription: ([^\r\n]+)\r?\n---\r?\n([\s\S]*)$/.exec(text)
  if (!match) throw new Error('资产技能元信息无效。')
  return { name: match[1], description: match[2], content: match[3], source: 'bundled', path: fileURLToPath(skillUrl) }
}
