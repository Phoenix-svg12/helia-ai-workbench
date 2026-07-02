import { defineStore } from 'pinia'
import { fetchModels } from '@/services/ai'

/**
 * AI 服务配置 store —— 多 Provider 架构 + 真实模型选择。
 *
 * 核心概念：
 *   providers[]          — 多组并行的 API 配置（每个含 provider/baseUrl/apiKey/models/customModels/selectedModel）
 *   activeProviderId     — 当前激活的 Provider 槽位
 *
 * 每个 Provider 的模型来源：
 *   models[]             — 预设模型 + 从 API /models 端点获取的模型
 *   customModels[]       — 用户手动添加的自定义/本地模型
 *   selectedModel        — 当前选中的真实模型 ID（用户直接切换）
 *
 * 兼容层：
 *   provider / baseUrl / apiKey / modelMapping / connected 均为 getter，
 *   委托到 activeProvider，因此 ai.js / tasks.js / workflow.js 等消费者无需改动。
 *   realModel() 优先返回 selectedModel，回退到 modelMapping。
 */
const PRESETS = {
  openai: {
    label: 'OpenAI 官方',
    baseUrl: 'https://api.openai.com/v1',
    models: [
      'gpt-5', 'gpt-5-mini', 'gpt-5-nano',
      'o3', 'o4-mini',
      'gpt-4o', 'gpt-4o-mini',
    ],
  },
  deepseek: {
    label: 'DeepSeek',
    baseUrl: 'https://api.deepseek.com',
    models: [
      'deepseek-v4-flash', 'deepseek-v4-pro',
      'deepseek-chat', 'deepseek-reasoner',
    ],
  },
  zhipu: {
    label: '智谱 GLM',
    baseUrl: 'https://open.bigmodel.cn/api/paas/v4',
    models: [
      'glm-5.2', 'glm-5.1', 'glm-5-turbo', 'glm-5',
      'glm-4.7', 'glm-4.7-flash', 'glm-4.7-flashx',
      'glm-4.5-air',
      'glm-4-plus', 'glm-4-air', 'glm-4-airx', 'glm-4-flashx-250414',
      'glm-4-long', 'glm-4-assistant', 'glm-4-flash', 'glm-4',
      'glm-z1-air', 'glm-z1-airx', 'glm-z1-flashx',
    ],
  },
  qwen: {
    label: '通义千问',
    baseUrl: 'https://dashscope.aliyuncs.com/compatible-mode/v1',
    models: [
      'qwen3.6-max-preview', 'qwen3.6-plus', 'qwen3.6-flash',
      'qwen-max', 'qwen-plus', 'qwen-turbo',
      'qwen3-235b-a22b', 'qwen3-30b-a3b',
      'qwen3-coder-plus',
    ],
  },
  moonshot: {
    label: 'Moonshot 月之暗面',
    baseUrl: 'https://api.moonshot.cn/v1',
    models: [
      'kimi-k2.5',
      'kimi-k2-0905-preview', 'kimi-k2-0711-preview',
      'kimi-k2-turbo-preview',
      'kimi-k2-thinking', 'kimi-k2-thinking-turbo',
      'moonshot-v1-8k', 'moonshot-v1-32k', 'moonshot-v1-128k',
      'moonshot-v1-8k-vision-preview', 'moonshot-v1-32k-vision-preview', 'moonshot-v1-128k-vision-preview',
    ],
  },
  ollama: {
    label: '本地 Ollama',
    baseUrl: 'http://localhost:11434/v1',
    models: [
      'llama3.2', 'qwen2.5', 'phi3', 'mistral', 'gemma2', 'deepseek-r1',
    ],
  },
  custom: {
    label: '自定义',
    baseUrl: '',
    models: [],
  },
}

let _idCounter = 0
function genId() {
  _idCounter++
  return `p${Date.now().toString(36)}${_idCounter}`
}

/** 根据 provider 类型自动生成默认 modelMapping */
function autoMapping(providerType, preset) {
  if (!preset || !preset.models.length) {
    return { 'Helia-Pro': '', 'Helia-Flash': '', 'Helia-Reason': '', 'Helia-Local': '' }
  }
  const ms = preset.models
  // 按供应商智能匹配
  const findFlash = ms.find(m => /flash|mini|turbo|8k|air/i.test(m)) || ms[0]
  const findPro = ms.find(m => /pro|plus|max|^gpt-5$|v4-pro|5\.2|k2\.5/i.test(m)) || ms[0]
  const findReason = ms.find(m => /reason|think|o[0-9]|z1|thinking/i.test(m)) || findPro
  return {
    'Helia-Pro':    findPro,
    'Helia-Flash':  findFlash,
    'Helia-Reason': findReason,
    'Helia-Local':  providerType === 'ollama' ? (ms[0] || 'llama3.2') : ''
  }
}

export const useSettingsStore = defineStore('settings', {
  state: () => ({
    // ===== 多 Provider 槽位 =====
    providers: [],
    activeProviderId: '',

    defaultSystem: '你是 Helia，一个智能工作台助手。回答要简洁、准确、有条理。当用户的问题不明确时，先简短确认再回答。',
    searchApiKey: '',
  }),

  persist: ['providers', 'activeProviderId', 'defaultSystem', 'searchApiKey'],

  getters: {
    presets: () => PRESETS,

    activeProvider(s) {
      return s.providers.find(p => p.id === s.activeProviderId) || s.providers[0] || null
    },

    // ===== 兼容 getter：委托到 activeProvider =====
    provider(s) {
      return s.providers.find(p => p.id === s.activeProviderId)?.provider
        || s.providers[0]?.provider
        || 'deepseek'
    },
    baseUrl(s) {
      return s.providers.find(p => p.id === s.activeProviderId)?.baseUrl
        || s.providers[0]?.baseUrl
        || ''
    },
    apiKey(s) {
      return s.providers.find(p => p.id === s.activeProviderId)?.apiKey
        || s.providers[0]?.apiKey
        || ''
    },
    modelMapping(s) {
      const p = s.providers.find(p => p.id === s.activeProviderId) || s.providers[0]
      return p?.modelMapping || {}
    },
    connected(s) {
      return s.providers.find(p => p.id === s.activeProviderId)?.connected
        ?? null
    },

    // 当前选中的真实模型 ID（用户直接切换的）
    selectedModel(s) {
      const p = s.providers.find(p => p.id === s.activeProviderId) || s.providers[0]
      return p?.selectedModel || ''
    },

    // 当前 provider 所有可用模型（预设 + API获取 + 自定义）
    allModels(s) {
      const p = s.providers.find(p => p.id === s.activeProviderId) || s.providers[0]
      if (!p) return []
      const base = [...(p.models || [])]
      const custom = p.customModels || []
      // 去重合并
      return [...new Set([...base, ...custom])]
    },

    // 解析 Helia 虚拟模型名 → 真实模型 ID
    // 优先返回 selectedModel，回退到 modelMapping
    realModel(s) {
      return (heliaModel) => {
        const p = s.providers.find(p => p.id === s.activeProviderId) || s.providers[0]
        if (!p) return 'gpt-4o-mini'
        // 优先使用用户直接选中的真实模型
        if (p.selectedModel) return p.selectedModel
        // 回退到 tier 映射
        return p.modelMapping?.[heliaModel] || p.modelMapping?.['Helia-Pro'] || p.models?.[0] || 'gpt-4o-mini'
      }
    },

    // 当前 provider 是否已配置可调用
    isConfigured(s) {
      const p = s.providers.find(p => p.id === s.activeProviderId) || s.providers[0]
      return !!(p?.baseUrl && p?.apiKey)
    },

    // 当前 provider 可用模型列表（兼容旧代码）
    availableModels(s) {
      const p = s.providers.find(p => p.id === s.activeProviderId) || s.providers[0]
      return p?.models || []
    },
  },

  actions: {
    /** 初始化：如果没有 providers，从旧格式迁移或创建默认 */
    initProviders() {
      if (this.providers.length > 0) {
        if (!this.activeProviderId || !this.providers.find(p => p.id === this.activeProviderId)) {
          this.activeProviderId = this.providers[0].id
        }
        // 兼容旧数据 + 同步最新预设模型列表
        for (const p of this.providers) {
          if (!p.customModels) p.customModels = []
          if (p.selectedModel === undefined) p.selectedModel = ''
          // 合并预设模型到已有模型列表（不覆盖 API 获取的模型）
          const preset = PRESETS[p.provider]
          if (preset && preset.models.length > 0) {
            const existing = new Set([...(p.models || []), ...(p.customModels || [])])
            const presetNew = preset.models.filter(m => !existing.has(m))
            if (presetNew.length) {
              p.models = [...(p.models || []), ...presetNew]
            } else if (!p.models || p.models.length === 0) {
              p.models = [...preset.models]
            }
            // 修正 baseUrl（如 DeepSeek 从 /v1 改为不带 /v1）
            if (preset.baseUrl && p.baseUrl !== preset.baseUrl) {
              // 仅在用户没自定义过 baseUrl 时同步（即 baseUrl 仍等于旧预设值）
              const oldPresets = ['https://api.deepseek.com/v1']
              if (oldPresets.includes(p.baseUrl) || p.baseUrl === '') {
                p.baseUrl = preset.baseUrl
              }
            }
          }
        }
        return
      }
      // 迁移旧数据或创建默认 DeepSeek 槽位
      const old = localStorage.getItem('helia:settings')
      let migrated = null
      if (old) {
        try {
          const parsed = JSON.parse(old)
          if (parsed.provider && parsed.baseUrl) {
            migrated = {
              id: genId(),
              name: PRESETS[parsed.provider]?.label || parsed.provider,
              provider: parsed.provider,
              baseUrl: parsed.baseUrl,
              apiKey: parsed.apiKey || '',
              models: PRESETS[parsed.provider]?.models || [],
              customModels: [],
              selectedModel: '',
              modelMapping: parsed.modelMapping || autoMapping(parsed.provider, PRESETS[parsed.provider]),
              connected: null,
            }
          }
        } catch {}
      }
      if (!migrated) {
        const preset = PRESETS.deepseek
        migrated = {
          id: genId(),
          name: preset.label,
          provider: 'deepseek',
          baseUrl: preset.baseUrl,
          apiKey: '',
          models: [...preset.models],
          customModels: [],
          selectedModel: '',
          modelMapping: autoMapping('deepseek', preset),
          connected: null,
        }
      }
      this.providers = [migrated]
      this.activeProviderId = migrated.id
    },

    /** 添加新 Provider 槽位 */
    addProvider(providerType, name) {
      const preset = PRESETS[providerType] || PRESETS.custom
      const slot = {
        id: genId(),
        name: name || preset.label,
        provider: providerType,
        baseUrl: preset.baseUrl,
        apiKey: '',
        models: [...preset.models],
        customModels: [],
        selectedModel: '',
        modelMapping: autoMapping(providerType, preset),
        connected: null,
      }
      this.providers.push(slot)
      this.activeProviderId = slot.id
      return slot.id
    },

    /** 移除 Provider 槽位 */
    removeProvider(id) {
      const idx = this.providers.findIndex(p => p.id === id)
      if (idx === -1) return
      if (this.providers.length <= 1) return
      this.providers.splice(idx, 1)
      if (this.activeProviderId === id) {
        this.activeProviderId = this.providers[0].id
      }
    },

    /** 切换激活 Provider */
    setActiveProvider(id) {
      if (!this.providers.find(p => p.id === id)) return
      this.activeProviderId = id
    },

    /** 更新激活 Provider 的字段 */
    updateActiveProvider(patch) {
      const p = this.activeProvider
      if (!p) return
      Object.assign(p, patch)
    },

    /** 重命名 Provider 槽位 */
    renameProvider(id, name) {
      const p = this.providers.find(p => p.id === id)
      if (p) p.name = name
    },

    /** 设置当前选中的真实模型 */
    setSelectedModel(modelId) {
      const p = this.activeProvider
      if (!p) return
      p.selectedModel = modelId
    },

    /** 从 API /models 端点获取模型列表并更新到 provider */
    async fetchProviderModels(providerId) {
      const p = this.providers.find(x => x.id === providerId) || this.activeProvider
      if (!p) return { ok: false, error: '未找到 Provider' }
      if (!p.baseUrl) return { ok: false, error: '请先配置 Base URL' }
      try {
        const models = await fetchModels(p.baseUrl, p.apiKey)
        if (models.length > 0) {
          // 合并到 models（去重），保留 customModels
          const existing = new Set([...(p.models || []), ...(p.customModels || [])])
          const newModels = models.filter(m => !existing.has(m))
          p.models = [...new Set([...models, ...(p.models || []).filter(m => !models.includes(m))])]
          // 如果没有选中模型，默认选第一个
          if (!p.selectedModel && p.models.length > 0) {
            p.selectedModel = p.models[0]
          }
          return { ok: true, models: p.models, count: newModels.length }
        }
        return { ok: true, models: p.models, count: 0 }
      } catch (e) {
        return { ok: false, error: e.message }
      }
    },

    /** 添加自定义模型到当前 Provider */
    addCustomModel(modelId) {
      const p = this.activeProvider
      if (!p) return
      if (!p.customModels) p.customModels = []
      const trimmed = modelId.trim()
      if (!trimmed) return
      // 检查是否已存在
      const all = [...(p.models || []), ...(p.customModels || [])]
      if (all.includes(trimmed)) return
      p.customModels.push(trimmed)
      // 如果没有选中模型，选中新添加的
      if (!p.selectedModel) {
        p.selectedModel = trimmed
      }
    },

    /** 移除自定义模型 */
    removeCustomModel(modelId) {
      const p = this.activeProvider
      if (!p || !p.customModels) return
      const idx = p.customModels.indexOf(modelId)
      if (idx >= 0) {
        p.customModels.splice(idx, 1)
        // 如果移除的是当前选中模型，清空选中
        if (p.selectedModel === modelId) {
          p.selectedModel = ''
        }
      }
    },

    // ===== 兼容 actions：委托到 activeProvider =====
    setProvider(p) {
      const preset = PRESETS[p]
      if (!preset) return
      const active = this.activeProvider
      if (!active) return
      active.provider = p
      active.baseUrl = preset.baseUrl
      active.models = [...preset.models]
      active.selectedModel = ''
      if (p !== 'custom' && preset.models.length) {
        active.modelMapping = autoMapping(p, preset)
      }
      active.connected = null
    },

    setModelMapping(heliaModel, realModel) {
      const p = this.activeProvider
      if (!p) return
      if (!p.modelMapping) p.modelMapping = {}
      p.modelMapping[heliaModel] = realModel
    },

    setApiKey(key) {
      const p = this.activeProvider
      if (!p) return
      p.apiKey = key.trim()
      p.connected = null
    },

    setBaseUrl(url) {
      const p = this.activeProvider
      if (!p) return
      p.baseUrl = url.trim()
      p.connected = null
    },

    setSearchApiKey(key) {
      this.searchApiKey = (key || '').trim()
    },

    setConnected(ok) {
      const p = this.activeProvider
      if (!p) return
      p.connected = ok
    },
  }
})
