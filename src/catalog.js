export const categoryLabels = {
  AircraftFixedWing: '固定翼飞机', AircraftHelicopters: '直升机', AmphibiousVehicles: '两栖车辆',
  AuvWorkbench: '水下航行器工作台', Avatars: '人物', Biologics: '生物', Buildings: '建筑',
  CommunicationsAndSensors: '通信与传感器', Environment: '环境', GroundVehicles: '地面车辆',
  HarborEquipment: '港口设施', Locations: '地理场景', ModelDetailing: '模型细节',
  OffshoreStructures: '海上结构', Robots: '机器人与无人平台', Scenarios: '演示场景',
  ShipsCivilian: '民用船舶', ShipsMilitary: '军用舰船', Space: '航天', Submarines: '潜艇',
  Tools: '制作工具', Weapons: '武器',
}

export function categories(models) {
  const counts = new Map()
  for (const model of models) counts.set(model.category, (counts.get(model.category) ?? 0) + 1)
  return [...counts].map(([id, count]) => ({ id, label: categoryLabels[id] ?? id, count }))
}

const normalize = text => text.toLocaleLowerCase().replace(/[\s_-]+/g, '')

export function filterModels(models, category, query) {
  const search = normalize(query.trim())
  return models.filter(model => (!category || model.category === category)
    && (!search || normalize(`${model.name} ${model.description} ${model.id} ${categoryLabels[model.category] ?? ''}`).includes(search)))
}
