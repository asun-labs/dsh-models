# 多源资产来源与许可

本插件仅分发元数据索引、界面及 CC0 资产的派生缩略图，不分发远端模型本体。下载文件仍以原作者许可为准，不代表原机构背书。

- NPS SAVAGE：原始许可和 attribution 在 ../savage。单项模型的作者与依赖见其来源页。
- NASA-3D-Resources：固定 GitHub commit 11ebb4ee043715aefbba6aeec8a61746fad67fa7 的 3D Models 目录，256 个 GLB；NASA-README.md 为原始说明。遵守 https://www.nasa.gov/nasa-brand-center/images-and-media/ ，核对第三方材料、署名、肖像/标识等限制，不暗示 NASA 背书。NASA 使用规范不等同于 CC0 许可。
- Kenney Furniture Kit 2.0：Kenney 原作，https://kenney.nl/assets/furniture-kit ，CC0；GLB 使用 yuyou-dev/OpenHome3D 固定 commit cb52afc00201b4b7ed90b24631e977112ba07869 的资产镜像。kenney-LICENSE.txt 为资产原始许可，不使用应用代码的 MIT 许可判断资产。
- KayKit Furniture Bits 1.0 / Restaurant Bits 1.0：Kay Lousberg 原作，CC0，使用同一 OpenHome3D commit 中的 GLB 镜像。kaykit-*-LICENSE.txt 为资产原始许可。原作 https://github.com/KayKit-Game-Assets/KayKit-Furniture-Bits-1.0 和 https://kaylousberg.itch.io/restaurant-bits 。原始 glTF 与镜像 GLB 可能格式不同，本插件不宣称拥有或制作原模型。
- KhronosGroup/glTF-Sample-Assets：固定 commit e124e8d8d7330a5372bc2b4d00d39a4a9d7997ea；仅精选逐项 metadata 中所有权利项均为 CC0-1.0 或 CC-BY-4.0 且有 GLB 的资源。每项 metadata.json 和 README.md 在本目录保留；原文中的作者、具体贡献范围、原始作品 URL 和许可链接同时写入索引及下载的 .source.json。CC BY 资源再使用时须保留署名、许可链接及修改说明；本插件不改动模型文件。

337 张家具与设备 PNG 缩略图由各自 CC0 GLB 在无头 Three.js 渲染器中生成，位于 src/thumbnails.json 并编入客户端。Three.js 为 MIT；它仅作为开发工具，不作为插件运行依赖。其他预览图按源站链接按需加载，版权及许可随对应资源保留。截图失败显示占位，不以其他资源的图片替代。

同步：py -3 scripts/sync-github.py；缩略图：node scripts/render-thumbnails.mjs。源版本和逐项归属字段在 src/github-catalog.json；升级固定 commit 时重新核验许可与路径。发布包中本目录随 third-party 一起保留。
