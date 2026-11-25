export function selectedWorkspaceId(ctx) {
  const workspaces = ctx.workspaces.list.getSnapshot()
  const sessions = ctx.sessions.list.getSnapshot()
  if (workspaces.phase !== 'ready' || sessions.phase !== 'ready') throw new Error('工作区尚未读取完成，请稍后重试。')
  const current = ctx.get?.('uiSession')?.adapter?.current?.value?.key
  // 本地明确选择优先于异步回传的 retainedBy，避免切换瞬间取到旧工作区。
  const active = current ? sessions.byId[current]
    : Object.values(sessions.byId).find(session => (session.retainedBy?.mainView ?? 0) > 0)
  if (current && !active) throw new Error('工作区切换尚未完成，请稍后重试。')
  const entries = [...workspaces.items, ...(workspaces.internalItems ?? [])]
  return active ? entries.find(workspace => workspace.sessionIds.includes(active.id))?.workspaceId : undefined
}
