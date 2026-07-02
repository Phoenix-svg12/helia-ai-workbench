/**
 * 定时调度器 —— 真实实现 daily/weekly 任务的定时触发。
 *
 * 重构说明（P1-1）：
 *   - 替代原来"定时仅为演示，需手动触发"的占位
 *   - 基于 setInterval 轮询，扫描所有 trigger=daily/weekly 的任务
 *   - daily: 每天首次启动后触发一次（记录 lastRunDate）
 *   - weekly: 每周一首次启动后触发一次
 *   - 应用启动时调用 init()，提供 getScheduleStatus() 查询
 */

import { useTaskStore } from '@/stores/tasks'

const POLL_INTERVAL = 60 * 1000 // 每分钟检查一次
const DAY_MS = 24 * 60 * 60 * 1000
const WEEK_MS = 7 * DAY_MS

let _timer = null

// 持久化 lastRunDate 到 localStorage，避免每次刷新都重复触发
function _readDate(key) {
  try { return localStorage.getItem(key) || null } catch { return null }
}
function _writeDate(key, val) {
  try { localStorage.setItem(key, val) } catch {}
}

let _lastDailyDate = _readDate('helia:scheduler:daily')   // 'YYYY-MM-DD'
let _lastWeeklyDate = _readDate('helia:scheduler:weekly')  // 'YYYY-MM-DD'

function todayStr() {
  const d = new Date()
  return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0')
}

function isMonday() {
  return new Date().getDay() === 1
}

function isSameWeek(dateStr) {
  if (!dateStr) return false
  const d = new Date(dateStr)
  const now = new Date()
  // 简单判断：相差小于 7 天且当前是周一之后
  return (now - d) < WEEK_MS && now.getDay() >= 1
}

/**
 * 初始化调度器。应用启动时调用一次。
 * 幂等：重复调用会先停掉旧 timer。
 */
export function initScheduler() {
  if (_timer) {
    clearInterval(_timer)
  }
  // 一次性清理：移除标题中 "· 定时" 出现 2 次以上的级联重复任务
  _cleanupCascadedTasks()
  // 启动时立即检查一次
  _checkAndDispatch()
  _timer = setInterval(_checkAndDispatch, POLL_INTERVAL)
  console.log('[scheduler] 定时调度器已启动，每分钟检查一次')
}

/**
 * 清理过期的定时任务副本（创建超过24小时的 "· 定时" 副本）
 */
function _cleanupCascadedTasks() {
  try {
    const tasks = useTaskStore()
    const now = Date.now()
    const DAY = 24 * 60 * 60 * 1000
    const before = tasks.list.length
    const toRemove = []
    tasks.list.forEach(t => {
      // 清理标题含 "· 定时" 且创建超过24小时的旧副本
      if (t.title.includes('· 定时') || t.title.includes('· 手动触发')) {
        const created = t.createdAtTs || 0
        // 如果没有时间戳，用标题中的信息判断——只要包含"定时"就清理超过1天的
        if (created && (now - created) > DAY) {
          toRemove.push(t.id)
        }
      }
    })
    toRemove.forEach(id => tasks.remove(id))
    if (toRemove.length) {
      console.log(`[scheduler] 清理了 ${toRemove.length} 个过期定时任务副本（${before} → ${tasks.list.length}）`)
    }
  } catch (e) {
    console.warn('[scheduler] 清理失败：', e.message)
  }
}

/**
 * 停止调度器
 */
export function stopScheduler() {
  if (_timer) {
    clearInterval(_timer)
    _timer = null
  }
}

/**
 * 检查并派发到期的定时任务
 */
function _checkAndDispatch() {
  try {
    const tasks = useTaskStore()
    const today = todayStr()

    // daily 任务：今天还没跑过 → 跑所有 trigger=daily 的任务
    if (_lastDailyDate !== today) {
      const dailyTasks = tasks.list.filter(t => t.trigger === 'daily' && t.status !== 'running')
      if (dailyTasks.length) {
        _lastDailyDate = today
        _writeDate('helia:scheduler:daily', today)
        console.log(`[scheduler] 触发 ${dailyTasks.length} 个每日任务`)
        dailyTasks.forEach(t => {
          // 重新创建一个新任务实例执行（trigger=manual 避免被再次调度）
          tasks.create({
            title: t.title + ' · 定时',
            agentId: t.agentId,
            input: t.input,
            trigger: 'manual'
          }, { autoExecute: true })
        })
      }
    }

    // weekly 任务：今天是周一且本周还没跑过 → 跑所有 trigger=weekly 的任务
    if (isMonday() && !isSameWeek(_lastWeeklyDate)) {
      const weeklyTasks = tasks.list.filter(t => t.trigger === 'weekly' && t.status !== 'running')
      if (weeklyTasks.length) {
        _lastWeeklyDate = today
        _writeDate('helia:scheduler:weekly', today)
        console.log(`[scheduler] 触发 ${weeklyTasks.length} 个每周任务`)
        weeklyTasks.forEach(t => {
          tasks.create({
            title: t.title + ' · 定时',
            agentId: t.agentId,
            input: t.input,
            trigger: 'manual'
          }, { autoExecute: true })
        })
      }
    }
  } catch (e) {
    console.warn('[scheduler] 调度检查失败：', e.message)
  }
}

/**
 * 查询调度状态（供 UI 展示）
 */
export function getScheduleStatus() {
  return {
    running: _timer !== null,
    lastDailyDate: _lastDailyDate,
    lastWeeklyDate: _lastWeeklyDate,
    today: todayStr(),
    isMonday: isMonday(),
    pollInterval: POLL_INTERVAL
  }
}

/**
 * 立即触发一次指定类型的所有定时任务（手动测试用）
 */
export function triggerNow(type = 'daily') {
  const tasks = useTaskStore()
  const list = tasks.list.filter(t => t.trigger === type && t.status !== 'running')
  list.forEach(t => {
    tasks.create({
      title: t.title + ' · 手动触发',
      agentId: t.agentId,
      input: t.input,
      trigger: 'manual'
    })
  })
  if (type === 'daily') { _lastDailyDate = todayStr(); _writeDate('helia:scheduler:daily', _lastDailyDate) }
  if (type === 'weekly') { _lastWeeklyDate = todayStr(); _writeDate('helia:scheduler:weekly', _lastWeeklyDate) }
  return list.length
}
