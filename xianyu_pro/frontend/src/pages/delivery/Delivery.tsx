import { useState, useEffect, useMemo } from 'react'
import type { FormEvent } from 'react'
import { motion } from 'framer-motion'
import { Truck, RefreshCw, Plus, Edit2, Trash2, Power, PowerOff, X, Loader2, Package } from 'lucide-react'
import { getDeliveryRules, deleteDeliveryRule, updateDeliveryRule, addDeliveryRule } from '@/api/delivery'
import { getCards, type CardData } from '@/api/cards'
import { getItems } from '@/api/items'
import { getAccountDetails, type AccountDetail } from '@/api/accounts'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { PageLoading } from '@/components/common/Loading'
import { Select } from '@/components/common/Select'
import type { DeliveryRule, Item } from '@/types'

const ITEM_SEPARATOR = '::__ITEM__::'

const buildItemValue = (cookieId?: string, itemId?: string) => {
  if (!cookieId || !itemId) return ''
  return `${cookieId}${ITEM_SEPARATOR}${itemId}`
}

const parseItemValue = (value: string) => {
  const [cookie_id = '', item_id = ''] = value.split(ITEM_SEPARATOR)
  return { cookie_id, item_id }
}

const getItemTitle = (item: Item) => item.item_title || item.title || `商品 ${item.item_id}`

export function Delivery() {
  const { addToast } = useUIStore()
  const { isAuthenticated, token, _hasHydrated } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [rules, setRules] = useState<DeliveryRule[]>([])
  const [cards, setCards] = useState<CardData[]>([])
  const [items, setItems] = useState<Item[]>([])
  const [accounts, setAccounts] = useState<AccountDetail[]>([])

  const [isModalOpen, setIsModalOpen] = useState(false)
  const [editingRule, setEditingRule] = useState<DeliveryRule | null>(null)
  const [selectedAccountId, setSelectedAccountId] = useState('')
  const [formSelectedItem, setFormSelectedItem] = useState('')
  const [formCardId, setFormCardId] = useState('')
  const [formDescription, setFormDescription] = useState('')
  const [formEnabled, setFormEnabled] = useState(true)
  const [saving, setSaving] = useState(false)

  const itemOptions = useMemo(() => {
    const seen = new Set<string>()
    return items
      .filter((item) => !selectedAccountId || item.cookie_id === selectedAccountId)
      .map((item) => {
        const value = buildItemValue(item.cookie_id, item.item_id)
        if (!value || seen.has(value)) return null
        seen.add(value)
        return {
          value,
          label: `[${item.cookie_id}] ${getItemTitle(item)} (${item.item_id})`,
        }
      })
      .filter((option): option is { value: string; label: string } => Boolean(option))
  }, [items, selectedAccountId])

  const accountOptions = useMemo(() => ([
    { value: '', label: '全部账号' },
    ...accounts.map((account) => ({
      value: String(account.id),
      label: account.username ? `${account.username} (${account.id})` : String(account.id),
    })),
  ]), [accounts])

  const loadRules = async () => {
    if (!_hasHydrated || !isAuthenticated || !token) return
    try {
      setLoading(true)
      const result = await getDeliveryRules()
      if (result.success) {
        setRules(result.data || [])
      }
    } catch {
      addToast({ type: 'error', message: '加载发货规则失败' })
    } finally {
      setLoading(false)
    }
  }

  const loadCards = async () => {
    if (!_hasHydrated || !isAuthenticated || !token) return
    try {
      const result = await getCards()
      if (result.success) {
        setCards(result.data || [])
      }
    } catch {
      // ignore
    }
  }

  const loadAccounts = async () => {
    if (!_hasHydrated || !isAuthenticated || !token) return
    try {
      const result = await getAccountDetails()
      setAccounts(result || [])
    } catch {
      // ignore
    }
  }

  const loadItems = async () => {
    if (!_hasHydrated || !isAuthenticated || !token) return
    try {
      const result = await getItems()
      if (result.success) {
        setItems(result.data || [])
      }
    } catch {
      addToast({ type: 'error', message: '加载商品列表失败' })
    }
  }

  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated || !token) return
    void Promise.all([loadAccounts(), loadCards(), loadItems(), loadRules()])
  }, [_hasHydrated, isAuthenticated, token])

  useEffect(() => {
    if (!selectedAccountId || !formSelectedItem) return
    const { cookie_id } = parseItemValue(formSelectedItem)
    if (cookie_id && cookie_id !== selectedAccountId) {
      setFormSelectedItem('')
    }
  }, [selectedAccountId, formSelectedItem])

  const handleToggleEnabled = async (rule: DeliveryRule) => {
    try {
      await updateDeliveryRule(String(rule.id), { enabled: !rule.enabled })
      addToast({ type: 'success', message: rule.enabled ? '规则已禁用' : '规则已启用' })
      loadRules()
    } catch {
      addToast({ type: 'error', message: '操作失败' })
    }
  }

  const handleDelete = async (id: number) => {
    if (!confirm('确定要删除这条规则吗？')) return
    try {
      await deleteDeliveryRule(String(id))
      addToast({ type: 'success', message: '删除成功' })
      loadRules()
    } catch {
      addToast({ type: 'error', message: '删除失败' })
    }
  }

  const openAddModal = () => {
    setEditingRule(null)
    setSelectedAccountId(accounts.length === 1 ? String(accounts[0].id) : '')
    setFormSelectedItem('')
    setFormCardId('')
    setFormDescription('')
    setFormEnabled(true)
    setIsModalOpen(true)
  }

  const openEditModal = (rule: DeliveryRule) => {
    setEditingRule(rule)
    setSelectedAccountId(rule.cookie_id || '')
    setFormSelectedItem(buildItemValue(rule.cookie_id, rule.item_id))
    setFormCardId(String(rule.card_id))
    setFormDescription(rule.description || '')
    setFormEnabled(rule.enabled)
    setIsModalOpen(true)
  }

  const closeModal = () => {
    setIsModalOpen(false)
    setEditingRule(null)
    setSelectedAccountId('')
  }

  const handleSubmit = async (e: FormEvent) => {
    e.preventDefault()
    if (!formSelectedItem) {
      addToast({ type: 'warning', message: '请选择指定商品' })
      return
    }
    if (!formCardId) {
      addToast({ type: 'warning', message: '请选择卡券' })
      return
    }

    const { cookie_id, item_id } = parseItemValue(formSelectedItem)
    if (!cookie_id || !item_id) {
      addToast({ type: 'warning', message: '商品信息无效，请重新选择' })
      return
    }

    const selectedItem = items.find((item) => item.cookie_id === cookie_id && item.item_id === item_id)

    setSaving(true)
    try {
      const data: Partial<DeliveryRule> & { cookie_id: string; item_id: string } = {
        cookie_id,
        item_id,
        keyword: selectedItem ? getItemTitle(selectedItem) : item_id,
        card_id: Number(formCardId),
        delivery_count: 1,
        description: formDescription || undefined,
        enabled: formEnabled,
      }

      if (editingRule) {
        await updateDeliveryRule(String(editingRule.id), data)
        addToast({ type: 'success', message: '规则已更新' })
      } else {
        await addDeliveryRule(data)
        addToast({ type: 'success', message: '规则已添加' })
      }

      closeModal()
      loadRules()
    } catch {
      addToast({ type: 'error', message: '保存失败' })
    } finally {
      setSaving(false)
    }
  }

  if (loading && rules.length === 0) {
    return <PageLoading />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">自动发货</h1>
          <p className="page-description">按指定商品精确发货，不再依靠关键词模糊匹配</p>
        </div>
        <div className="flex gap-3">
          <button onClick={openAddModal} className="btn-ios-primary ">
            <Plus className="w-4 h-4" />
            添加规则
          </button>
          <button onClick={() => { void Promise.all([loadAccounts(), loadItems(), loadCards(), loadRules()]) }} className="btn-ios-secondary ">
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>
      </div>

      <div className="rounded-2xl border border-blue-100 bg-blue-50/70 px-4 py-3 text-sm text-blue-700 dark:border-blue-900/40 dark:bg-blue-950/20 dark:text-blue-300">
        现在规则会直接绑定到具体商品 ID。买家下单哪个商品，就发哪个商品对应的卡券，不再根据商品标题关键词猜测。
      </div>

      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: 0.1 }}
        className="vben-card"
      >
        <div className="vben-card-header flex items-center justify-between">
          <h2 className="vben-card-title ">
            <Truck className="w-4 h-4" />
            发货规则
          </h2>
          <span className="badge-primary">{rules.length} 条规则</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table-ios">
            <thead>
              <tr>
                <th>指定商品</th>
                <th>关联卡券</th>
                <th>规格</th>
                <th>已发次数</th>
                <th>状态</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {rules.length === 0 ? (
                <tr>
                  <td colSpan={6} className="text-center py-8 text-gray-500">
                    <div className="flex flex-col items-center gap-2">
                      <Truck className="w-12 h-12 text-gray-300" />
                      <p>暂无发货规则</p>
                    </div>
                  </td>
                </tr>
              ) : (
                rules.map((rule) => {
                  const relatedCard = cards.find((card) => card.id === rule.card_id)
                  const itemLabel = rule.item_title || rule.keyword || '未指定商品'
                  return (
                    <tr key={rule.id}>
                      <td>
                        <div className="min-w-[280px]">
                          <div className="font-medium text-blue-600 dark:text-blue-400">{itemLabel}</div>
                          <div className="mt-1 text-xs text-slate-500 dark:text-slate-400 break-all">
                            账号：{rule.cookie_id || '-'} ｜ 商品ID：{rule.item_id || '-'}
                          </div>
                        </div>
                      </td>
                      <td className="text-sm">{rule.card_name || `卡券ID: ${rule.card_id}`}</td>
                      <td>
                        {relatedCard?.is_multi_spec ? (
                          <span className="text-xs text-blue-600 dark:text-blue-400">
                            {relatedCard.spec_name}: {relatedCard.spec_value}
                          </span>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </td>
                      <td className="text-center text-slate-500">{rule.delivery_times || 0}</td>
                      <td>
                        {rule.enabled ? <span className="badge-success">启用</span> : <span className="badge-danger">禁用</span>}
                      </td>
                      <td>
                        <div>
                          <button
                            onClick={() => handleToggleEnabled(rule)}
                            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            title={rule.enabled ? '禁用' : '启用'}
                          >
                            {rule.enabled ? (
                              <PowerOff className="w-4 h-4 text-amber-500" />
                            ) : (
                              <Power className="w-4 h-4 text-emerald-500" />
                            )}
                          </button>
                          <button
                            onClick={() => openEditModal(rule)}
                            className="p-2 rounded-lg hover:bg-gray-100 transition-colors"
                            title="编辑"
                          >
                            <Edit2 className="w-4 h-4 text-blue-500 dark:text-blue-400" />
                          </button>
                          <button
                            onClick={() => handleDelete(rule.id)}
                            className="p-2 rounded-lg hover:bg-red-50 transition-colors"
                            title="删除"
                          >
                            <Trash2 className="w-4 h-4 text-red-500" />
                          </button>
                        </div>
                      </td>
                    </tr>
                  )
                })
              )}
            </tbody>
          </table>
        </div>
      </motion.div>

      {isModalOpen && (
        <div className="modal-overlay">
          <div className="modal-content max-w-lg">
            <div className="modal-header flex items-center justify-between">
              <h2 className="text-lg font-semibold">{editingRule ? '编辑发货规则' : '添加发货规则'}</h2>
              <button onClick={closeModal} className="p-1 hover:bg-gray-100 rounded-lg">
                <X className="w-4 h-4 text-gray-500" />
              </button>
            </div>
            <form onSubmit={handleSubmit}>
              <div className="modal-body space-y-4">
                <div className="input-group">
                  <label className="input-label">选择账号</label>
                  <Select
                    value={selectedAccountId}
                    onChange={setSelectedAccountId}
                    options={accountOptions}
                    placeholder="先选择账号，可缩小商品范围"
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    先选账号后，下方商品下拉列表只显示该账号下的商品。
                  </p>
                </div>
                <div className="input-group">
                  <label className="input-label">指定商品 *</label>
                  <Select
                    value={formSelectedItem}
                    onChange={(value) => {
                      setFormSelectedItem(value)
                      const parsed = parseItemValue(value)
                      if (parsed.cookie_id) setSelectedAccountId(parsed.cookie_id)
                    }}
                    options={[{ value: '', label: itemOptions.length ? '请选择商品' : '暂无可选商品' }, ...itemOptions]}
                    placeholder={selectedAccountId ? '请选择该账号下要绑定发货的商品' : '请选择要绑定发货的商品'}
                  />
                  <p className="mt-1 text-xs text-gray-500">
                    <Package className="inline-block w-3 h-3 mr-1" />
                    规则会直接绑定到商品 ID，买家下单该商品时才会触发。当前可选 {itemOptions.length} 个商品。
                  </p>
                </div>
                <div className="input-group">
                  <label className="input-label">关联卡券 *</label>
                  <Select
                    value={formCardId}
                    onChange={setFormCardId}
                    options={[
                      { value: '', label: '请选择卡券' },
                      ...cards.map((card) => ({
                        value: String(card.id),
                        label: card.is_multi_spec
                          ? `${card.name} [${card.spec_name}: ${card.spec_value}]`
                          : card.name || card.text_content?.substring(0, 20) || `卡券 ${card.id}`,
                      })),
                    ]}
                    placeholder="请选择卡券"
                  />
                </div>
                <div>
                  <label className="input-label">描述（可选）</label>
                  <textarea
                    value={formDescription}
                    onChange={(e) => setFormDescription(e.target.value)}
                    className="input-ios h-20 resize-none"
                    placeholder="规则描述，方便识别"
                  />
                </div>
                <div className="flex items-center justify-between pt-2">
                  <span className="text-sm font-medium text-slate-700 dark:text-slate-200">启用此规则</span>
                  <button
                    type="button"
                    onClick={() => setFormEnabled(!formEnabled)}
                    className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                      formEnabled ? 'bg-blue-600' : 'bg-slate-300 dark:bg-slate-600'
                    }`}
                  >
                    <span
                      className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                        formEnabled ? 'translate-x-6' : 'translate-x-1'
                      }`}
                    />
                  </button>
                </div>
              </div>
              <div className="modal-footer">
                <button type="button" onClick={closeModal} className="btn-ios-secondary" disabled={saving}>
                  取消
                </button>
                <button type="submit" className="btn-ios-primary" disabled={saving}>
                  {saving ? (
                    <span>
                      <Loader2 className="w-4 h-4 animate-spin" />
                      保存中...
                    </span>
                  ) : (
                    '保存'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  )
}
