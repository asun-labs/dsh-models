# 内置查看器与智能体接口

- Three.js 0.180.0（MIT）随本地 viewer bundle 交付，用于 GLB 和 VRML97 静态几何展示；原始许可证见 runtime/three 与 github/Three-LICENSE.txt。查看器不依赖 CDN。
- Three.js 的 VRMLLoader 使用其内嵌 Chevrotain 9.0.1 解析器；Chevrotain、@chevrotain/types、@chevrotain/utils 为 Apache-2.0，regexp-to-ast 为 MIT。原始 LICENSE/NOTICE 与归档摘要在 viewer-libs；这些是对应版本系列的原始许可证据，Three.js 中实际嵌入代码由其固定 npm 包和 package-lock.json 锁定。
- Three.js 的 MeshoptDecoder 来自 meshoptimizer 0.22（Arseny Kapoulkine，MIT），用于兼容 glTF 网格压缩，代码已编入本地查看器；许可见 viewer-libs/meshoptimizer。
- MCP 使用官方 @modelcontextprotocol/sdk 1.32.2。SDK 和其实际编入的 zod、ajv 等依赖原始许可及版本/文件摘要由构建插件写入 runtime/provenance.json；该目录随完整包复制，不要求安装环境再次下载这些 npm 包。
- HTML 解析使用 parse5 及 entities，原始许可同样保留于 runtime。

资产本体的版权与许可没有转移。预览所需 VRML、Inline 部件、位图只从原始文件明确引用的 savage.nps.edu/Savage/ 来源获取；保留每项原始文件与 .source.json。展开后的预览另存文件，记录同源子场景展开、DEF/USE 命名空间及静态 ROUTE 忽略的修改说明，不覆盖原始 X3D/VRML。静态预览不执行原场景脚本，不代表完整交互行为兼容。
