---
name: dsh-models-use
description: 为场景、家装、设备或装备任务检索三维资产，核对来源许可，下载到会话工作区并在本地 Three.js 查看器验证模型。
---

# 三维资产检索与使用

此技能配合 dsh-models MCP 使用。先确认工具可用：原生 DSH 中名称通常为 `mcp__dsh_models__assets_search` 等；其他 MCP 客户端以实际发现的 server 前缀为准。技能自身不执行下载或渲染。

1. 用 `assets_catalog` 获取真实来源与子类；用 `assets_search` 搜索。大类为 `home` 家装、`devices` 设备、`equipment` 装备、`misc` 杂。先以小批结果搜索，必要时按 offset 分页，不凭空拼接模型 ID 或下载 URL。
2. 对候选调用 `assets_get`，查看格式、作者、`license`、`licenseUrl`、`attribution` 和 `usageNotes`。NASA 使用规范不是 CC0，Khronos 逐项许可可能不同；资源数量不是完整装备或工程质量保证。
3. 只需文件时调用 `assets_download`。它写入 MCP 已绑定的会话工作区，工具参数不接受任意目录。返回实际路径及 `.source.json` 记录；后续再分发须保留原作者、许可链接和修改说明。
4. 需要查看时调用 `assets_use`，保留任务 `id`，用当前宿主实际可用的浏览器或右侧浏览器能力打开返回的 `viewerUrl`。若没有打开浏览器的工具，将链接交给用户，不声称已经打开。该链接仅用于当前本机、当前任务，不转发到公开页面或日志。
5. 调用 `assets_status` 核对状态。`downloading` 是实际字节传输，`downloaded` 仅指文件完成；`ready` 且含 meshes 指本地 Three.js 已实际解析出几何并渲染首帧。未打开查看器时停在 `downloaded` 是正常现象。解析阶段无可信百分比时显示不定进度，不用等待秒数推算。
6. 明确失败原因后再重试；用户取消、改选模型或结束不需要的预览时调用 `assets_cancel`。取消撤销任务访问，不删除已经下载的工作区文件。

GLB 使用本地 GLTFLoader。SAVAGE 的原始 X3D 会保留，预览采用来源页明确提供的 VRML97 同源文件，并按实际引用取得同源 Inline 部件与安全位图。Three.js 只做静态几何查看，不执行 Script/ROUTE 交互；PROTO/EXTERNPROTO、超出依赖限额、外域依赖、未支持的压缩扩展或无几何时可能失败。报告实际兼容性，保留原始文件并提供来源页，不能用空画布或下载完成冒充模型可用。

MCP 会话绑定的工作目录由宿主决定。独立客户端配置 `node <插件>/lib/mcp.cjs --workspace <绝对工作区路径>`，不要在模型下载工具参数中指定其他工作区。界面“使用”则遵循左侧当前工作区优先、无选择时应用登记默认工作区的规则。
