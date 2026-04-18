import { useState, useEffect } from 'react'
import { Users as UsersIcon, RefreshCw, Plus, Trash2, X } from 'lucide-react'
import { getUsers, deleteUser, addUser } from '@/api/admin'
import { useUIStore } from '@/store/uiStore'
import { useAuthStore } from '@/store/authStore'
import { PageLoading } from '@/components/common/Loading'
import type { User } from '@/types'

export function Users() {
  const { addToast } = useUIStore()
  const { isAuthenticated, token, _hasHydrated } = useAuthStore()
  const [loading, setLoading] = useState(true)
  const [users, setUsers] = useState<User[]>([])
  const [showCreateModal, setShowCreateModal] = useState(false)
  const [creating, setCreating] = useState(false)
  const [form, setForm] = useState({ username: '', email: '', password: '' })

  const loadUsers = async () => {
    if (!_hasHydrated || !isAuthenticated || !token) return
    try {
      setLoading(true)
      const result = await getUsers()
      if (result.success) {
        setUsers(result.data || [])
      }
    } catch {
      addToast({ type: 'error', message: '加载用户列表失败' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    if (!_hasHydrated || !isAuthenticated || !token) return
    loadUsers()
  }, [_hasHydrated, isAuthenticated, token])

  const closeCreateModal = () => {
    setShowCreateModal(false)
    setForm({ username: '', email: '', password: '' })
  }

  const handleCreateUser = async () => {
    const username = form.username.trim()
    const email = form.email.trim()
    const password = form.password

    if (!username) {
      addToast({ type: 'warning', message: '请输入用户名' })
      return
    }
    if (!email) {
      addToast({ type: 'warning', message: '请输入邮箱地址' })
      return
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
    if (!emailRegex.test(email)) {
      addToast({ type: 'warning', message: '请输入正确的邮箱格式' })
      return
    }
    if (password.length < 6) {
      addToast({ type: 'warning', message: '密码长度至少6位' })
      return
    }

    try {
      setCreating(true)
      const result = await addUser({ username, email, password })
      if (result.success) {
        addToast({ type: 'success', message: result.message || '用户创建成功' })
        closeCreateModal()
        loadUsers()
      } else {
        addToast({ type: 'error', message: result.message || '用户创建失败' })
      }
    } catch (error: any) {
      const message = error?.response?.data?.detail || error?.response?.data?.message || '用户创建失败'
      addToast({ type: 'error', message })
    } finally {
      setCreating(false)
    }
  }

  const handleDelete = async (userId: number) => {
    if (!confirm('确定要删除这个用户吗？此操作不可恢复！')) return
    try {
      await deleteUser(userId)
      addToast({ type: 'success', message: '删除成功' })
      loadUsers()
    } catch {
      addToast({ type: 'error', message: '删除失败' })
    }
  }

  if (loading) {
    return <PageLoading />
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="page-title">用户管理</h1>
          <p className="page-description">管理系统用户账号。注册邮件没配好时，可直接在这里创建账号。</p>
        </div>
        <div className="flex gap-3">
          <button onClick={() => setShowCreateModal(true)} className="btn-ios-primary">
            <Plus className="w-4 h-4" />
            添加用户
          </button>
          <button onClick={loadUsers} className="btn-ios-secondary">
            <RefreshCw className="w-4 h-4" />
            刷新
          </button>
        </div>
      </div>

      <div className="vben-card">
        <div className="vben-card-header flex items-center justify-between">
          <h2 className="vben-card-title">
            <UsersIcon className="w-4 h-4" />
            用户列表
          </h2>
          <span className="badge-primary">{users.length} 个用户</span>
        </div>
        <div className="overflow-x-auto">
          <table className="table-ios">
            <thead>
              <tr>
                <th>ID</th>
                <th>用户名</th>
                <th>邮箱</th>
                <th>角色</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr>
                  <td colSpan={5} className="text-center py-8 text-slate-500 dark:text-slate-400">
                    <div className="flex flex-col items-center gap-2">
                      <UsersIcon className="w-12 h-12 text-slate-300 dark:text-slate-600" />
                      <p>暂无用户数据</p>
                    </div>
                  </td>
                </tr>
              ) : (
                users.map((user) => (
                  <tr key={user.user_id}>
                    <td className="font-medium">{user.user_id}</td>
                    <td className="font-medium text-blue-600 dark:text-blue-400">{user.username}</td>
                    <td className="text-slate-500 dark:text-slate-400">{user.email || '-'}</td>
                    <td>
                      {user.is_admin ? <span className="badge-warning">管理员</span> : <span className="badge-gray">普通用户</span>}
                    </td>
                    <td>
                      <div className="flex gap-1">
                        <button
                          onClick={() => handleDelete(user.user_id)}
                          className="p-2 rounded-lg hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
                          title="删除"
                        >
                          <Trash2 className="w-4 h-4 text-red-500" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      <div className="vben-card">
        <div className="vben-card-body">
          <p className="text-sm text-slate-500 dark:text-slate-400">
            提示：前台自助注册仍然需要SMTP邮件配置。没配SMTP时，用户管理页可以直接手动创建账号。
          </p>
        </div>
      </div>

      {showCreateModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
          <div className="absolute inset-0 bg-black/50" onClick={closeCreateModal} />
          <div className="relative w-full max-w-md bg-white dark:bg-slate-800 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-700">
            <div className="flex items-center justify-between px-5 py-4 border-b border-slate-200 dark:border-slate-700">
              <h3 className="text-lg font-semibold text-slate-900 dark:text-slate-100">添加用户</h3>
              <button onClick={closeCreateModal} className="p-2 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-700">
                <X className="w-4 h-4" />
              </button>
            </div>
            <div className="p-5 space-y-4">
              <div>
                <label className="input-label">用户名</label>
                <input className="input-ios mt-1" value={form.username} onChange={(e) => setForm(s => ({ ...s, username: e.target.value }))} placeholder="请输入用户名" />
              </div>
              <div>
                <label className="input-label">邮箱</label>
                <input className="input-ios mt-1" value={form.email} onChange={(e) => setForm(s => ({ ...s, email: e.target.value }))} placeholder="name@example.com" />
              </div>
              <div>
                <label className="input-label">密码</label>
                <input type="password" className="input-ios mt-1" value={form.password} onChange={(e) => setForm(s => ({ ...s, password: e.target.value }))} placeholder="至少6位" />
              </div>
            </div>
            <div className="px-5 py-4 border-t border-slate-200 dark:border-slate-700 flex justify-end gap-3">
              <button onClick={closeCreateModal} className="btn-ios-secondary">取消</button>
              <button onClick={handleCreateUser} disabled={creating} className="btn-ios-primary disabled:opacity-60">
                {creating ? '创建中...' : '确认创建'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
