import { apply as applyModels } from './client-api.jsx'
export { inject } from './client-api.jsx'

// 原生 Loader 第二参是同步配置；宿主集成回调只由 client-api 显式接收。
export function apply(ctx) {
  return applyModels(ctx)
}
