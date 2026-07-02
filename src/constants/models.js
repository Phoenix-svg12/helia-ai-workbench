/**
 * 模型列表常量 —— 统一管理，避免在多个文件中重复定义。
 *
 * Helia 模型名是 UI 层的虚拟名称，通过 settings.modelMapping 映射到真实模型 ID。
 * tier 表示模型强度档位：flash（轻量）/ standard（标准）/ power（强力）/ local（本地）
 */
export const MODEL_OPTIONS = [
  { id: 'Helia-Flash',  label: 'Helia-Flash',  desc: '快速响应',     tier: 'flash',    tierLabel: '轻量', tierColor: 'green' },
  { id: 'Helia-Pro',    label: 'Helia-Pro',    desc: '通用能力强',   tier: 'standard', tierLabel: '标准', tierColor: 'blue' },
  { id: 'Helia-Reason', label: 'Helia-Reason', desc: '深度推理',     tier: 'power',    tierLabel: '强力', tierColor: 'purple' },
  { id: 'Helia-Local',  label: 'Helia-Local',  desc: '本地模型',     tier: 'local',    tierLabel: '本地', tierColor: 'grey' }
]

/** 模型 ID 列表（用于遍历映射等场景） */
export const HELIA_MODELS = MODEL_OPTIONS.map(m => m.id)

/** tier → 颜色类名映射（用于 UI 标识） */
export const TIER_STYLES = {
  flash:    { dot: 'bg-green-500',  text: 'text-green-600',    bg: 'bg-green-500/10',  label: '轻量' },
  standard: { dot: 'bg-blue-500',   text: 'text-blue-600',     bg: 'bg-blue-500/10',   label: '标准' },
  power:    { dot: 'bg-purple-500', text: 'text-purple-600',   bg: 'bg-purple-500/10', label: '强力' },
  local:    { dot: 'bg-grey-400',   text: 'text-grey-500',     bg: 'bg-grey-400/10',   label: '本地' },
}
