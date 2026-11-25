import savage from './savage-catalog.json' with { type: 'json' }
import github from './github-catalog.json' with { type: 'json' }
import { categoryLabels } from './catalog.js'

export const domains = [
  { id: 'home', label: '家装', subtitle: '让每一个角落，都有生活的样子', mark: '01' },
  { id: 'devices', label: '设备', subtitle: '从桌面到厨房，找到好用的物件', mark: '02' },
  { id: 'equipment', label: '装备', subtitle: '陆、海、空，与更远的宇宙', mark: '03' },
  { id: 'misc', label: '杂', subtitle: '那些不被定义的灵感，也值得收藏', mark: '04' },
]
export const sources = {
  savage: { id: 'savage', name: 'NPS SAVAGE', url: savage.sourceUrl, licenseNote: '逐项核对原作者及许可；原始 X3D 可能依赖外部纹理和部件。' },
  ...github.sources,
}
const featuredIds = ['kaykit-furniture/couch-pillows', 'kaykit-furniture/armchair', 'kenney/loungeDesignSofa', 'kaykit-furniture/bed-double-a',
  'kenney/desk', 'kenney/chairCushion', 'kenney/laptop', 'kenney/kitchenStoveElectric', 'kenney/kitchenCoffeeMachine']
const rank = id => { const index = featuredIds.indexOf(id); return index < 0 ? featuredIds.length : index }
export const assetCatalog = {
  indexedAt: github.indexedAt,
  sources,
  models: [
    ...github.models,
    ...savage.models.map(model => ({ ...model, domain: 'equipment', sourceId: 'savage', license: 'SAVAGE 许可',
      author: 'SAVAGE 模型作者（见来源）', attribution: `NPS SAVAGE — ${model.name}; original authors and license: ${model.sourcePage}`,
      usageNotes: sources.savage.licenseNote })),
  ].sort((left, right) => rank(left.id) - rank(right.id)),
}

export function filterAssets(models, { domain, sourceId = '', category = '', query = '' }) {
  const normalize = text => text.toLocaleLowerCase().replace(/[\s_-]+/g, '')
  const search = normalize(query.trim())
  return models.filter(model => (!domain || (model.domain ?? 'equipment') === domain)
    && (!sourceId || (model.sourceId ?? 'savage') === sourceId)
    && (!category || model.category === category)
    && (!search || normalize(`${model.name} ${model.description} ${model.id} ${model.author ?? ''} ${categoryLabels[model.category] ?? ''}`).includes(search)))
}
