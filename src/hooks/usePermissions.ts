'use client'

import { useEffect, useState } from 'react'
import { authApi } from '@/lib/tauri'
import { useAuthStore } from '@/store/authStore'

export type AppPermission = 'all' | 'screens' | 'content' | 'production' | 'trucks' | 'team' | 'view'

const defaultPermissions: Record<string, AppPermission[]> = {
  SuperAdmin: ['all'],
  SiteSuperAdmin: ['screens', 'content', 'production', 'trucks', 'team'],
  Manager: ['screens', 'content', 'production', 'trucks'],
  User: ['view'],
}

export function usePermissions() {
  const { token, user } = useAuthStore()
  const [permissions, setPermissions] = useState<AppPermission[]>([])
  const [loaded, setLoaded] = useState(false)

  useEffect(() => {
    if (!token || !user) {
      setPermissions([])
      setLoaded(true)
      return
    }

    let cancelled = false

    authApi
      .getRolePermissions(token)
      .then((perms) => {
        if (!cancelled) {
          setPermissions(perms.length > 0 ? (perms as AppPermission[]) : defaultPermissions[user.role] ?? ['view'])
          setLoaded(true)
        }
      })
      .catch(() => {
        if (!cancelled) {
          setPermissions(defaultPermissions[user.role] ?? ['view'])
          setLoaded(true)
        }
      })

    return () => {
      cancelled = true
    }
  }, [token, user])

  function hasPermission(perm: AppPermission): boolean {
    if (permissions.includes('all')) return true
    return permissions.includes(perm)
  }

  return { permissions, hasPermission, loaded }
}
