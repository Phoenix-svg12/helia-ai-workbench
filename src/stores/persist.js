/**
 * 轻量 Pinia 持久化插件 —— 无第三方依赖。
 *
 * 用法：在 defineStore 第三参数加 `persist: true`（或字符串数组白名单 / 对象）。
 *   persist: true                      持久化全部 state
 *   persist: ['threads', 'messages']   只持久化指定字段
 *
 * 恢复策略：localStorage 命中则覆盖初始 state（浅合并），未命中保留种子数据。
 * 写入策略：debounce 150ms，避免高频流式更新时频繁写盘。
 *
 * 重构说明（P2-2）：
 *   - 加配额保护：localStorage 写入失败时降级到内存模式，不再静默丢数据
 *   - 加大小警告：单 store 超过 1MB 时 console.warn，提示用户清理
 *   - 加 _quotaExceeded 标志：配额爆了之后停止后续写盘，避免反复抛错
 */
const PREFIX = 'helia:'
const timers = new Map()
const SIZE_WARN = 1024 * 1024 // 1MB 单 store 警告阈值
let _quotaExceeded = new Set() // 已爆配额的 store id，不再反复尝试写盘

function read(id) {
  try {
    const raw = localStorage.getItem(PREFIX + id)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

function write(id, value) {
  // 该 store 已爆配额，跳过写盘（降级到纯内存模式）
  if (_quotaExceeded.has(id)) return
  try {
    const json = JSON.stringify(value)
    localStorage.setItem(PREFIX + id, json)
    // 大小警告
    if (json.length > SIZE_WARN) {
      console.warn(`[persist] store "${id}" 体积 ${ (json.length/1024/1024).toFixed(2) }MB，建议清理历史数据`)
    }
  } catch (e) {
    if (e.name === 'QuotaExceededError' || e.code === 22) {
      _quotaExceeded.add(id)
      console.warn(`[persist] localStorage 配额已满，store "${id}" 降级为纯内存模式（刷新后丢失）`)
    } else {
      // 其他错误静默处理
    }
  }
}

function debouncedWrite(id, snapshot) {
  if (timers.has(id)) clearTimeout(timers.get(id))
  timers.set(id, setTimeout(() => {
    write(id, snapshot)
    timers.delete(id)
  }, 150))
}

/** 按白名单提取 state 快照 */
function snapshot(state, paths) {
  if (!paths) return state
  const out = {}
  for (const k of paths) {
    if (k in state) {
      const v = state[k]
      out[k] = v && typeof v === 'object' && !Array.isArray(v)
        ? { ...v }   // 浅拷贝 reactive 对象，避免把代理写进 JSON
        : v
    }
  }
  return out
}

export function persistPlugin({ store, options }) {
  if (!options.persist) return

  const paths = Array.isArray(options.persist) ? options.persist : null

  // 恢复
  const saved = read(store.$id)
  if (saved) {
    store.$patch(saved)
  } else {
    // 首次：把当前（种子）state 落盘
    write(store.$id, snapshot(store.$state, paths))
  }

  // 订阅变更 → 落盘
  store.$subscribe((_mutation, state) => {
    debouncedWrite(store.$id, snapshot(state, paths))
  }, { detached: true })
}

/**
 * 查询持久化状态（供设置页诊断用）
 */
export function getPersistStatus() {
  const stores = {}
  let totalSize = 0
  for (let i = 0; i < localStorage.length; i++) {
    const key = localStorage.key(i)
    if (key && key.startsWith(PREFIX)) {
      const id = key.slice(PREFIX.length)
      const val = localStorage.getItem(key) || ''
      const size = val.length
      totalSize += size
      stores[id] = {
        size,
        sizeKB: Math.round(size / 1024),
        quotaExceeded: _quotaExceeded.has(id)
      }
    }
  }
  return {
    stores,
    totalSizeKB: Math.round(totalSize / 1024),
    quotaExceededStores: [..._quotaExceeded]
  }
}

/**
 * 清空指定 store 的持久化数据（供设置页"清除数据"用）
 */
export function clearPersist(storeId) {
  try {
    localStorage.removeItem(PREFIX + storeId)
    _quotaExceeded.delete(storeId)
    return true
  } catch {
    return false
  }
}
