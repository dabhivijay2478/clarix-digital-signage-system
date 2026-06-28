'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Users, UserPlus, Trash2, Pencil, Key, RefreshCw, Copy, Check, Eye, EyeOff } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog'
import { authApi } from '@/lib/tauri'
import type { AdminRole, AuthUser, TeamInvite } from '@/lib/types'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'
import { customConfirm } from '@/lib/tauri'

// SiteSuperAdmin can invite Manager and User only
// SuperAdmin is env-configured only (Developer)
const inviteRoleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: 'Manager', label: 'Manager' },
  { value: 'User', label: 'User' },
]

// SiteSuperAdmin can edit Manager and User roles
const editableRoleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: 'Manager', label: 'Manager' },
  { value: 'User', label: 'User' },
]

// Developer (env-based) can edit all roles including SiteSuperAdmin
const allRoleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: 'SuperAdmin', label: 'Super Admin' },
  { value: 'SiteSuperAdmin', label: 'Site Super Admin' },
  { value: 'Manager', label: 'Manager' },
  { value: 'User', label: 'User' },
]

function generatePassword(length = 12): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789!@#$%^&*'
  let password = ''
  for (let i = 0; i < length; i++) {
    password += chars.charAt(Math.floor(Math.random() * chars.length))
  }
  return password
}

export default function TeamPage() {
  const { token, user: currentUser } = useAuthStore()
  const { hasPermission, isSuperAdmin } = usePermissions()
  const [members, setMembers] = useState<AuthUser[]>([])
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [showPassword, setShowPassword] = useState(false)
  const [role, setRole] = useState<AdminRole>('Manager')
  const [loading, setLoading] = useState(false)
  const [copiedCode, setCopiedCode] = useState<string | null>(null)
  // Developer = env-based SuperAdmin with full control
  // Only the env-configured Developer (is_developer=true) has full control
  const isDeveloper = currentUser?.is_developer ?? false
  // SiteSuperAdmin can invite/manage Manager and User roles only
  const canInvite = isSuperAdmin && hasPermission('team')
  // SiteSuperAdmin can edit/delete Manager and User only
  // Developer can edit/delete all roles including SiteSuperAdmin
  const canManageMembers = isSuperAdmin && hasPermission('team')
  // Only Developer can manage SiteSuperAdmin/SuperAdmin roles and reset passwords
  const canManageAll = isDeveloper && hasPermission('team')
  // Only Developer can reset passwords (security critical)
  const canResetPassword = isDeveloper && hasPermission('team')

  // Edit member dialog state
  const [editingMember, setEditingMember] = useState<AuthUser | null>(null)
  const [editRole, setEditRole] = useState<AdminRole>('Manager')

  // Reset password dialog state
  const [resettingMember, setResettingMember] = useState<AuthUser | null>(null)
  const [newPassword, setNewPassword] = useState('')
  const [showNewPassword, setShowNewPassword] = useState(false)

  const loadTeam = useCallback(async () => {
    if (!token || !hasPermission('team')) return
    setLoading(true)
    try {
      const [nextMembers, nextInvites] = await Promise.all([
        authApi.members(token),
        authApi.invites(token),
      ])
      setMembers(nextMembers)
      setInvites(nextInvites)
    } catch (error) {
      showToast(`Failed to load team: ${error}`, 'error')
    } finally {
      setLoading(false)
    }
  }, [token, hasPermission])

  useEffect(() => {
    loadTeam()
  }, [loadTeam])

  const createInvite = async () => {
    if (!token || !email.trim()) return
    try {
      const invitePassword = password.trim() || generatePassword(12)
      const invite = await authApi.createInvite(token, email.trim(), role, false, invitePassword)
      setInvites((current) => [invite, ...current])
      setEmail('')
      setPassword('')
      setShowPassword(false)
      setRole('Manager')
      showToast(`Invite created for ${invite.email}`, 'success')
    } catch (error) {
      showToast(`Invite failed: ${error}`, 'error')
    }
  }

  const deleteInvite = async (inviteId: string) => {
    if (!token) return
    const confirmed = await customConfirm('Delete this invite?')
    if (!confirmed) return
    try {
      await authApi.deleteInvite(token, inviteId)
      setInvites((current) => current.filter((i) => i.id !== inviteId))
      showToast('Invite deleted', 'success')
    } catch (error) {
      showToast(`Failed to delete invite: ${error}`, 'error')
    }
  }

  const deleteMember = async (userId: string) => {
    if (!token) return
    if (userId === currentUser?.id) {
      showToast('Cannot delete yourself', 'error')
      return
    }
    const confirmed = await customConfirm('Delete this team member? This action cannot be undone.')
    if (!confirmed) return
    try {
      await authApi.deleteMember(token, userId)
      setMembers((current) => current.filter((m) => m.id !== userId))
      showToast('Member deleted', 'success')
    } catch (error) {
      showToast(`Failed to delete member: ${error}`, 'error')
    }
  }

  const openEditDialog = (member: AuthUser) => {
    setEditingMember(member)
    setEditRole(member.role)
  }

  const saveMemberEdit = async () => {
    if (!token || !editingMember) return
    try {
      const updated = await authApi.updateMember(token, editingMember.id, editRole, editingMember.is_developer)
      setMembers((current) => current.map((m) => (m.id === updated.id ? updated : m)))
      setEditingMember(null)
      showToast('Member updated', 'success')
    } catch (error) {
      showToast(`Failed to update member: ${error}`, 'error')
    }
  }

  const openResetPasswordDialog = (member: AuthUser) => {
    setResettingMember(member)
    setNewPassword(generatePassword(12))
    setShowNewPassword(false)
  }

  const saveResetPassword = async () => {
    if (!token || !resettingMember || !newPassword.trim()) return
    try {
      await authApi.resetMemberPassword(token, resettingMember.id, newPassword.trim())
      showToast(`Password reset for ${resettingMember.name}`, 'success')
      setResettingMember(null)
      setNewPassword('')
    } catch (error) {
      showToast(`Failed to reset password: ${error}`, 'error')
    }
  }

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text)
    setCopiedCode(id)
    setTimeout(() => setCopiedCode(null), 2000)
    showToast('Copied to clipboard', 'success')
  }

  const generateNewPassword = () => {
    setNewPassword(generatePassword(12))
  }

  if (!hasPermission('team')) {
    return (
      <div className="flex min-h-[70vh] items-center justify-center">
        <Card className="max-w-lg text-center">
          <CardContent className="p-8">
            <ShieldCheck className="mx-auto mb-4 size-10 text-muted-foreground" />
            <h1 className="text-2xl font-bold">Team access restricted</h1>
            <p className="mt-2 text-sm text-muted-foreground">You don't have permission to manage team members.</p>
          </CardContent>
        </Card>
      </div>
    )
  }

  return (
    <div className="space-y-7 animate-fadeIn">
      <div>
        <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">
          <Users className="mr-1 size-3" /> Team Management
        </Badge>
        <h1 className="page-title">Team</h1>
        <p className="page-subtitle">Manage team members and invite new users.</p>
      </div>

      {canInvite && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2"><UserPlus className="size-5" /> Invite New Member</CardTitle>
          </CardHeader>
          <CardContent className="grid gap-4 lg:grid-cols-[1fr_200px_180px_auto] lg:items-end">
            <div className="space-y-2">
              <Label>Email</Label>
              <Input 
                value={email} 
                onChange={(event) => setEmail(event.target.value)} 
                placeholder="user@company.com" 
                type="email"
              />
            </div>
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>Initial Password</Label>
                <Button 
                  variant="ghost" 
                  size="sm" 
                  className="h-6 text-xs px-2" 
                  onClick={() => setPassword(generatePassword(12))}
                >
                  <RefreshCw className="size-3 mr-1" /> Generate
                </Button>
              </div>
              <div className="relative">
                <Input 
                  value={password} 
                  onChange={(event) => setPassword(event.target.value)} 
                  placeholder="Auto-generate or enter"
                  type={showPassword ? 'text' : 'password'}
                  className="pr-10"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowPassword(!showPassword)}
                >
                  {showPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={role} onValueChange={(value) => setRole(value as AdminRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>{inviteRoleOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
              </Select>
            </div>
            <Button onClick={createInvite} disabled={!email.trim()}>Send Invite</Button>
          </CardContent>
        </Card>
      )}

      <div className="grid gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between">
            <CardTitle>Team Members</CardTitle>
            <Badge variant="secondary">{members.length} members</Badge>
          </CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>Name</TableHead>
                  <TableHead>Email</TableHead>
                  <TableHead>Role</TableHead>
                  {canManageMembers && <TableHead className="text-right">Actions</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {members.map((member) => {
                  // Developer (env-based) can manage ALL members including SiteSuperAdmin and SuperAdmin
                  // SiteSuperAdmin can only manage Manager and User roles
                  const isHigherRole = member.role === 'SuperAdmin' || member.role === 'SiteSuperAdmin'
                  const canEditThisMember = canManageAll || 
                    (canManageMembers && !isHigherRole)
                  const canDeleteThisMember = canEditThisMember && member.id !== currentUser?.id
                  // SiteSuperAdmin cannot edit themselves or other higher-role users
                  const isSelf = member.id === currentUser?.id
                  const showActions = canManageMembers && (canManageAll ? true : !isHigherRole && !isSelf)
                  
                  return (
                    <TableRow key={member.id}>
                      <TableCell className="font-medium">{member.name}</TableCell>
                      <TableCell className="text-muted-foreground">{member.email}</TableCell>
                      <TableCell>
                        <Badge variant={member.role === 'SuperAdmin' ? 'default' : 'secondary'} className="font-normal">
                          {member.role}
                        </Badge>
                      </TableCell>
                      {canManageMembers && (
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-1">
                            {canEditThisMember && !isSelf && (
                              <Button 
                                variant="ghost" 
                                size="icon-sm" 
                                onClick={() => openEditDialog(member)} 
                                title="Edit Role"
                              >
                                <Pencil className="size-4" />
                              </Button>
                            )}
                            {canResetPassword && !isSelf && (
                              <Button 
                                variant="ghost" 
                                size="icon-sm" 
                                onClick={() => openResetPasswordDialog(member)} 
                                title="Reset Password"
                              >
                                <Key className="size-4" />
                              </Button>
                            )}
                            {canDeleteThisMember && (
                              <Button 
                                variant="ghost" 
                                size="icon-sm" 
                                onClick={() => deleteMember(member.id)} 
                                title="Delete Member"
                                className="text-destructive hover:text-destructive"
                              >
                                <Trash2 className="size-4" />
                              </Button>
                            )}
                          </div>
                        </TableCell>
                      )}
                    </TableRow>
                  )
                })}
                {!loading && members.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={canManageMembers ? 4 : 3} className="py-8 text-center text-muted-foreground">
                      No members found
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        {canInvite && (
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <CardTitle>Pending Invites</CardTitle>
              <Badge variant="secondary">{invites.length} pending</Badge>
            </CardHeader>
            <CardContent className="p-0">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Invite Code</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead className="text-right">Actions</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {invites.map((invite) => (
                    <TableRow key={invite.id}>
                      <TableCell>{invite.email}</TableCell>
                      <TableCell>
                        <Badge variant="secondary" className="font-normal">{invite.role}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <code className="font-mono text-sm bg-muted px-2 py-1 rounded">{invite.code}</code>
                          <Button 
                            variant="ghost" 
                            size="icon-sm" 
                            onClick={() => copyToClipboard(invite.code, invite.id)}
                            title="Copy code"
                          >
                            {copiedCode === invite.id ? <Check className="size-4 text-green-500" /> : <Copy className="size-4" />}
                          </Button>
                        </div>
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline" className="font-normal">{invite.status}</Badge>
                      </TableCell>
                      <TableCell className="text-right">
                        <Button 
                          variant="ghost" 
                          size="icon-sm" 
                          onClick={() => deleteInvite(invite.id)} 
                          title="Delete Invite"
                          className="text-destructive hover:text-destructive"
                        >
                          <Trash2 className="size-4" />
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                  {!loading && invites.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={5} className="py-8 text-center text-muted-foreground">
                        No pending invites
                      </TableCell>
                    </TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        )}
      </div>

      {/* Edit Member Dialog */}
      <Dialog open={!!editingMember} onOpenChange={() => setEditingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit Member Role</DialogTitle>
            <DialogDescription>Update role for {editingMember?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>Role</Label>
              <Select value={editRole} onValueChange={(value) => setEditRole(value as AdminRole)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {/* Developer can edit all roles, SiteSuperAdmin can only edit Manager/User */}
                  {(canManageAll ? allRoleOptions : editableRoleOptions).map((item) => (
                    <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditingMember(null)}>Cancel</Button>
            <Button onClick={saveMemberEdit}>Save Changes</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Reset Password Dialog - Developer Only */}
      <Dialog open={!!resettingMember} onOpenChange={() => setResettingMember(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reset Password</DialogTitle>
            <DialogDescription>Set new password for {resettingMember?.name}</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>New Password</Label>
                <Button variant="ghost" size="sm" className="h-6 text-xs px-2" onClick={generateNewPassword}>
                  <RefreshCw className="size-3 mr-1" /> Generate
                </Button>
              </div>
              <div className="relative">
                <Input 
                  value={newPassword} 
                  onChange={(event) => setNewPassword(event.target.value)} 
                  placeholder="Enter new password"
                  type={showNewPassword ? 'text' : 'password'}
                  className="pr-10"
                />
                <Button
                  variant="ghost"
                  size="icon-sm"
                  className="absolute right-1 top-1/2 -translate-y-1/2 h-7 w-7"
                  onClick={() => setShowNewPassword(!showNewPassword)}
                >
                  {showNewPassword ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
                </Button>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setResettingMember(null)}>Cancel</Button>
            <Button onClick={saveResetPassword}>Reset Password</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  )
}
