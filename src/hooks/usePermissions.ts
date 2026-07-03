'use client'

import { useMemo } from 'react'
import { useAuthStore } from '@/store/authStore'

export type AppPermission = 'all' | 'screens' | 'content' | 'trucks' | 'team' | 'view' | 'settings'

const rolePerms: Record<string, AppPermission[]> = {
  SuperAdmin: ['screens', 'content', 'trucks', 'team', 'settings'],
  SiteSuperAdmin: ['screens', 'content', 'trucks', 'team', 'settings'],
  Manager: ['screens', 'content', 'trucks'],
  User: ['view'],
}

export function usePermissions() {
  const user = useAuthStore((s) => s.user)
  const perms: AppPermission[] = useMemo(() => {
    if (!user) return []
    if (user.is_developer) return ['all']
    return rolePerms[user.role] ?? ['view']
  }, [user])

  const isSuperAdmin = useMemo(() => {
    if (!user) return false
    if (user.is_developer) return true
    return user.role === 'SuperAdmin' || user.role === 'SiteSuperAdmin'
  }, [user])

  return {
    perms,
    isSuperAdmin,
    hasPermission(perm: AppPermission) {
      if (perms.length === 0) return false
      if (perms.includes('all')) return true
      return perms.includes(perm)
    },
  }
}
