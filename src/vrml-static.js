/** 为 Three.js 生成静态解析输入；不改写保存的原始文件，也不执行事件路由。 */
export function staticVrml(text) {
  let unsupported = false
  const output = text.replace(/"(?:\\[\s\S]|[^"\\])*"|#[^\r\n]*|\b(?:EXTERNPROTO|PROTO)\s+[^\s{}\[\],"]+|\bInline\s*\{|\bROUTE\s+[^\s{}\[\],"]+\s+TO\s+[^\s{}\[\],"]+/g, (token, offset) => {
    if (token.startsWith('#VRML') && offset > 0) return '# Inline source: VRML97'
    if (token.startsWith('"') || token.startsWith('#')) return token
    if (token.startsWith('ROUTE')) return ''
    unsupported = true
    return token
  })
  if (unsupported) throw new Error('该 VRML 使用 Inline/PROTO 外部场景或原型，当前 Three.js 静态查看器不支持完整加载。原始文件已保存。')
  // 场景背景会被 VRMLLoader 构造成超大球体，不能把它当模型参与自动取景。
  const tokens = [...output.matchAll(/"(?:\\[\s\S]|[^"\\])*"|#[^\r\n]*|[{}]|[^\s,{}"]+/g)].filter(match => !match[0].startsWith('#'))
  const edits = []
  for (let i = 0; i < tokens.length - 1; i++) {
    if (tokens[i][0] !== 'Background' || tokens[i + 1][0] !== '{') continue
    let depth = 1, end = i + 2
    for (; end < tokens.length && depth; end++) { if (tokens[end][0] === '{') depth++; if (tokens[end][0] === '}') depth-- }
    if (depth) throw new Error('VRML 背景节点结构不完整。')
    edits.push({ start: tokens[i].index, end: tokens[end - 1].index + 1 }); i = end - 1
  }
  let scene = output
  for (const edit of edits.reverse()) scene = scene.slice(0, edit.start) + 'Group {}' + scene.slice(edit.end)
  return scene
}
