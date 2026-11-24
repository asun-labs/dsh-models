# dsh-models

独立的 DSH 三维模型库插件，提供 NPS SAVAGE 分类目录、截图、来源与 X3D 下载链接。源码只在本工程维护；Seal Harness 引用完整预编译包与公开 client-api，不复制业务源码。

源码仓库：[asun-labs/dsh-models](https://github.com/asun-labs/dsh-models)。

## 开发与打包

Node 版本：^22.19.0 或 >=24.0.0。

```powershell
npm ci --ignore-scripts
npm test
npm run pack:release
```

完整包位于 dist/dsh-models-0.1.0.tgz，同时生成 .json 与 .sha256。包包含 Host、原生客户端、client-api.cjs、DSH bundle 与第三方许可；不包含 src、构建脚本或开发依赖，安装时无需编译。预编译包尚未发布到 GitHub Releases；package.json 的 private 标记保留，不发布到 npm。

原生 DSH 可通过插件管理器安装该本地 tgz，启用 bundle 后左侧出现“模型库”，右侧展示完整界面，不接管原生侧栏。宿主集成可调用 dsh-models/client-api 的 apply(ctx, {registerPanel(options, Panel)})，由宿主决定面板和导航注册；样式仍随插件生命周期释放。

## 更新目录

```powershell
py -3 scripts/sync-savage.py --help
py -3 scripts/sync-savage.py
```

脚本解析真实 href，不猜测下载路径。缺图条目保留；已明确返回 403/404 的详情保留条目并显示下载暂不可用；其他采集错误保留旧快照。可加 --cache-dir .build/savage-http 继续中断的本次采集，完整刷新时省略。

## 验证

```powershell
py -3 tests/test_sync_savage.py
npm run verify:browser
```

浏览器验证需要 Playwright Chromium，使用无头模式，不启动用户桌面窗口。截图写入 .build/browser。

## 数据与许可

目录包含 1233 条资源、22 个分类（2026-11-25 快照）。资源包括完整模型、零部件、场景和工具；X3D 可能依赖纹理或其他模型，当前提供原始文件链接，不递归打包依赖，不转换 GLB。

- 官方目录：https://savage.nps.edu/Savage/
- 源码：https://gitlab.nps.edu/Savage/Savage/-/tree/master
- 原始许可与 attribution：third-party/savage/

图片从源站按需加载，缺失或已知空图显示占位；模型和预览权利归原作者，使用具体资源时核对来源页条款。
