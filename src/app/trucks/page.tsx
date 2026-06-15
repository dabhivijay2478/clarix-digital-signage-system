'use client'

import { useState } from 'react'
import {
  AlertTriangle,
  Calendar,
  ChevronDown,
  Clock,
  Edit2,
  Fuel,
  Gauge,
  MapPin,
  Navigation,
  Plus,
  Route,
  Search,
  Sparkles,
  Trash2,
  Truck,
  User,
  Users,
  Wrench,
  X,
} from 'lucide-react'
import { useTrucks } from '@/hooks/useTrucks'
import { showToast } from '@/components/Toast'
import StatCard from '@/components/StatCard'
import Modal from '@/components/Modal'
import { customConfirm } from '@/lib/tauri'
import { Badge } from '@/components/ui/badge'
import { Button } from '@/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Separator } from '@/components/ui/separator'
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import type {
  TruckStatus,
  FuelType,
  DriverStatus,
  TripStatus,
  MaintenanceType,
} from '@/lib/types'

// ── Status color maps ───────────────────────────────────────────────────────

const truckStatusColors: Record<TruckStatus, string> = {
  Available: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
  'On Trip': 'bg-blue-500/15 text-blue-500 border-blue-500/20',
  Maintenance: 'bg-amber-500/15 text-amber-500 border-amber-500/20',
  Inactive: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
}

const driverStatusColors: Record<DriverStatus, string> = {
  Active: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
  'On Leave': 'bg-amber-500/15 text-amber-500 border-amber-500/20',
  Inactive: 'bg-zinc-500/15 text-zinc-400 border-zinc-500/20',
}

const tripStatusColors: Record<TripStatus, string> = {
  Planned: 'bg-sky-500/15 text-sky-400 border-sky-500/20',
  'In Progress': 'bg-blue-500/15 text-blue-400 border-blue-500/20',
  Completed: 'bg-emerald-500/15 text-emerald-500 border-emerald-500/20',
  Cancelled: 'bg-red-500/15 text-red-400 border-red-500/20',
}

// ── Helpers ─────────────────────────────────────────────────────────────────

function formatDate(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
    year: 'numeric',
  })
}

function formatDateShort(iso: string): string {
  if (!iso) return '—'
  return new Date(iso).toLocaleDateString('en-IN', {
    day: '2-digit',
    month: 'short',
  })
}

function daysUntil(iso: string): number {
  return Math.ceil((new Date(iso).getTime() - Date.now()) / (1000 * 60 * 60 * 24))
}

// ── Main Page ───────────────────────────────────────────────────────────────

export default function TrucksPage() {
  const {
    trucks,
    drivers,
    trips,
    maintenance,
    activeTrucks,
    availableTrucks,
    trucksOnTrip,
    trucksInMaintenance,
    activeDrivers,
    availableDrivers,
    activeTrips,
    recentTrips,
    upcomingMaintenance,
    overdueMaintenance,
    totalDistanceKm,
    totalFuelConsumed,
    totalMaintenanceCost,
    getTruckById,
    getDriverById,
    getDriverForTruck,
    getMaintenanceForTruck,
    getTripsForTruck,
    getTripsForDriver,
    addTruck,
    editTruck,
    deleteTruck,
    setTruckStatus,
    addDriver,
    editDriver,
    deleteDriver,
    addTrip,
    updateTrip,
    completeTrip,
    cancelTrip,
    addMaintenance,
    editMaintenance,
    deleteMaintenance,
  } = useTrucks()

  const [activeTab, setActiveTab] = useState('overview')
  const [search, setSearch] = useState('')

  // ── Modal states ────────────────────────────────────────────────────────

  const [showAddTruck, setShowAddTruck] = useState(false)
  const [editingTruckId, setEditingTruckId] = useState<string | null>(null)
  const [showAddDriver, setShowAddDriver] = useState(false)
  const [editingDriverId, setEditingDriverId] = useState<string | null>(null)
  const [showAddTrip, setShowAddTrip] = useState(false)
  const [showAddMaintenance, setShowAddMaintenance] = useState(false)

  // Truck form
  const [fRegNo, setFRegNo] = useState('')
  const [fMake, setFMake] = useState('')
  const [fModel, setFModel] = useState('')
  const [fYear, setFYear] = useState(new Date().getFullYear().toString())
  const [fFuelType, setFFuelType] = useState<FuelType>('Diesel')
  const [fOdometer, setFOdometer] = useState('0')
  const [fInsurance, setFInsurance] = useState('')
  const [fFitness, setFFitness] = useState('')
  const [fNotes, setFNotes] = useState('')

  // Driver form
  const [dName, setDName] = useState('')
  const [dPhone, setDPhone] = useState('')
  const [dLicense, setDLicense] = useState('')
  const [dLicenseExpiry, setDLicenseExpiry] = useState('')
  const [dStatus, setDStatus] = useState<DriverStatus>('Active')

  // Trip form
  const [tTruckId, setTTruckId] = useState('')
  const [tDriverId, setTDriverId] = useState('')
  const [tOrigin, setTOrigin] = useState('')
  const [tDestination, setTDestination] = useState('')
  const [tDistanceKm, setTDistanceKm] = useState('')
  const [tStartTime, setTStartTime] = useState('')
  const [tStatus, setTStatus] = useState<TripStatus>('Planned')
  const [tNotes, setTNotes] = useState('')

  // Maintenance form
  const [mTruckId, setMTruckId] = useState('')
  const [mType, setMType] = useState<MaintenanceType>('General Service')
  const [mDescription, setMDescription] = useState('')
  const [mCost, setMCost] = useState('')
  const [mDate, setMDate] = useState('')
  const [mNextDue, setMNextDue] = useState('')
  const [mOdometer, setMOdometer] = useState('')

  // ── Form Resets ─────────────────────────────────────────────────────────

  const resetTruckForm = () => {
    setFRegNo(''); setFMake(''); setFModel(''); setFYear(new Date().getFullYear().toString())
    setFFuelType('Diesel'); setFOdometer('0'); setFInsurance(''); setFFitness(''); setFNotes('')
  }

  const resetDriverForm = () => {
    setDName(''); setDPhone(''); setDLicense(''); setDLicenseExpiry(''); setDStatus('Active')
  }

  const resetTripForm = () => {
    setTTruckId(''); setTDriverId(''); setTOrigin(''); setTDestination('')
    setTDistanceKm(''); setTStartTime(''); setTStatus('Planned'); setTNotes('')
  }

  const resetMaintenanceForm = () => {
    setMTruckId(''); setMType('General Service'); setMDescription('')
    setMCost(''); setMDate(''); setMNextDue(''); setMOdometer('')
  }

  // ── Truck CRUD Handlers ─────────────────────────────────────────────────

  const handleAddTruck = () => {
    if (!fRegNo.trim() || !fMake.trim() || !fModel.trim()) {
      showToast('Please fill registration, make and model', 'error')
      return
    }
    addTruck({
      registration_number: fRegNo.trim(),
      make: fMake.trim(),
      model: fModel.trim(),
      year: parseInt(fYear) || new Date().getFullYear(),
      status: 'Available',
      driver_id: null,
      fuel_type: fFuelType,
      odometer: parseInt(fOdometer) || 0,
      insurance_expiry: fInsurance,
      fitness_expiry: fFitness,
      notes: fNotes,
    })
    showToast(`Truck "${fRegNo}" added`, 'success')
    resetTruckForm()
    setShowAddTruck(false)
  }

  const openEditTruck = (id: string) => {
    const truck = getTruckById(id)
    if (!truck) return
    setEditingTruckId(id)
    setFRegNo(truck.registration_number)
    setFMake(truck.make)
    setFModel(truck.model)
    setFYear(truck.year.toString())
    setFFuelType(truck.fuel_type)
    setFOdometer(truck.odometer.toString())
    setFInsurance(truck.insurance_expiry)
    setFFitness(truck.fitness_expiry)
    setFNotes(truck.notes)
  }

  const handleSaveEditTruck = () => {
    if (!editingTruckId) return
    editTruck(editingTruckId, {
      registration_number: fRegNo.trim(),
      make: fMake.trim(),
      model: fModel.trim(),
      year: parseInt(fYear) || new Date().getFullYear(),
      fuel_type: fFuelType,
      odometer: parseInt(fOdometer) || 0,
      insurance_expiry: fInsurance,
      fitness_expiry: fFitness,
      notes: fNotes,
    })
    showToast('Truck updated', 'success')
    resetTruckForm()
    setEditingTruckId(null)
  }

  const handleDeleteTruck = async (id: string) => {
    const truck = getTruckById(id)
    const confirmed = await customConfirm(`Delete truck "${truck?.registration_number}"?`)
    if (confirmed) {
      deleteTruck(id)
      showToast('Truck deleted', 'info')
    }
  }

  // ── Driver CRUD Handlers ────────────────────────────────────────────────

  const handleAddDriver = () => {
    if (!dName.trim() || !dLicense.trim()) {
      showToast('Please fill name and license number', 'error')
      return
    }
    addDriver({
      name: dName.trim(),
      phone: dPhone.trim(),
      license_number: dLicense.trim(),
      license_expiry: dLicenseExpiry,
      status: dStatus,
      assigned_truck_id: null,
    })
    showToast(`Driver "${dName}" added`, 'success')
    resetDriverForm()
    setShowAddDriver(false)
  }

  const openEditDriver = (id: string) => {
    const driver = getDriverById(id)
    if (!driver) return
    setEditingDriverId(id)
    setDName(driver.name)
    setDPhone(driver.phone)
    setDLicense(driver.license_number)
    setDLicenseExpiry(driver.license_expiry)
    setDStatus(driver.status)
  }

  const handleSaveEditDriver = () => {
    if (!editingDriverId) return
    editDriver(editingDriverId, {
      name: dName.trim(),
      phone: dPhone.trim(),
      license_number: dLicense.trim(),
      license_expiry: dLicenseExpiry,
      status: dStatus,
    })
    showToast('Driver updated', 'success')
    resetDriverForm()
    setEditingDriverId(null)
  }

  const handleDeleteDriver = async (id: string) => {
    const driver = getDriverById(id)
    const confirmed = await customConfirm(`Delete driver "${driver?.name}"?`)
    if (confirmed) {
      deleteDriver(id)
      showToast('Driver deleted', 'info')
    }
  }

  // ── Trip CRUD Handlers ──────────────────────────────────────────────────

  const handleAddTrip = () => {
    if (!tTruckId || !tDriverId || !tOrigin.trim() || !tDestination.trim()) {
      showToast('Please fill all required trip fields', 'error')
      return
    }
    addTrip({
      truck_id: tTruckId,
      driver_id: tDriverId,
      origin: tOrigin.trim(),
      destination: tDestination.trim(),
      distance_km: parseFloat(tDistanceKm) || 0,
      start_time: tStartTime || new Date().toISOString(),
      end_time: null,
      status: tStatus,
      fuel_consumed: null,
      notes: tNotes,
    })
    showToast('Trip created', 'success')
    resetTripForm()
    setShowAddTrip(false)
  }

  // ── Maintenance CRUD Handlers ───────────────────────────────────────────

  const handleAddMaintenance = () => {
    if (!mTruckId || !mDescription.trim()) {
      showToast('Please select truck and describe maintenance', 'error')
      return
    }
    addMaintenance({
      truck_id: mTruckId,
      type: mType,
      description: mDescription.trim(),
      cost: parseFloat(mCost) || 0,
      date: mDate || new Date().toISOString().split('T')[0],
      next_due_date: mNextDue || null,
      odometer_at_service: parseInt(mOdometer) || 0,
    })
    showToast('Maintenance record added', 'success')
    resetMaintenanceForm()
    setShowAddMaintenance(false)
  }

  // ── Filtered data ───────────────────────────────────────────────────────

  const filteredTrucks = trucks.filter(
    (t) =>
      t.registration_number.toLowerCase().includes(search.toLowerCase()) ||
      t.make.toLowerCase().includes(search.toLowerCase()) ||
      t.model.toLowerCase().includes(search.toLowerCase())
  )

  const filteredDrivers = drivers.filter(
    (d) =>
      d.name.toLowerCase().includes(search.toLowerCase()) ||
      d.license_number.toLowerCase().includes(search.toLowerCase())
  )

  const filteredTrips = trips.filter(
    (t) =>
      t.origin.toLowerCase().includes(search.toLowerCase()) ||
      t.destination.toLowerCase().includes(search.toLowerCase())
  )

  // ── Truck Form Modal Body ───────────────────────────────────────────────

  const TruckFormBody = () => (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Registration Number *</Label>
          <Input placeholder="MH-01-AB-1234" value={fRegNo} onChange={(e) => setFRegNo(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Year</Label>
          <Input type="number" placeholder="2024" value={fYear} onChange={(e) => setFYear(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Make *</Label>
          <Input placeholder="Tata" value={fMake} onChange={(e) => setFMake(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Model *</Label>
          <Input placeholder="Prima 4928" value={fModel} onChange={(e) => setFModel(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Fuel Type</Label>
          <Select value={fFuelType} onValueChange={(v) => setFFuelType(v as FuelType)}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {(['Diesel', 'Petrol', 'CNG', 'Electric', 'Hybrid'] as FuelType[]).map((f) => (
                <SelectItem key={f} value={f}>{f}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <div className="space-y-2">
          <Label>Odometer (km)</Label>
          <Input type="number" placeholder="0" value={fOdometer} onChange={(e) => setFOdometer(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Insurance Expiry</Label>
          <Input type="date" value={fInsurance} onChange={(e) => setFInsurance(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Fitness Expiry</Label>
          <Input type="date" value={fFitness} onChange={(e) => setFFitness(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Notes</Label>
        <Input placeholder="Additional notes..." value={fNotes} onChange={(e) => setFNotes(e.target.value)} />
      </div>
    </div>
  )

  // ── Driver Form Modal Body ──────────────────────────────────────────────

  const DriverFormBody = () => (
    <div className="grid gap-4">
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>Full Name *</Label>
          <Input placeholder="Ramesh Kumar" value={dName} onChange={(e) => setDName(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>Phone</Label>
          <Input placeholder="+91 98765 43210" value={dPhone} onChange={(e) => setDPhone(e.target.value)} />
        </div>
      </div>
      <div className="grid gap-4 sm:grid-cols-2">
        <div className="space-y-2">
          <Label>License Number *</Label>
          <Input placeholder="MH-0120230012345" value={dLicense} onChange={(e) => setDLicense(e.target.value)} />
        </div>
        <div className="space-y-2">
          <Label>License Expiry</Label>
          <Input type="date" value={dLicenseExpiry} onChange={(e) => setDLicenseExpiry(e.target.value)} />
        </div>
      </div>
      <div className="space-y-2">
        <Label>Status</Label>
        <Select value={dStatus} onValueChange={(v) => setDStatus(v as DriverStatus)}>
          <SelectTrigger><SelectValue /></SelectTrigger>
          <SelectContent>
            {(['Active', 'On Leave', 'Inactive'] as DriverStatus[]).map((s) => (
              <SelectItem key={s} value={s}>{s}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  )

  // ── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="space-y-7 lg:space-y-9 animate-fadeIn">
      {/* Page Header */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <Badge variant="outline" className="mb-3 border-primary/20 bg-primary/5 text-primary">
            <Truck className="mr-1 size-3" /> Fleet Management
          </Badge>
          <h1 className="page-title">Fleet</h1>
          <p className="page-subtitle">Manage your trucks, drivers, trips, and maintenance.</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="relative">
            <Search className="absolute left-3 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
            <Input
              placeholder="Search fleet..."
              className="w-[220px] pl-9"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>
        </div>
      </div>

      {/* Tabs */}
      <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="overview">Overview</TabsTrigger>
          <TabsTrigger value="fleet">Fleet</TabsTrigger>
          <TabsTrigger value="drivers">Drivers</TabsTrigger>
          <TabsTrigger value="trips">Trips</TabsTrigger>
          <TabsTrigger value="maintenance">Maintenance</TabsTrigger>
        </TabsList>

        {/* ── OVERVIEW TAB ───────────────────────────────────────────────── */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          {/* Stats row */}
          <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon="🚛" value={trucks.length} label="Total Trucks" />
            <StatCard icon="🟢" value={activeTrips.length} label="Active Trips" color="success" />
            <StatCard icon="👤" value={activeDrivers.length} label="Active Drivers" color="info" />
            <StatCard
              icon="🔧"
              value={overdueMaintenance.length}
              label="Maintenance Alerts"
              color={overdueMaintenance.length > 0 ? 'warning' : 'success'}
            />
          </div>

          {/* Second stats row */}
          <div className="grid gap-4 sm:grid-cols-3">
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Total Distance</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalDistanceKm.toLocaleString()} km</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Fuel Consumed</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">{totalFuelConsumed.toLocaleString()} L</p>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2">
                <CardTitle className="text-sm font-medium text-muted-foreground">Maintenance Cost</CardTitle>
              </CardHeader>
              <CardContent>
                <p className="text-2xl font-bold">₹{totalMaintenanceCost.toLocaleString()}</p>
              </CardContent>
            </Card>
          </div>

          {/* Bottom grid: recent trips + fleet status + maintenance alerts */}
          <div className="grid gap-5 xl:grid-cols-[1fr_1fr]">
            {/* Fleet status */}
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
                <div>
                  <CardTitle>Fleet Status</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Current truck availability.</p>
                </div>
                <Truck className="size-5 text-primary" />
              </CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableBody>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Available</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-emerald-500/15 text-emerald-500">{availableTrucks.length}</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">On Trip</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-blue-500/15 text-blue-500">{trucksOnTrip.length}</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">In Maintenance</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-amber-500/15 text-amber-500">{trucksInMaintenance.length}</Badge>
                      </TableCell>
                    </TableRow>
                    <TableRow>
                      <TableCell className="text-muted-foreground">Inactive</TableCell>
                      <TableCell className="text-right">
                        <Badge className="bg-zinc-500/15 text-zinc-400">
                          {trucks.filter((t) => t.status === 'Inactive').length}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  </TableBody>
                </Table>
              </CardContent>
            </Card>

            {/* Maintenance alerts */}
            <Card className="overflow-hidden">
              <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
                <div>
                  <CardTitle>Maintenance Alerts</CardTitle>
                  <p className="mt-1 text-sm text-muted-foreground">Upcoming and overdue services.</p>
                </div>
                <Wrench className="size-5 text-amber-500" />
              </CardHeader>
              <CardContent>
                {overdueMaintenance.length === 0 && upcomingMaintenance.length === 0 ? (
                  <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                    <Wrench className="mb-3 size-8 opacity-30" />
                    <p className="text-sm">No maintenance alerts</p>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {overdueMaintenance.slice(0, 3).map((m) => {
                      const truck = getTruckById(m.truck_id)
                      return (
                        <div key={m.id} className="flex items-center gap-3 rounded-lg border border-red-500/20 bg-red-500/5 p-3">
                          <AlertTriangle className="size-4 shrink-0 text-red-500" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{truck?.registration_number ?? 'Unknown'}</p>
                            <p className="truncate text-xs text-muted-foreground">{m.type} — overdue</p>
                          </div>
                          <span className="text-xs text-red-400">{formatDateShort(m.next_due_date!)}</span>
                        </div>
                      )
                    })}
                    {upcomingMaintenance.slice(0, 3).map((m) => {
                      const truck = getTruckById(m.truck_id)
                      const days = daysUntil(m.next_due_date!)
                      return (
                        <div key={m.id} className="flex items-center gap-3 rounded-lg border border-amber-500/20 bg-amber-500/5 p-3">
                          <Clock className="size-4 shrink-0 text-amber-500" />
                          <div className="min-w-0 flex-1">
                            <p className="truncate text-sm font-medium">{truck?.registration_number ?? 'Unknown'}</p>
                            <p className="truncate text-xs text-muted-foreground">{m.type}</p>
                          </div>
                          <span className="text-xs text-amber-400">in {days}d</span>
                        </div>
                      )
                    })}
                  </div>
                )}
              </CardContent>
            </Card>
          </div>

          {/* Recent Trips */}
          <Card className="overflow-hidden">
            <CardHeader className="flex flex-row items-center justify-between border-b border-border/50 pb-4">
              <div>
                <CardTitle>Recent Trips</CardTitle>
                <p className="mt-1 text-sm text-muted-foreground">Last 10 trip records.</p>
              </div>
              <Route className="size-5 text-primary" />
            </CardHeader>
            <CardContent className="p-0">
              {recentTrips.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 text-center text-muted-foreground">
                  <Route className="mb-3 size-8 opacity-30" />
                  <p className="text-sm">No trips recorded yet</p>
                </div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Route</TableHead>
                      <TableHead>Truck</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Date</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {recentTrips.map((trip) => {
                      const truck = getTruckById(trip.truck_id)
                      const driver = getDriverById(trip.driver_id)
                      return (
                        <TableRow key={trip.id}>
                          <TableCell>
                            <div className="flex items-center gap-1.5">
                              <MapPin className="size-3 shrink-0 text-muted-foreground" />
                              <span className="truncate">{trip.origin}</span>
                              <span className="text-muted-foreground">→</span>
                              <span className="truncate">{trip.destination}</span>
                            </div>
                          </TableCell>
                          <TableCell className="font-mono text-xs">{truck?.registration_number ?? '—'}</TableCell>
                          <TableCell>{driver?.name ?? '—'}</TableCell>
                          <TableCell>{trip.distance_km} km</TableCell>
                          <TableCell>
                            <Badge variant="outline" className={tripStatusColors[trip.status]}>
                              {trip.status}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-muted-foreground">{formatDateShort(trip.start_time)}</TableCell>
                        </TableRow>
                      )
                    })}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* ── FLEET TAB ──────────────────────────────────────────────────── */}
        <TabsContent value="fleet" className="mt-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{filteredTrucks.length} truck{filteredTrucks.length !== 1 ? 's' : ''}</p>
            <Button onClick={() => { resetTruckForm(); setShowAddTruck(true) }}>
              <Plus className="mr-1 size-4" /> Add Truck
            </Button>
          </div>

          {filteredTrucks.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Truck className="mb-4 size-12 text-muted-foreground/30" />
                <p className="text-lg font-medium">No trucks yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add your first truck to get started.</p>
                <Button className="mt-4" onClick={() => { resetTruckForm(); setShowAddTruck(true) }}>
                  <Plus className="mr-1 size-4" /> Add Truck
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredTrucks.map((truck) => {
                const driver = getDriverForTruck(truck.id)
                const insuranceDays = truck.insurance_expiry ? daysUntil(truck.insurance_expiry) : null
                const fitnessDays = truck.fitness_expiry ? daysUntil(truck.fitness_expiry) : null

                return (
                  <Card key={truck.id} className="group relative overflow-hidden transition-shadow hover:shadow-lg">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div>
                          <CardTitle className="font-mono text-base">{truck.registration_number}</CardTitle>
                          <p className="mt-0.5 text-sm text-muted-foreground">{truck.make} {truck.model} · {truck.year}</p>
                        </div>
                        <Badge variant="outline" className={truckStatusColors[truck.status]}>{truck.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm">
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Fuel className="size-3.5" />
                          <span>{truck.fuel_type}</span>
                        </div>
                        <div className="flex items-center gap-1.5 text-muted-foreground">
                          <Gauge className="size-3.5" />
                          <span>{truck.odometer.toLocaleString()} km</span>
                        </div>
                      </div>
                      {driver && (
                        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                          <User className="size-3.5 text-primary" />
                          <span className="truncate">{driver.name}</span>
                        </div>
                      )}
                      {/* Expiry warnings */}
                      {(insuranceDays !== null && insuranceDays <= 30) && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-500">
                          <AlertTriangle className="size-3" />
                          Insurance {insuranceDays <= 0 ? 'expired' : `expires in ${insuranceDays}d`}
                        </div>
                      )}
                      {(fitnessDays !== null && fitnessDays <= 30) && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-500">
                          <AlertTriangle className="size-3" />
                          Fitness {fitnessDays <= 0 ? 'expired' : `expires in ${fitnessDays}d`}
                        </div>
                      )}
                      <Separator />
                      <div className="flex items-center gap-2">
                        <Select
                          value={truck.status}
                          onValueChange={(v) => setTruckStatus(truck.id, v as TruckStatus)}
                        >
                          <SelectTrigger className="h-8 flex-1 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['Available', 'On Trip', 'Maintenance', 'Inactive'] as TruckStatus[]).map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button variant="outline" size="icon" className="size-8" onClick={() => openEditTruck(truck.id)}>
                          <Edit2 className="size-3.5" />
                        </Button>
                        <Button variant="outline" size="icon" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteTruck(truck.id)}>
                          <Trash2 className="size-3.5" />
                        </Button>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── DRIVERS TAB ────────────────────────────────────────────────── */}
        <TabsContent value="drivers" className="mt-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{filteredDrivers.length} driver{filteredDrivers.length !== 1 ? 's' : ''}</p>
            <Button onClick={() => { resetDriverForm(); setShowAddDriver(true) }}>
              <Plus className="mr-1 size-4" /> Add Driver
            </Button>
          </div>

          {filteredDrivers.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Users className="mb-4 size-12 text-muted-foreground/30" />
                <p className="text-lg font-medium">No drivers yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Add drivers to assign them to trucks.</p>
                <Button className="mt-4" onClick={() => { resetDriverForm(); setShowAddDriver(true) }}>
                  <Plus className="mr-1 size-4" /> Add Driver
                </Button>
              </CardContent>
            </Card>
          ) : (
            <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
              {filteredDrivers.map((driver) => {
                const assignedTruck = driver.assigned_truck_id ? getTruckById(driver.assigned_truck_id) : null
                const licenseDays = driver.license_expiry ? daysUntil(driver.license_expiry) : null
                const tripCount = getTripsForDriver(driver.id).length

                return (
                  <Card key={driver.id} className="overflow-hidden transition-shadow hover:shadow-lg">
                    <CardHeader className="pb-3">
                      <div className="flex items-start justify-between">
                        <div className="flex items-center gap-3">
                          <div className="flex size-10 items-center justify-center rounded-full bg-primary/10 text-primary">
                            <User className="size-5" />
                          </div>
                          <div>
                            <CardTitle className="text-base">{driver.name}</CardTitle>
                            <p className="text-xs text-muted-foreground">{driver.phone || 'No phone'}</p>
                          </div>
                        </div>
                        <Badge variant="outline" className={driverStatusColors[driver.status]}>{driver.status}</Badge>
                      </div>
                    </CardHeader>
                    <CardContent className="space-y-3">
                      <div className="grid grid-cols-2 gap-2 text-sm text-muted-foreground">
                        <div className="flex items-center gap-1.5">
                          <span className="text-xs font-medium">License:</span>
                          <span className="truncate font-mono text-xs">{driver.license_number}</span>
                        </div>
                        <div className="flex items-center gap-1.5">
                          <Route className="size-3.5" />
                          <span>{tripCount} trips</span>
                        </div>
                      </div>
                      {assignedTruck && (
                        <div className="flex items-center gap-2 rounded-md bg-muted/50 px-2.5 py-1.5 text-sm">
                          <Truck className="size-3.5 text-primary" />
                          <span className="truncate font-mono text-xs">{assignedTruck.registration_number}</span>
                        </div>
                      )}
                      {licenseDays !== null && licenseDays <= 30 && (
                        <div className="flex items-center gap-1.5 text-xs text-amber-500">
                          <AlertTriangle className="size-3" />
                          License {licenseDays <= 0 ? 'expired' : `expires in ${licenseDays}d`}
                        </div>
                      )}
                      <Separator />
                      <div className="flex items-center justify-between">
                        <Select
                          value={driver.status}
                          onValueChange={(v) => editDriver(driver.id, { status: v as DriverStatus })}
                        >
                          <SelectTrigger className="h-8 w-28 text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            {(['Active', 'On Leave', 'Inactive'] as DriverStatus[]).map((s) => (
                              <SelectItem key={s} value={s}>{s}</SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <div className="flex items-center gap-2">
                          <Button variant="outline" size="icon" className="size-8" onClick={() => openEditDriver(driver.id)}>
                            <Edit2 className="size-3.5" />
                          </Button>
                          <Button variant="outline" size="icon" className="size-8 text-destructive hover:bg-destructive/10" onClick={() => handleDeleteDriver(driver.id)}>
                            <Trash2 className="size-3.5" />
                          </Button>
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                )
              })}
            </div>
          )}
        </TabsContent>

        {/* ── TRIPS TAB ──────────────────────────────────────────────────── */}
        <TabsContent value="trips" className="mt-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{filteredTrips.length} trip{filteredTrips.length !== 1 ? 's' : ''}</p>
            <Button onClick={() => { resetTripForm(); setShowAddTrip(true) }}>
              <Plus className="mr-1 size-4" /> New Trip
            </Button>
          </div>

          {filteredTrips.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Navigation className="mb-4 size-12 text-muted-foreground/30" />
                <p className="text-lg font-medium">No trips yet</p>
                <p className="mt-1 text-sm text-muted-foreground">Create a trip to start tracking fleet movements.</p>
                <Button className="mt-4" onClick={() => { resetTripForm(); setShowAddTrip(true) }}>
                  <Plus className="mr-1 size-4" /> New Trip
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Route</TableHead>
                      <TableHead>Truck</TableHead>
                      <TableHead>Driver</TableHead>
                      <TableHead>Distance</TableHead>
                      <TableHead>Fuel</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead>Started</TableHead>
                      <TableHead className="w-[100px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredTrips
                      .sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime())
                      .map((trip) => {
                        const truck = getTruckById(trip.truck_id)
                        const driver = getDriverById(trip.driver_id)
                        return (
                          <TableRow key={trip.id}>
                            <TableCell>
                              <div className="flex items-center gap-1.5">
                                <MapPin className="size-3 shrink-0 text-emerald-500" />
                                <span className="truncate text-sm">{trip.origin}</span>
                                <span className="text-muted-foreground">→</span>
                                <MapPin className="size-3 shrink-0 text-red-500" />
                                <span className="truncate text-sm">{trip.destination}</span>
                              </div>
                            </TableCell>
                            <TableCell className="font-mono text-xs">{truck?.registration_number ?? '—'}</TableCell>
                            <TableCell className="text-sm">{driver?.name ?? '—'}</TableCell>
                            <TableCell>{trip.distance_km} km</TableCell>
                            <TableCell>{trip.fuel_consumed ? `${trip.fuel_consumed} L` : '—'}</TableCell>
                            <TableCell>
                              <Badge variant="outline" className={tripStatusColors[trip.status]}>{trip.status}</Badge>
                            </TableCell>
                            <TableCell className="text-xs text-muted-foreground">{formatDate(trip.start_time)}</TableCell>
                            <TableCell>
                              <div className="flex items-center gap-1">
                                {trip.status === 'In Progress' && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs text-emerald-500"
                                    onClick={() => completeTrip(trip.id, new Date().toISOString())}
                                  >
                                    Complete
                                  </Button>
                                )}
                                {(trip.status === 'Planned' || trip.status === 'In Progress') && (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 text-xs text-destructive"
                                    onClick={() => cancelTrip(trip.id)}
                                  >
                                    Cancel
                                  </Button>
                                )}
                              </div>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* ── MAINTENANCE TAB ────────────────────────────────────────────── */}
        <TabsContent value="maintenance" className="mt-6 space-y-5">
          <div className="flex items-center justify-between">
            <p className="text-sm text-muted-foreground">{maintenance.length} record{maintenance.length !== 1 ? 's' : ''}</p>
            <Button onClick={() => { resetMaintenanceForm(); setShowAddMaintenance(true) }}>
              <Plus className="mr-1 size-4" /> Add Record
            </Button>
          </div>

          {maintenance.length === 0 ? (
            <Card>
              <CardContent className="flex flex-col items-center justify-center py-16 text-center">
                <Wrench className="mb-4 size-12 text-muted-foreground/30" />
                <p className="text-lg font-medium">No maintenance records</p>
                <p className="mt-1 text-sm text-muted-foreground">Start tracking vehicle maintenance and service history.</p>
                <Button className="mt-4" onClick={() => { resetMaintenanceForm(); setShowAddMaintenance(true) }}>
                  <Plus className="mr-1 size-4" /> Add Record
                </Button>
              </CardContent>
            </Card>
          ) : (
            <Card className="overflow-hidden">
              <CardContent className="p-0">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Truck</TableHead>
                      <TableHead>Type</TableHead>
                      <TableHead>Description</TableHead>
                      <TableHead>Cost</TableHead>
                      <TableHead>Odometer</TableHead>
                      <TableHead>Date</TableHead>
                      <TableHead>Next Due</TableHead>
                      <TableHead className="w-[60px]">Actions</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {[...maintenance]
                      .sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime())
                      .map((record) => {
                        const truck = getTruckById(record.truck_id)
                        const isDue = record.next_due_date && new Date(record.next_due_date) <= new Date()
                        return (
                          <TableRow key={record.id} className={isDue ? 'bg-red-500/5' : ''}>
                            <TableCell className="font-mono text-xs">{truck?.registration_number ?? '—'}</TableCell>
                            <TableCell>
                              <Badge variant="outline">{record.type}</Badge>
                            </TableCell>
                            <TableCell className="max-w-[200px] truncate text-sm">{record.description}</TableCell>
                            <TableCell>₹{record.cost.toLocaleString()}</TableCell>
                            <TableCell className="text-muted-foreground">{record.odometer_at_service.toLocaleString()} km</TableCell>
                            <TableCell className="text-muted-foreground">{formatDate(record.date)}</TableCell>
                            <TableCell>
                              {record.next_due_date ? (
                                <span className={isDue ? 'font-medium text-red-500' : 'text-muted-foreground'}>
                                  {formatDate(record.next_due_date)}
                                  {isDue && <AlertTriangle className="ml-1 inline size-3" />}
                                </span>
                              ) : '—'}
                            </TableCell>
                            <TableCell>
                              <Button
                                variant="outline"
                                size="icon"
                                className="size-7 text-destructive hover:bg-destructive/10"
                                onClick={async () => {
                                  const confirmed = await customConfirm('Delete this maintenance record?');
                                  if (confirmed) {
                                    deleteMaintenance(record.id)
                                    showToast('Record deleted', 'info')
                                  }
                                }}
                              >
                                <Trash2 className="size-3" />
                              </Button>
                            </TableCell>
                          </TableRow>
                        )
                      })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>
      </Tabs>

      {/* ── MODALS ─────────────────────────────────────────────────────────── */}

      {/* Add Truck Modal */}
      <Modal
        isOpen={showAddTruck}
        onClose={() => setShowAddTruck(false)}
        title="Add New Truck"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowAddTruck(false)}>Cancel</Button>
            <Button onClick={handleAddTruck}>Add Truck</Button>
          </>
        }
      >
        <TruckFormBody />
      </Modal>

      {/* Edit Truck Modal */}
      <Modal
        isOpen={editingTruckId !== null}
        onClose={() => { setEditingTruckId(null); resetTruckForm() }}
        title="Edit Truck"
        actions={
          <>
            <Button variant="outline" onClick={() => { setEditingTruckId(null); resetTruckForm() }}>Cancel</Button>
            <Button onClick={handleSaveEditTruck}>Save Changes</Button>
          </>
        }
      >
        <TruckFormBody />
      </Modal>

      {/* Add Driver Modal */}
      <Modal
        isOpen={showAddDriver}
        onClose={() => setShowAddDriver(false)}
        title="Add New Driver"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowAddDriver(false)}>Cancel</Button>
            <Button onClick={handleAddDriver}>Add Driver</Button>
          </>
        }
      >
        <DriverFormBody />
      </Modal>

      {/* Edit Driver Modal */}
      <Modal
        isOpen={editingDriverId !== null}
        onClose={() => { setEditingDriverId(null); resetDriverForm() }}
        title="Edit Driver"
        actions={
          <>
            <Button variant="outline" onClick={() => { setEditingDriverId(null); resetDriverForm() }}>Cancel</Button>
            <Button onClick={handleSaveEditDriver}>Save Changes</Button>
          </>
        }
      >
        <DriverFormBody />
      </Modal>

      {/* Add Trip Modal */}
      <Modal
        isOpen={showAddTrip}
        onClose={() => setShowAddTrip(false)}
        title="Create New Trip"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowAddTrip(false)}>Cancel</Button>
            <Button onClick={handleAddTrip}>Create Trip</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Truck *</Label>
              <Select value={tTruckId} onValueChange={setTTruckId}>
                <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                <SelectContent>
                  {trucks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.registration_number} — {t.make} {t.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Driver *</Label>
              <Select value={tDriverId} onValueChange={setTDriverId}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  {activeDrivers.map((d) => (
                    <SelectItem key={d.id} value={d.id}>{d.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Origin *</Label>
              <Input placeholder="Mumbai" value={tOrigin} onChange={(e) => setTOrigin(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Destination *</Label>
              <Input placeholder="Delhi" value={tDestination} onChange={(e) => setTDestination(e.target.value)} />
            </div>
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Distance (km)</Label>
              <Input type="number" placeholder="1400" value={tDistanceKm} onChange={(e) => setTDistanceKm(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Start Time</Label>
              <Input type="datetime-local" value={tStartTime} onChange={(e) => setTStartTime(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Status</Label>
              <Select value={tStatus} onValueChange={(v) => setTStatus(v as TripStatus)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['Planned', 'In Progress'] as TripStatus[]).map((s) => (
                    <SelectItem key={s} value={s}>{s}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Notes</Label>
            <Input placeholder="Special instructions, cargo details..." value={tNotes} onChange={(e) => setTNotes(e.target.value)} />
          </div>
        </div>
      </Modal>

      {/* Add Maintenance Modal */}
      <Modal
        isOpen={showAddMaintenance}
        onClose={() => setShowAddMaintenance(false)}
        title="Add Maintenance Record"
        actions={
          <>
            <Button variant="outline" onClick={() => setShowAddMaintenance(false)}>Cancel</Button>
            <Button onClick={handleAddMaintenance}>Add Record</Button>
          </>
        }
      >
        <div className="grid gap-4">
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-2">
              <Label>Truck *</Label>
              <Select value={mTruckId} onValueChange={setMTruckId}>
                <SelectTrigger><SelectValue placeholder="Select truck" /></SelectTrigger>
                <SelectContent>
                  {trucks.map((t) => (
                    <SelectItem key={t.id} value={t.id}>
                      {t.registration_number} — {t.make} {t.model}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Type</Label>
              <Select value={mType} onValueChange={(v) => setMType(v as MaintenanceType)}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {(['Oil Change', 'Tire Replacement', 'Brake Service', 'Engine Repair', 'General Service', 'Other'] as MaintenanceType[]).map((t) => (
                    <SelectItem key={t} value={t}>{t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <div className="space-y-2">
            <Label>Description *</Label>
            <Input placeholder="Describe the maintenance work..." value={mDescription} onChange={(e) => setMDescription(e.target.value)} />
          </div>
          <div className="grid gap-4 sm:grid-cols-3">
            <div className="space-y-2">
              <Label>Cost (₹)</Label>
              <Input type="number" placeholder="5000" value={mCost} onChange={(e) => setMCost(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Date</Label>
              <Input type="date" value={mDate} onChange={(e) => setMDate(e.target.value)} />
            </div>
            <div className="space-y-2">
              <Label>Odometer (km)</Label>
              <Input type="number" placeholder="50000" value={mOdometer} onChange={(e) => setMOdometer(e.target.value)} />
            </div>
          </div>
          <div className="space-y-2">
            <Label>Next Due Date</Label>
            <Input type="date" value={mNextDue} onChange={(e) => setMNextDue(e.target.value)} />
          </div>
        </div>
      </Modal>
    </div>
  )
}
