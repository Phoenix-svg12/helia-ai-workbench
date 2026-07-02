<script setup>
import { ref, reactive, computed } from 'vue'
import { useChatStore } from '@/stores/chat'
import { useUIStore } from '@/stores/ui'
import { useToastStore } from '@/stores/toast'
import { useSettingsStore } from '@/stores/settings'
import { testConnection } from '@/services/ai'
import { getPersistStatus, clearPersist } from '@/stores/persist'
import { MODEL_OPTIONS, HELIA_MODELS, TIER_STYLES } from '@/constants/models'
import { useI18n } from '@/i18n'
import ToggleRow from '@/components/ToggleRow.vue'
import Icon from '@/components/Icon.vue'
import BaseModal from '@/components/BaseModal.vue'
import ConfirmDialog from '@/components/ConfirmDialog.vue'

const chat = useChatStore()
const ui = useUIStore()
const toast = useToastStore()
const settings = useSettingsStore()
const { t } = useI18n()

// 语言选项
const languageOptions = [
  { value: 'zh-CN', label: '中文' },
  { value: 'en-US', label: 'English' }
]

// 主题选项
const themeOptions = [
  { value: 'light', label: '亮色', icon: 'sun' },
  { value: 'dark',  label: '暗色', icon: 'moon' }
]

function onLanguageChange(e) {
  ui.setLanguage(e.target.value)
}

const section = ref('general')

const sections = [
  { id: 'general',    label: '通用',       icon: 'gear' },
  { id: 'models',     label: '模型',       icon: 'cpu' },
  { id: 'privacy',    label: '数据与隐私',  icon: 'shield' },
  { id: 'shortcuts',  label: '快捷键',     icon: 'key' },
  { id: 'about',      label: '关于',       icon: 'info' }
]

// 表单直接绑定到 ui.preferences，设置自动持久化
const form = reactive(ui.preferences)

const models = MODEL_OPTIONS

// ===== 多 Provider 管理 =====
const showAddProvider = ref(false)

function addProvider(type) {
  const id = settings.addProvider(type)
  showAddProvider.value = false
  toast.push(`已添加 ${settings.presets[type]?.label || type}，请配置 API Key`, 'success')
}

function removeProvider(id) {
  const p = settings.providers.find(x => x.id === id)
  if (!p) return
  if (settings.providers.length <= 1) {
    toast.push('至少需要保留一个 Provider', 'warn')
    return
  }
  settings.removeProvider(id)
  toast.push(`已移除 ${p.name}`, 'info')
}

function switchProvider(id) {
  settings.setActiveProvider(id)
}

function renameProvider(id, name) {
  settings.renameProvider(id, name)
}

const shortcuts = [
  { keys: ['⌘', 'K'],     desc: '打开命令面板' },
  { keys: ['⌘', 'N'],     desc: '新建对话' },
  { keys: ['⌘', '⇧', 'M'], desc: '切换模型' },
  { keys: ['⌘', '/'],     desc: '打开快捷键列表' },
  { keys: ['⌘', ','],     desc: '打开设置' },
  { keys: ['⌘', '1-9'],   desc: '切换到第 N 个智能体' },
  { keys: ['↑', '↓'],     desc: '在对话内回溯' },
  { keys: ['Esc'],        desc: '关闭弹层' }
]

const showClearModal = ref(false)
const showKeysModal = ref(false)
const showStorageInfo = ref(false)
const newKeyName = ref('')

const keys = ref([
  { id: 'k-1', name: '默认密钥', key: 'sk-helia-••••••••••••4a2f', created: '2026-03-15', active: true },
  { id: 'k-2', name: '开发环境', key: 'sk-helia-••••••••••••8b1c', created: '2026-04-02', active: false }
])

const persistStatus = ref({ stores: {}, totalSizeKB: 0, quotaExceededStores: [] })
function refreshPersistStatus() {
  persistStatus.value = getPersistStatus()
}

function manageKeys() {
  showKeysModal.value = true
}

function generateKey() {
  const name = newKeyName.value.trim()
  if (!name) {
    toast.push('请输入密钥名称', 'warn')
    return
  }
  const random = Math.random().toString(36).substring(2, 6) + Math.random().toString(36).substring(2, 6)
  keys.value.push({
    id: 'k-' + Date.now(),
    name,
    key: `sk-helia-••••••••••••${random}`,
    created: new Date().toISOString().slice(0, 10),
    active: false
  })
  newKeyName.value = ''
  toast.push(`已生成密钥「${name}」`, 'success')
}

function deleteKey(k) {
  const idx = keys.value.findIndex(x => x.id === k.id)
  if (idx >= 0) {
    keys.value.splice(idx, 1)
    toast.push(`已删除密钥「${k.name}」`, 'info')
  }
}

function activateKey(k) {
  keys.value.forEach(x => x.active = false)
  k.active = true
  toast.push(`已激活密钥「${k.name}」`, 'success')
}

function confirmClear() {
  chat.clearAll()
  showClearModal.value = false
  toast.push('所有对话历史已清除', 'success')
}

// 清空指定 store 持久化数据
const showClearStoreConfirm = ref(false)
const pendingStoreId = ref('')
function clearStoreData(storeId) {
  pendingStoreId.value = storeId
  showClearStoreConfirm.value = true
}
function confirmClearStore() {
  if (!pendingStoreId.value) return
  clearPersist(pendingStoreId.value)
  toast.push(`已清空 ${pendingStoreId.value}，刷新后生效`, 'success')
  refreshPersistStatus()
  pendingStoreId.value = ''
}

// AI 服务测试连接
const testing = ref(false)
async function onTestConnection() {
  if (!settings.baseUrl || !settings.apiKey) {
    toast.push('请先填写 Base URL 和 API Key', 'warn')
    return
  }
  testing.value = true
  toast.push('正在测试连接…', 'info')
  const result = await testConnection({
    baseUrl: settings.baseUrl,
    apiKey: settings.apiKey,
    model: settings.realModel(chat.model)
  })
  testing.value = false
  settings.setConnected(result.ok)
  if (result.ok) {
    toast.push(`连接成功，模型回复：${result.sample}`, 'success')
  } else {
    toast.push(`连接失败：${result.error}`, 'error')
  }
}

function onProviderChange(p) {
  settings.setProvider(p)
}

function presetModels() {
  return settings.availableModels || []
}

// Provider 列表（用于添加新 Provider 的预设选择）
const providerPresets = computed(() => {
  return Object.entries(settings.presets).map(([key, val]) => ({ key, ...val }))
})

// ===== 模型获取与自定义模型管理 =====
const fetchingModels = ref(false)
const newCustomModel = ref('')

async function onFetchModels() {
  if (!settings.baseUrl) {
    toast.push('请先配置 Base URL', 'warn')
    return
  }
  fetchingModels.value = true
  toast.push('正在从 API 获取模型列表…', 'info')
  const result = await settings.fetchProviderModels(settings.activeProviderId)
  fetchingModels.value = false
  if (result.ok) {
    toast.push(`已获取 ${result.count} 个模型`, 'success')
  } else {
    toast.push(`获取失败：${result.error}`, 'error')
  }
}

function onAddCustomModel() {
  const name = newCustomModel.value.trim()
  if (!name) {
    toast.push('请输入模型名称', 'warn')
    return
  }
  settings.addCustomModel(name)
  newCustomModel.value = ''
  toast.push(`已添加自定义模型「${name}」`, 'success')
}

function onRemoveCustomModel(modelId) {
  settings.removeCustomModel(modelId)
  toast.push(`已移除「${modelId}」`, 'info')
}

function onSelectModel(modelId) {
  settings.setSelectedModel(modelId)
  toast.push(`已选择 ${modelId}`, 'success')
}

// 当前 Provider 的所有可用模型
const allProviderModels = computed(() => settings.allModels)
function isCustomModel(m) {
  const p = settings.activeProvider
  return p?.customModels?.includes(m) || false
}
</script>

<template>
  <div class="h-full grid grid-cols-1 md:grid-cols-[220px_minmax(0,1fr)]">
    <!-- Left: section list -->
    <aside class="hairline-r p-3 overflow-x-auto md:overflow-y-auto bg-grey-100 md:bg-grey-100 flex md:flex-col gap-1 md:gap-0.5 shrink-0">
      <div class="text-[10.5px] uppercase tracking-[0.12em] text-grey-500 font-medium px-1 mb-1.5 hidden md:block">设置</div>
      <nav class="flex md:flex-col md:space-y-0.5 gap-0.5 shrink-0">
        <button
          v-for="s in sections" :key="s.id"
          @click="section = s.id"
          :class="['flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-[13px] transition-colors whitespace-nowrap',
                   section === s.id ? 'bg-grey-200 text-grey-900' : 'text-grey-600 hover:text-grey-900 hover:bg-grey-100']"
        >
          <Icon :name="s.icon" :size="14" />
          <span class="flex-1 text-left">{{ s.label }}</span>
        </button>
      </nav>
    </aside>

    <!-- Right: form -->
    <div class="overflow-y-auto p-4 md:p-8 max-w-3xl">
      <!-- General -->
      <section v-if="section === 'general'" class="animate-slideUp">
        <h2 class="text-[20px] font-semibold tracking-tight text-grey-900">{{ t('settings.general') }}</h2>
        <p class="text-[12.5px] text-grey-500 mt-1 mb-6">最常用的偏好设置</p>

        <div class="space-y-4">
          <div class="card">
            <label for="field-workspace-name" class="block text-[12.5px] font-medium text-grey-800 mb-1.5">{{ t('settings.workspaceName') }}</label>
            <input id="field-workspace-name" v-model="form.workspaceName" class="input" />
            <p class="text-[10.5px] text-grey-400 mt-1.5">用于多工作台切换时的识别（暂未生效）</p>
          </div>

          <div class="card">
            <label for="field-language" class="block text-[12.5px] font-medium text-grey-800 mb-1.5">{{ t('settings.language') }}</label>
            <select id="field-language" :value="form.language" @change="onLanguageChange" class="input">
              <option v-for="opt in languageOptions" :key="opt.value" :value="opt.value">{{ opt.label }}</option>
            </select>
            <p class="text-[10.5px] text-grey-400 mt-1.5">{{ t('settings.language') }} · zh-CN / en-US</p>
          </div>

          <!-- 主题/外观 -->
          <div class="card">
            <label class="block text-[12.5px] font-medium text-grey-800 mb-1.5">外观主题</label>
            <div class="flex items-center gap-2.5">
              <button
                v-for="opt in themeOptions" :key="opt.value"
                @click="ui.setTheme(opt.value)"
                :class="['flex items-center gap-2 px-3 py-2 rounded-lg border text-[12.5px] transition-all',
                         ui.theme === opt.value
                           ? 'border-brand-600 bg-brand-600/8 text-brand-600'
                           : 'border-grey-300 text-grey-600 hover:border-grey-400 hover:text-grey-800']"
              >
                <Icon :name="opt.icon" :size="14" />
                <span>{{ opt.label }}</span>
              </button>
            </div>
            <p class="text-[10.5px] text-grey-400 mt-1.5">切换亮色 / 暗色主题，设置自动保存</p>
          </div>

          <div class="card divide-y divide-grey-300">
            <ToggleRow v-model="form.autoTitle">
              <template #label>{{ t('settings.autoTitle') }}</template>
              <template #desc>基于首轮消息自动提炼（暂未生效）</template>
            </ToggleRow>
            <ToggleRow v-model="form.streamReply">
              <template #label>{{ t('settings.streamReply') }}</template>
              <template #desc>逐字输出生成过程（暂未生效）</template>
            </ToggleRow>
            <ToggleRow v-model="chat.sendOnEnter">
              <template #label>Enter 直接发送</template>
              <template #desc>换行请用 Shift+Enter</template>
            </ToggleRow>
            <ToggleRow v-model="form.reducedMotion">
              <template #label>{{ t('settings.reducedMotion') }}</template>
              <template #desc>尊重系统减弱动效设置（暂未生效）</template>
            </ToggleRow>
          </div>
        </div>
      </section>

      <!-- Models -->
      <section v-else-if="section === 'models'" class="animate-slideUp">
        <h2 class="text-[20px] font-semibold tracking-tight text-grey-900">模型</h2>
        <p class="text-[12.5px] text-grey-500 mt-1 mb-6">默认与备选模型；右键切换即可在对话中使用</p>

        <div class="space-y-2">
          <div
            v-for="m in models" :key="m.id"
            class="card flex items-center gap-3"
            :class="m.id === chat.model ? 'ring-1 ring-brand-600/30' : ''"
          >
            <div class="w-9 h-9 rounded-lg bg-brand-600/8 ring-1 ring-brand-600/15 flex items-center justify-center">
                <Icon name="cpu" :size="16" class="text-brand-600" />
            </div>
            <div class="flex-1 min-w-0">
              <div class="flex items-center gap-2">
                <span class="w-2 h-2 rounded-full shrink-0" :class="TIER_STYLES[m.tier]?.dot || 'bg-grey-400'"></span>
                <span class="text-[13px] text-grey-800 font-medium">{{ m.id }}</span>
                <span class="text-[9.5px] px-1 py-0.5 rounded font-medium" :class="[TIER_STYLES[m.tier]?.bg, TIER_STYLES[m.tier]?.text]">{{ m.tierLabel }}</span>
              </div>
              <div class="text-[11px] text-grey-500 mt-0.5">{{ m.desc }}</div>
            </div>
            <button
              v-if="m.id !== chat.model"
              @click="chat.model = m.id"
              class="btn-outline"
            >设为默认</button>
            <span v-else class="chip-accent">当前默认</span>
          </div>
        </div>

        <div class="card mt-4">
          <div class="text-[12.5px] font-medium text-grey-800 mb-2">Temperature</div>
          <div class="flex items-center gap-3">
            <input v-model.number="chat.temperature" type="range" min="0" max="1" step="0.05" class="flex-1" style="accent-color: #4B3FE3;" />
            <span class="text-[12px] text-grey-700 font-mono w-10 text-right">{{ chat.temperature.toFixed(2) }}</span>
          </div>
          <p class="text-[10.5px] text-grey-400 mt-1.5">越高越发散，越低越发确定</p>
        </div>

        <!-- AI 服务配置：多 Provider 管理 -->
        <div class="card mt-4">
          <div class="flex items-center justify-between mb-3">
            <div>
              <div class="text-[13px] font-semibold text-grey-900">AI 服务接入</div>
              <div class="text-[11px] text-grey-500 mt-0.5">支持配置多个 Provider，在顶栏一键切换</div>
            </div>
            <button class="btn-outline text-[11.5px] !py-1.5" @click="showAddProvider = !showAddProvider">
              <Icon name="plus" :size="13" class="mr-1" />添加 Provider
            </button>
          </div>

          <!-- 添加 Provider 预设列表 -->
          <div v-if="showAddProvider" class="mb-3 p-2.5 rounded-lg bg-grey-100 border border-grey-200">
            <div class="text-[11px] text-grey-500 mb-2">选择服务商预设</div>
            <div class="grid grid-cols-2 sm:grid-cols-3 gap-1.5">
              <button
                v-for="p in providerPresets" :key="p.key"
                @click="addProvider(p.key)"
                class="px-2.5 py-2 rounded-md text-[11.5px] text-left border border-grey-200 hover:border-brand-600 hover:bg-brand-600/5 transition-colors bg-[var(--bg-default)]"
              >
                <div class="font-medium text-grey-800">{{ p.label }}</div>
                <div class="text-[10px] text-grey-400 truncate">{{ (p.models?.length || 0) }} 模型</div>
              </button>
            </div>
          </div>

          <!-- Provider 列表 -->
          <div class="space-y-2 mb-3">
            <div
              v-for="p in settings.providers" :key="p.id"
              :class="['flex items-center gap-3 p-2.5 rounded-lg border transition-colors cursor-pointer',
                       p.id === settings.activeProviderId ? 'border-brand-600 bg-brand-600/5' : 'border-grey-200 hover:border-grey-300']"
              @click="switchProvider(p.id)"
            >
              <div class="w-8 h-8 rounded-lg flex items-center justify-center shrink-0"
                   :class="p.id === settings.activeProviderId ? 'bg-brand-600/10 text-brand-600' : 'bg-grey-200 text-grey-500'">
                <Icon name="cpu" :size="14" />
              </div>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <span class="text-[12.5px] font-medium text-grey-900">{{ p.name }}</span>
                  <span v-if="p.id === settings.activeProviderId" class="chip-accent text-[9.5px] !py-0.5">活跃</span>
                  <span v-if="p.connected === true" class="text-[9.5px] text-success">● 已连接</span>
                  <span v-else-if="p.connected === false" class="text-[9.5px] text-error">● 连接失败</span>
                  <span v-else-if="!p.apiKey" class="text-[9.5px] text-grey-400">● 未配置</span>
                </div>
                <div class="text-[10.5px] text-grey-400 truncate font-mono">{{ p.baseUrl || '未设置' }} · {{ (p.models?.length || 0) }} 模型</div>
              </div>
              <button
                v-if="settings.providers.length > 1"
                @click.stop="removeProvider(p.id)"
                class="text-grey-400 hover:text-error transition-colors p-1"
                title="移除"
                :aria-label="`移除 ${p.name}`"
              >
                <Icon name="trash" :size="13" />
              </button>
            </div>
          </div>

          <!-- 活跃 Provider 的详细配置 -->
          <div v-if="settings.activeProvider" class="space-y-3 pt-3 border-t border-grey-200">
            <div class="text-[11px] uppercase tracking-wider text-grey-400 font-medium">活跃 Provider 配置</div>

            <div>
              <label for="field-provider-name" class="block text-[11.5px] font-medium text-grey-700 mb-1">名称</label>
              <input
                id="field-provider-name"
                :value="settings.activeProvider.name"
                @input="renameProvider(settings.activeProvider.id, $event.target.value)"
                class="input"
                placeholder="Provider 名称"
              />
            </div>

            <div>
              <label for="field-provider-type" class="block text-[11.5px] font-medium text-grey-700 mb-1">服务商类型</label>
              <select id="field-provider-type" :value="settings.provider" @change="onProviderChange($event.target.value)" class="input">
                <option v-for="(p, key) in settings.presets" :key="key" :value="key">{{ p.label }}</option>
              </select>
            </div>

            <div>
              <label for="field-base-url" class="block text-[11.5px] font-medium text-grey-700 mb-1">Base URL</label>
              <input
                id="field-base-url"
                :value="settings.baseUrl"
                @input="settings.setBaseUrl($event.target.value)"
                class="input font-mono text-[11.5px]"
                placeholder="https://api.example.com/v1"
              />
            </div>

            <div>
              <label for="field-api-key" class="block text-[11.5px] font-medium text-grey-700 mb-1">API Key</label>
              <input
                id="field-api-key"
                :value="settings.apiKey"
                @input="settings.setApiKey($event.target.value)"
                type="password"
                class="input font-mono text-[11.5px]"
                placeholder="sk-..."
                autocomplete="off"
              />
              <p class="text-[10.5px] text-grey-400 mt-1">仅存本机 localStorage，不会上传到任何第三方（AI 请求除外）</p>
            </div>

            <!-- 搜索 API Key（用于 web_search 工具） -->
            <div>
              <label for="field-search-api-key" class="block text-[11.5px] font-medium text-grey-700 mb-1">
                搜索 API Key
                <span class="text-[10px] text-grey-400 font-normal">（可选，用于网页搜索工具）</span>
              </label>
              <input
                id="field-search-api-key"
                :value="settings.searchApiKey"
                @input="settings.setSearchApiKey($event.target.value)"
                type="password"
                class="input font-mono text-[11.5px]"
                placeholder="tvly-...（Tavily）"
                autocomplete="off"
              />
              <p class="text-[10.5px] text-grey-400 mt-1">配置后智能体的「网页搜索」工具可联网检索；未配置时降级为占位提示。前往 <a href="https://tavily.com" target="_blank" class="text-brand-600 hover:underline">tavily.com</a> 获取</p>
            </div>

            <!-- 可用模型列表管理 -->
            <div>
              <div class="flex items-center justify-between mb-1.5">
                <label class="block text-[11.5px] font-medium text-grey-700">可用模型列表</label>
                <button
                  @click="onFetchModels"
                  :disabled="fetchingModels"
                  class="text-[10.5px] text-brand-600 hover:text-brand-700 flex items-center gap-1 transition-colors disabled:opacity-50"
                >
                  <Icon :name="fetchingModels ? 'loading' : 'refresh'" :size="11" />
                  {{ fetchingModels ? '获取中…' : '从 API 获取模型' }}
                </button>
              </div>
              <p class="text-[10px] text-grey-400 mb-2">点击模型可设为当前使用；橙色标记为自定义/本地模型</p>

              <!-- 模型列表 -->
              <div class="space-y-1 max-h-48 overflow-y-auto rounded-lg border border-grey-200 p-1.5 bg-[var(--bg-default)]">
                <div v-if="allProviderModels.length === 0" class="text-center py-4 text-[11px] text-grey-400">
                  暂无模型，点击上方「从 API 获取模型」或添加自定义模型
                </div>
                <div
                  v-for="m in allProviderModels" :key="m"
                  :class="['flex items-center gap-2 px-2 py-1.5 rounded-md cursor-pointer transition-colors',
                           settings.selectedModel === m ? 'bg-brand-600/8 ring-1 ring-brand-600/20' : 'hover:bg-grey-100']"
                  @click="onSelectModel(m)"
                >
                  <span class="w-1.5 h-1.5 rounded-full shrink-0" :class="isCustomModel(m) ? 'bg-orange-400' : 'bg-brand-500/60'"></span>
                  <span class="text-[11.5px] font-mono text-grey-800 flex-1 truncate">{{ m }}</span>
                  <span v-if="isCustomModel(m)" class="text-[9px] text-orange-500">自定义</span>
                  <span v-if="settings.selectedModel === m" class="text-brand-600 shrink-0">
                    <Icon name="check" :size="12" />
                  </span>
                  <button
                    v-if="isCustomModel(m)"
                    @click.stop="onRemoveCustomModel(m)"
                    class="text-grey-400 hover:text-error transition-colors shrink-0"
                    title="移除自定义模型"
                  >
                    <Icon name="trash" :size="11" />
                  </button>
                </div>
              </div>
            </div>

            <!-- 添加自定义/本地模型 -->
            <div>
              <label class="block text-[11.5px] font-medium text-grey-700 mb-1">添加自定义/本地模型</label>
              <div class="flex gap-2">
                <input
                  v-model="newCustomModel"
                  @keydown.enter="onAddCustomModel"
                  class="input flex-1 font-mono text-[11.5px]"
                  placeholder="输入模型 ID，如 my-local-model"
                />
                <button class="btn-outline text-[11.5px] !py-1.5 shrink-0" @click="onAddCustomModel">
                  <Icon name="plus" :size="12" class="mr-1" />添加
                </button>
              </div>
              <p class="text-[10px] text-grey-400 mt-1">用于配置本地 Ollama 模型或 API 未列出的自定义模型名称</p>
            </div>

            <!-- 高级：模型映射（折叠） -->
            <details class="mt-2">
              <summary class="text-[11px] text-grey-500 cursor-pointer hover:text-grey-700 select-none">高级：Helia 虚拟名映射（可选）</summary>
              <div class="space-y-1.5 mt-2">
                <div v-for="hm in HELIA_MODELS" :key="hm" class="flex items-center gap-2">
                  <span class="text-[11px] text-grey-500 w-28 shrink-0 font-mono flex items-center gap-1.5">
                    <span class="w-1.5 h-1.5 rounded-full" :class="TIER_STYLES[models.find(m => m.id === hm)?.tier]?.dot || 'bg-grey-400'"></span>
                    {{ hm }}
                  </span>
                  <span class="text-grey-300">→</span>
                  <input
                    :value="settings.modelMapping[hm]"
                    @input="settings.setModelMapping(hm, $event.target.value)"
                    class="input flex-1 font-mono text-[11px]"
                    :placeholder="presetModels()[0] || '模型 ID'"
                    list="preset-models"
                  />
                </div>
                <datalist id="preset-models">
                  <option v-for="m in presetModels()" :key="m" :value="m" />
                </datalist>
              </div>
            </details>

            <div class="flex items-center gap-2 pt-1">
              <button class="btn-primary" :disabled="testing" @click="onTestConnection">
                {{ testing ? '测试中…' : '测试连接' }}
              </button>
              <span v-if="settings.connected === true" class="text-[11px] text-success">✓ 连通</span>
              <span v-else-if="settings.connected === false" class="text-[11px] text-error">✗ 不通</span>
            </div>
          </div>
        </div>
      </section>

      <!-- Privacy -->
      <section v-else-if="section === 'privacy'" class="animate-slideUp">
        <h2 class="text-[20px] font-semibold tracking-tight text-grey-900">数据与隐私</h2>
        <p class="text-[12.5px] text-grey-500 mt-1 mb-6">本地优先：默认不上传任何对话或附件</p>

        <div class="space-y-3">
          <div class="card flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-brand-600/8 text-brand-500 ring-1 ring-brand-600/20 flex items-center justify-center">
              <Icon name="shield" :size="16" />
            </div>
            <div class="flex-1">
              <div class="text-[13px] text-grey-800 font-medium">本地优先模式</div>
              <div class="text-[11.5px] text-grey-500 mt-0.5">对话与文件默认在你的设备上处理，只在必要时调用云端模型</div>
            </div>
            <span class="chip-accent">已启用</span>
          </div>

          <div class="card flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-grey-100 ring-1 ring-grey-300 flex items-center justify-center text-grey-700">
              <Icon name="lock" :size="16" />
            </div>
            <div class="flex-1">
              <div class="text-[13px] text-grey-800 font-medium">端到端加密同步</div>
              <div class="text-[11.5px] text-grey-500 mt-0.5">跨设备同步使用你的密钥加密，服务端无法读取</div>
            </div>
            <button class="btn-outline" @click="manageKeys">管理密钥</button>
          </div>

          <div class="card flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-grey-100 ring-1 ring-grey-300 flex items-center justify-center text-grey-700">
              <Icon name="trash" :size="16" />
            </div>
            <div class="flex-1">
              <div class="text-[13px] text-grey-800 font-medium">清除所有对话历史</div>
              <div class="text-[11.5px] text-grey-500 mt-0.5">本设备与已同步设备同时清除，不可恢复</div>
            </div>
            <button class="btn-outline !text-error !border-error/20 hover:!bg-error/8" @click="showClearModal = true">清除</button>
          </div>

          <!-- 本地存储诊断（新增） -->
          <div class="card flex items-center gap-3">
            <div class="w-9 h-9 rounded-lg bg-grey-100 ring-1 ring-grey-300 flex items-center justify-center text-grey-700">
              <Icon name="info" :size="16" />
            </div>
            <div class="flex-1">
              <div class="text-[13px] text-grey-800 font-medium">本地存储诊断</div>
              <div class="text-[11.5px] text-grey-500 mt-0.5">查看各 store 占用空间，清理超额数据</div>
            </div>
            <button class="btn-outline" @click="refreshPersistStatus(); showStorageInfo = true">查看</button>
          </div>
        </div>
      </section>

      <!-- Shortcuts -->
      <section v-else-if="section === 'shortcuts'" class="animate-slideUp">
        <h2 class="text-[20px] font-semibold tracking-tight text-grey-900">快捷键</h2>
        <p class="text-[12.5px] text-grey-500 mt-1 mb-6">在不离开键盘的情况下完成大部分操作</p>

        <div class="card divide-y divide-grey-300 p-0 overflow-hidden">
          <div v-for="s in shortcuts" :key="s.desc" class="flex items-center justify-between px-4 py-2.5">
            <span class="text-[12.5px] text-grey-700">{{ s.desc }}</span>
            <div class="flex items-center gap-1">
              <span v-for="k in s.keys" :key="k" class="kbd">{{ k }}</span>
            </div>
          </div>
        </div>
      </section>

      <!-- About -->
      <section v-else class="animate-slideUp">
        <h2 class="text-[20px] font-semibold tracking-tight text-grey-900">关于</h2>
        <p class="text-[12.5px] text-grey-500 mt-1 mb-6">Helia 智能工作台 · v0.1.0</p>
        <div class="card space-y-3 text-[12.5px] text-grey-700">
          <div class="flex justify-between"><span class="text-grey-400">应用版本</span><span class="font-mono">0.1.0 (alpha)</span></div>
          <div class="flex justify-between"><span class="text-grey-400">构建</span><span class="font-mono">helia-2026.06.24</span></div>
          <div class="flex justify-between"><span class="text-grey-400">本地引擎</span><span class="font-mono">vLLM 0.4 · llama.cpp</span></div>
          <div class="flex justify-between"><span class="text-grey-400">许可证</span><span>Apache-2.0 (UI) · 模型按各自许可</span></div>
          <div class="pt-2 hairline-t flex items-center gap-2">
            <span class="chip-accent">开源</span>
            <span class="text-grey-500">本项目以 Apache-2.0 开源，欢迎贡献与反馈。</span>
          </div>
        </div>
      </section>
    </div>

    <!-- 清除确认弹窗（用 BaseModal） -->
    <BaseModal
      v-model="showClearModal"
      title="确认清除所有对话历史？"
      desc="此操作将清除本设备与已同步设备上的所有对话，且不可恢复。"
      width="sm"
      danger
    >
      <template #footer>
        <button class="btn-ghost" @click="showClearModal = false">取消</button>
        <button class="btn-primary !bg-error hover:!bg-error !text-white" @click="confirmClear">
          确认清除
        </button>
      </template>
    </BaseModal>

    <!-- 密钥管理弹窗（用 BaseModal） -->
    <BaseModal
      v-model="showKeysModal"
      title="密钥管理"
      width="lg"
    >
      <div class="space-y-2 mb-4">
        <div
          v-for="k in keys" :key="k.id"
          class="flex items-center gap-3 rounded-lg bg-grey-100 border border-grey-300 p-3 group"
          :class="k.active ? 'ring-1 ring-brand-600/20' : ''"
        >
          <div class="w-8 h-8 rounded-md bg-grey-100 ring-1 ring-grey-300 flex items-center justify-center shrink-0">
            <Icon name="key" :size="16" class="text-grey-600" />
          </div>
          <div class="min-w-0 flex-1">
            <div class="flex items-center gap-2">
              <span class="text-[12.5px] text-grey-800 font-medium">{{ k.name }}</span>
              <span v-if="k.active" class="chip-accent text-[9.5px]">当前使用</span>
            </div>
            <div class="text-[10.5px] text-grey-500 font-mono mt-0.5">{{ k.key }}</div>
            <div class="text-[10px] text-grey-400 mt-0.5">创建于 {{ k.created }}</div>
          </div>
          <div class="flex items-center gap-1 shrink-0">
            <button v-if="!k.active" class="icon-btn text-brand-600" title="激活" @click="activateKey(k)">
              <Icon name="check" :size="14" />
            </button>
            <button class="icon-btn text-grey-400 hover:text-error" title="删除" @click="deleteKey(k)">
              <Icon name="trash" :size="14" />
            </button>
          </div>
        </div>
      </div>
      <div class="hairline-t pt-4">
        <div class="flex items-center gap-2">
          <input v-model="newKeyName" class="input" placeholder="新密钥名称" @keydown.enter="generateKey" />
          <button class="btn-primary shrink-0" @click="generateKey">
            <Icon name="plus" :size="14" />
            生成密钥
          </button>
        </div>
      </div>
    </BaseModal>

    <!-- 存储诊断弹窗（新增） -->
    <BaseModal
      v-model="showStorageInfo"
      title="本地存储诊断"
      desc="各 store 的本地存储占用情况"
      width="lg"
    >
      <div v-if="persistStatus.quotaExceededStores.length" class="rounded-lg p-3 mb-3 text-[12px]" style="background: rgba(232,70,58,0.08); color: #E8463A; border: 1px solid rgba(232,70,58,0.2)">
        <div class="font-medium mb-1">⚠️ 配额已满的 store</div>
        <div class="font-mono text-[11px]">{{ persistStatus.quotaExceededStores.join(', ') }}</div>
        <div class="text-[11px] mt-1">这些 store 已降级为纯内存模式，刷新后数据丢失。建议清理历史数据。</div>
      </div>
      <div class="text-[12px] text-grey-500 mb-3">总占用：<b class="text-grey-800 font-mono">{{ persistStatus.totalSizeKB }} KB</b></div>
      <div class="space-y-1.5 max-h-[400px] overflow-y-auto">
        <div
          v-for="(info, id) in persistStatus.stores" :key="id"
          class="flex items-center gap-3 rounded-lg border border-grey-300 p-2.5"
          :class="info.quotaExceeded ? 'ring-1 ring-error/30' : (info.sizeKB > 500 ? 'ring-1 ring-warning/30' : '')"
        >
          <Icon name="file" :size="16" class="text-grey-500 shrink-0" />
          <div class="flex-1 min-w-0">
            <div class="text-[12.5px] text-grey-800 font-medium font-mono">{{ id }}</div>
            <div class="text-[10.5px] text-grey-500 mt-0.5">
              {{ info.sizeKB }} KB
              <span v-if="info.quotaExceeded" class="text-error ml-2">配额已满</span>
              <span v-else-if="info.sizeKB > 500" class="text-warning ml-2">体积较大</span>
            </div>
          </div>
          <button
            class="btn-outline !text-[11px] !h-7 !text-error !border-error/20 hover:!bg-error/8 shrink-0"
            @click="clearStoreData(id)"
          >清空</button>
        </div>
      </div>
    </BaseModal>

    <!-- 清空 store 确认弹窗 -->
    <ConfirmDialog
      v-model="showClearStoreConfirm"
      title="清空本地存储"
      :desc="`确定清空 ${pendingStoreId} 的本地存储数据？刷新后将恢复初始值，此操作不可撤销。`"
      confirm-text="清空"
      danger
      @confirm="confirmClearStore"
    />
  </div>
</template>

<style scoped>
@media (max-width: 767px) {
  /* 窄屏表单容器不限制最大宽度，占满可用空间 */
  .max-w-3xl { max-width: 100%; }
  /* 窄屏卡片内边距收紧 */
  :deep(.card) { padding: 12px; }
  /* 窄屏模型映射行内标签宽度收窄 */
  :deep(.input) { font-size: 12px; }
}
</style>
