import React, { useEffect, useState } from 'react'

const labels = { queued: '等待下载', downloading: '下载原始模型', 'resolving-preview': '查找源站预览',
  'downloading-preview': '下载静态预览', downloaded: '等待查看器加载', loading: '解析与渲染', ready: '已加载', error: '使用失败', cancelled: '已取消' }

export function AssetUsePage({ model, useModel, getUseStatus, cancelUse, onBack }) {
  const [attempt, setAttempt] = useState(0)
  const [state, setState] = useState({ phase: 'starting' })
  useEffect(() => {
    let active = true, jobId, timer
    setState({ phase: 'starting' })
    async function poll() {
      try {
        const value = await getUseStatus(jobId)
        if (!active) return
        setState(value)
        if (!['ready', 'error', 'cancelled'].includes(value.phase)) timer = setTimeout(poll, 400)
      } catch (error) { if (active) setState(value => ({ ...value, phase: 'error', error: error.message })) }
    }
    async function start() {
      try {
        if (!useModel || !getUseStatus || !cancelUse) throw new Error('使用服务不可用，请重新加载完整插件包。')
        // 不丢弃迟到的开始响应：离开页面后取得任务 ID 即取消，避免留下无人管理的下载。
        const value = await useModel(model.id)
        jobId = value.id
        if (!active) { await cancelUse(jobId); return }
        const url = new URL(value.viewerUrl)
        if (url.protocol !== 'http:' || url.hostname !== '127.0.0.1') throw new Error('本地查看器地址无效。')
        setState(value)
        timer = setTimeout(poll, 250)
      } catch (error) { if (active) setState({ phase: 'error', error: error.message }) }
    }
    void start()
    return () => {
      active = false; clearTimeout(timer)
      if (jobId) void cancelUse(jobId).catch(() => {})
    }
  }, [model.id, attempt, useModel, getUseStatus, cancelUse])
  return <main className="seal-models-use-page" data-seal-panel="dsh-models">
    <header><div><span>资产库 / 本地 Three.js 查看器</span><h1>{model.name}</h1></div>
      <button type="button" onClick={onBack}>{state.phase === 'ready' ? '返回资产库' : '取消并返回资产库'}</button></header>
    <div className="seal-models-use-state" role="status">{labels[state.phase] ?? '正在创建使用任务…'}
      {state.progress && <span>{(state.progress.received / 1048576).toFixed(2)} MB{state.progress.total > 0 ? ` / ${(state.progress.total / 1048576).toFixed(2)} MB` : ' · 总大小未知'}</span>}</div>
    {state.viewerUrl && <iframe key={state.id} src={state.viewerUrl} title="Three.js 本地资产查看器" referrerPolicy="no-referrer"
      sandbox="allow-scripts allow-same-origin allow-popups allow-popups-to-escape-sandbox" />}
    {!state.viewerUrl && state.phase !== 'error' && <div className="seal-models-use-wait">正在连接本地服务…</div>}
    {state.error && <div className="seal-models-use-error" role="alert"><p>{state.error}</p><button type="button" onClick={() => setAttempt(value => value + 1)}>重试使用</button></div>}
    {state.result && <p className="seal-models-use-path">文件：{state.result.path}</p>}
  </main>
}
