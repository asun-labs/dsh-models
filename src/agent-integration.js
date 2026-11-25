import { createRequire } from 'node:module'
import { join } from 'node:path'
import { fileURLToPath, pathToFileURL } from 'node:url'
import { loadSkill } from './skill.js'

export async function importMcpClient(profile) {
  for (const anchor of [profile.installAnchor, join(profile.dir, 'package.json')]) {
    try { return await import(pathToFileURL(createRequire(anchor).resolve('@deepseek-ai/dsh-mcp-client')).href) }
    catch (error) { if (!['MODULE_NOT_FOUND', 'ERR_MODULE_NOT_FOUND'].includes(error.code)) throw error }
  }
  throw new Error('宿主未提供原生 MCP client，资产 MCP 无法接入会话。')
}

export function registerAgentIntegration(ctx, { importClient = importMcpClient, skill = loadSkill } = {}) {
  ctx.inject(['skills'], async scope => {
    let active = true
    scope.effect(() => () => { active = false })
    const definition = await skill()
    if (active) scope.skills.register(definition)
  })
  ctx.inject(['tools', 'workingDirectory', 'profileContext'], scope => {
    let active = true, client
    const fibers = new Set(), pending = new Set()
    scope.effect(() => async () => {
      active = false
      await Promise.allSettled([...fibers].map(fiber => fiber.dispose()))
      await Promise.allSettled([...pending])
    })
    scope.on('agent/created', ({ agent, signal }) => {
      const operation = (async () => {
        client ??= importClient(scope.profileContext)
        const [plugin, cwd] = await Promise.all([client, scope.workingDirectory.ensure(agent, signal)])
        signal?.throwIfAborted()
        if (!active) return
        const fiber = agent.ctx.plugin(plugin, plugin.Config({ transport: 'stdio', serverName: 'dsh_models',
          command: process.execPath, args: [fileURLToPath(new URL('./mcp.cjs', import.meta.url)), '--workspace', cwd], cwd,
          env: process.versions.electron ? { ELECTRON_RUN_AS_NODE: '1' } : {}, failOnStartupError: true,
          startupTimeoutMs: 30000, toolCallTimeoutMs: 150000, reconnect: { enabled: false } }))
        fibers.add(fiber)
        agent.ctx.effect(() => () => { fibers.delete(fiber) })
        try {
          await fiber
          if (!active || signal?.aborted) { await fiber.dispose(); signal?.throwIfAborted() }
        } catch (error) { fibers.delete(fiber); await fiber.dispose(); throw error }
      })().catch(error => { if (active) throw error })
      pending.add(operation)
      return operation.finally(() => pending.delete(operation))
    })
  })
}
