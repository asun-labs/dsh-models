import assert from 'node:assert/strict'
import test from 'node:test'
import { registerAgentIntegration } from '../src/agent-integration.js'
import { loadSkill } from '../src/skill.js'

function setup(options = {}) {
  const effects = [], agentEffects = [], listeners = new Map(), registrations = [], calls = [], pending = []
  const fibers = []
  const plugin = { Config: config => config }
  const ctx = { profileContext: { installAnchor: '/runtime/package.json', dir: '/profile' }, tools: {},
    skills: { register(skill) { registrations.push(skill); effects.push(() => registrations.splice(registrations.indexOf(skill), 1)) } },
    workingDirectory: { ensure: async agent => '/work/' + agent.id },
    inject(_deps, callback) { pending.push(Promise.resolve(callback(ctx))) },
    effect(callback) { effects.push(callback()) },
    on(name, callback) { listeners.set(name, callback); effects.push(() => listeners.delete(name)) },
  }
  function agent(id, hold = false) {
    return { id, ctx: {
      effect(callback) { agentEffects.push(callback()) },
      plugin(received, config) {
        assert.equal(received, plugin); calls.push(config)
        let resolve; const ready = hold ? new Promise(done => { resolve = done }) : Promise.resolve()
        const fiber = { disposed: false, async dispose() { fiber.disposed = true; resolve?.() }, then(done, reject) { return ready.then(() => done(undefined), reject) } }
        fibers.push(fiber); return fiber
      },
    } }
  }
  registerAgentIntegration(ctx, { importClient: async () => plugin, ...options })
  return { calls, registrations, agent, fibers, ready: () => Promise.all(pending), create: value => listeners.get('agent/created')({ agent: value }),
    close: async () => { for (const effect of effects.reverse()) await effect?.() } }
}

test('技能真实元信息可加载，按每个会话目录挂载 MCP，卸载关闭自己的会话连接', async () => {
  const state = setup()
  await state.ready()
  assert.equal(state.registrations[0].name, 'dsh-models-use')
  assert.match(state.registrations[0].content, /assets_status/)
  await state.create(state.agent('first')); await state.create(state.agent('second'))
  assert.deepEqual(state.calls.map(config => config.cwd), ['/work/first', '/work/second'])
  for (const config of state.calls) { assert.equal(config.serverName, 'dsh_models'); assert.equal(config.command, process.execPath); assert.deepEqual(config.args.slice(-2), ['--workspace', config.cwd]) }
  await state.close()
  assert.ok(state.fibers.every(fiber => fiber.disposed)); assert.equal(state.registrations.length, 0)
  assert.equal((await loadSkill()).source, 'bundled')
})

test('MCP 初始化尚未结束时卸载，立即关闭已创建的 Fiber 并等待退出', async () => {
  const state = setup(); await state.ready()
  const startup = state.create(state.agent('pending', true))
  await new Promise(resolve => setImmediate(resolve))
  assert.equal(state.fibers.length, 1)
  await state.close(); await startup
  assert.equal(state.fibers[0].disposed, true)
})

test('异步技能读取晚于卸载时，不再向已释放的插件注册', async () => {
  let release
  const skill = new Promise(resolve => { release = resolve })
  const state = setup({ skill: () => skill })
  await state.close(); release(await loadSkill()); await state.ready()
  assert.equal(state.registrations.length, 0)
})
