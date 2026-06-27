'use client'

import { useCallback, useEffect, useState } from 'react'
import { ShieldCheck, Users, UserPlus } from 'lucide-react'
import { showToast } from '@/components/Toast'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Switch } from '@/components/ui/switch'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { authApi } from '@/lib/tauri'
import type { AdminRole, AuthUser, TeamInvite } from '@/lib/types'
import { useAuthStore } from '@/store/authStore'
import { usePermissions } from '@/hooks/usePermissions'

const roleOptions: Array<{ value: AdminRole; label: string }> = [
  { value: 'SuperAdmin', label: 'Super Admin' },
  { value: 'SiteSuperAdmin', label: 'Site Super Admin' },
  { value: 'Manager', label: 'Manager' },
  { value: 'User', label: 'User' },
]

export default function TeamPage() {
  const { token, user } = useAuthStore()
  const { hasPermission } = usePermissions()
  const [members, setMembers] = useState<AuthUser[]>([])
  const [invites, setInvites] = useState<TeamInvite[]>([])
  const [email, setEmail] = useState('')
  const [role, setRole] = useState<AdminRole>('Manager')
  const [isDeveloper, setIsDeveloper] = useState(false)
  const [loading, setLoading] = useState(false)

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
      const invite = await authApi.createInvite(token, email.trim(), role, isDeveloper)
      setInvites((current) => [invite, ...current])
      setEmail('')
      showToast(`Invite code ${invite.code} created`, 'success')
    } catch (error) {
      showToast(`Invite failed: ${error}`, 'error')
    }
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
          <Users className="mr-1 size-3" /> Team access
        </Badge>
        <h1 className="page-title">Team</h1>
        <p className="page-subtitle">Invite local users and assign their MG Enterprise role.</p>
      </div>

      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2"><UserPlus className="size-5" /> Invite Team Member</CardTitle>
        </CardHeader>
        <CardContent className="grid gap-4 lg:grid-cols-[1fr_220px_180px_auto] lg:items-end">
          <div className="space-y-2">
            <Label>Email</Label>
            <Input value={email} onChange={(event) => setEmail(event.target.value)} placeholder="operator@company.com" />
          </div>
          <div className="space-y-2">
            <Label>Role</Label>
            <Select value={role} onValueChange={(value) => setRole(value as AdminRole)}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>{roleOptions.map((item) => <SelectItem key={item.value} value={item.value}>{item.label}</SelectItem>)}</SelectContent>
            </Select>
          </div>
          <div className="flex items-center justify-between gap-3 rounded-xl border border-border px-3 py-2.5">
            <Label>Developer</Label>
            <Switch checked={isDeveloper} onCheckedChange={setIsDeveloper} />
          </div>
          <Button onClick={createInvite}>Create Invite</Button>
        </CardContent>
      </Card>

      <div className="grid gap-6 xl:grid-cols-2">
        <Card>
          <CardHeader><CardTitle>Members</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Name</TableHead><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Dev</TableHead></TableRow></TableHeader>
              <TableBody>
                {members.map((member) => (
                  <TableRow key={member.id}>
                    <TableCell>{member.name}</TableCell>
                    <TableCell>{member.email}</TableCell>
                    <TableCell>{member.role}</TableCell>
                    <TableCell>{member.is_developer ? 'Yes' : 'No'}</TableCell>
                  </TableRow>
                ))}
                {!loading && members.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No members found</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>

        <Card>
          <CardHeader><CardTitle>Invite Codes</CardTitle></CardHeader>
          <CardContent className="p-0">
            <Table>
              <TableHeader><TableRow><TableHead>Email</TableHead><TableHead>Role</TableHead><TableHead>Code</TableHead><TableHead>Status</TableHead></TableRow></TableHeader>
              <TableBody>
                {invites.map((invite) => (
                  <TableRow key={invite.id}>
                    <TableCell>{invite.email}</TableCell>
                    <TableCell>{invite.role}</TableCell>
                    <TableCell className="font-mono font-bold text-primary">{invite.code}</TableCell>
                    <TableCell>{invite.status}</TableCell>
                  </TableRow>
                ))}
                {!loading && invites.length === 0 && <TableRow><TableCell colSpan={4} className="py-8 text-center text-muted-foreground">No invites yet</TableCell></TableRow>}
              </TableBody>
            </Table>
          </CardContent>
        </Card>
      </div>
    </div>
  )
}
