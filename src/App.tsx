import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react'
import {
  Activity, Award, Bell, BookOpen, CalendarDays, Check, CheckCircle2, ChevronDown, ChevronRight,
  CircleHelp, Clock3, Download, ExternalLink, FileText, GraduationCap, LayoutDashboard,
  ListTodo, LoaderCircle, LogOut, Mail, Menu, Moon, Plus, RefreshCw, Search, Settings,
  ShieldCheck, SlidersHorizontal, Sparkles, Sun, Wallet, X,
} from 'lucide-react'
import {
  Area, AreaChart, Bar, BarChart, CartesianGrid, ResponsiveContainer, Tooltip, XAxis, YAxis,
} from 'recharts'
import { ResearchSearchPage } from './ResearchSearchPage'
import { ScholarshipsPage } from './ScholarshipsPage'
import { compareScholarshipOpportunities as compareOpportunityRank, freshVerifiedEvidence, fundingStatus, rankScholarshipOpportunities, tierFor } from './lib/scholarshipLogic'
import { initialWorkspace } from './data'
import { supabase, supabaseConfigured } from './lib/supabase'
import { parseApplicantWorkbook } from './lib/workbook'
import { safeHttpsUrl, safeMailto } from './lib/safeUrl'
import { isValidBudgetBackup, isValidDocumentsBackup, isValidProfessorContactsBackup, isValidWorkspaceBackup } from './lib/backupValidation'
import type { AcceptanceStatus, Category, ClaimEvidence, Country, Evidence, Profile, ProgramRequirement, RecommendationLetter, ScholarshipOpportunity, Stage, Task, University, Verification, Workspace } from './types'

type View = 'Overview' | 'University research' | 'Scholarships & funding' | 'Official search' | 'Applications' | 'Tasks & calendar' | 'Funding & budget' | 'Documents' | 'Professor outreach' | 'Sources & reports' | 'Settings'
const nav: { label: View; icon: typeof LayoutDashboard }[] = [
  { label: 'Overview', icon: LayoutDashboard }, { label: 'University research', icon: GraduationCap },
  { label: 'Scholarships & funding', icon: Award },
  { label: 'Official search', icon: Search },
  { label: 'Applications', icon: Activity }, { label: 'Tasks & calendar', icon: CalendarDays },
  { label: 'Funding & budget', icon: Wallet }, { label: 'Documents', icon: FileText },
  { label: 'Professor outreach', icon: Mail }, { label: 'Sources & reports', icon: BookOpen },
]
const stageOptions: Stage[] = ['Researching', 'Supervisor contact', 'Preparing', 'Submitted', 'Interview', 'Admitted', 'Waitlisted', 'Rejected', 'Offer accepted', 'Visa', 'Pre-departure']
const categories: Category[] = ['Ambitious', 'Match', 'Funding-focused']
const countries: Country[] = ['South Korea', 'Germany', 'France']
const badge: Record<Verification, string> = {
  confirmed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
  unverified: 'bg-amber-50 text-amber-700 border-amber-200',
  historical: 'bg-slate-100 text-slate-600 border-slate-200',
  estimate: 'bg-blue-50 text-blue-700 border-blue-200',
  unknown: 'bg-slate-100 text-slate-500 border-slate-200',
}
const today = (timezone: string) => new Intl.DateTimeFormat('en-CA', { timeZone: timezone }).format(new Date())
const newId = () => crypto.randomUUID()
const normalizeUniversityName = (name: string) => name.trim().toLowerCase().replace(/\s*\([^)]*\)\s*/g, ' ').replace(/\s+/g, ' ').trim()
const normalizeOpportunity = (value: Partial<ScholarshipOpportunity>): ScholarshipOpportunity => {
  const defaults = initialWorkspace.opportunities[0]
  return {
    ...defaults, ...value,
    tuition: { ...defaults.tuition, ...value.tuition },
    livingStipend: { ...defaults.livingStipend, ...value.livingStipend },
    housing: { ...defaults.housing, ...value.housing },
    healthInsurance: { ...defaults.healthInsurance, ...value.healthInsurance },
    airfare: { ...defaults.airfare, ...value.airfare },
    mandatoryFees: { ...defaults.mandatoryFees, ...value.mandatoryFees },
    upfrontCash: { ...defaults.upfrontCash, ...value.upfrontCash },
    claimEvidence: Array.isArray(value.claimEvidence) ? value.claimEvidence : [],
    applicationEvidence: Array.isArray(value.applicationEvidence) ? value.applicationEvidence : [],
    languageEvidence: Array.isArray(value.languageEvidence) ? value.languageEvidence : [],
    waiverProfileEligibility: value.waiverProfileEligibility ?? 'Unverified',
    moiProfileEligibility: value.moiProfileEligibility ?? 'Unverified',
  }
}
const dateLabel = (value?: string) => value ? new Intl.DateTimeFormat('en', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' }).format(new Date(`${value}T12:00:00Z`)) : 'Not confirmed'
const timestampLabel = (value: string | undefined, timezone: string) => {
  if (!value) return 'Never'
  if (/^\d{4}-\d{2}-\d{2}$/.test(value)) return `${dateLabel(value)} Â· time not recorded`
  return new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(value))
}
type Currency = 'KRW' | 'EUR' | 'BDT'
type Budget = { currency: Currency; monthlyLiving: string; annualTuition: string; travel: string; fees: string; insurance: string; guaranteedMonthly: string }
type DocumentStatus = 'Available' | 'Needed' | 'In progress' | 'Booked â€” result pending'
type DocumentRecord = { id: string; name: string; type: string; issued: string; expiry: string; status: string; translation: string; notarization: string; apostille: string; storagePath?: string | null }
type ProfessorRecord = { id: string; professor: string; lab: string; email: string; contacted: string; followUp: string; fit: string; papers: string; notes: string; funding: string; nextAction: string }
type RefreshFailure = { id: string; checked_at: string; error_message: string | null; source_evidence_id: string | null }
type SourceChange = { id: string; sourceEvidenceId: string; oldHash: string | null; newHash: string; detectedAt: string; reviewStatus: 'pending' | 'reviewed' | 'dismissed'; oldSnapshot: string | null; newSnapshot: string | null; url: string; type: string; intake: string; university: string }
const emptyBudget: Budget = { currency: 'KRW', monthlyLiving: '', annualTuition: '', travel: '', fees: '', insurance: '', guaranteedMonthly: '' }
const readBudget = (key: string): Budget => {
  const saved = readLocalValue<Partial<Budget>>(key, {})
  const currency: Currency = saved.currency === 'EUR' || saved.currency === 'BDT' ? saved.currency : 'KRW'
  return { ...emptyBudget, ...saved, currency }
}
const currencySymbols: Record<Currency, string> = { KRW: 'â‚©', EUR: 'â‚¬', BDT: 'à§³' }
const initialDocuments: DocumentRecord[] = [
  { id: '30000000-0000-4000-8000-000000000001', name: 'Passport', type: 'Identity', issued: '', expiry: '', status: 'Available', translation: 'Not reviewed', notarization: 'Not reviewed', apostille: 'Not reviewed' },
  { id: '30000000-0000-4000-8000-000000000002', name: 'Academic transcript', type: 'Academic', issued: '', expiry: '', status: 'Available', translation: 'Not reviewed', notarization: 'Not reviewed', apostille: 'Not reviewed' },
  { id: '30000000-0000-4000-8000-000000000003', name: 'Medium of Instruction letter', type: 'Academic', issued: '', expiry: '', status: 'Available', translation: 'Not reviewed', notarization: 'Not reviewed', apostille: 'Not reviewed' },
  { id: '30000000-0000-4000-8000-000000000004', name: 'IELTS score report', type: 'Language', issued: '', expiry: '', status: 'Needed', translation: 'Not reviewed', notarization: 'Not reviewed', apostille: 'Not reviewed' },
]
const databaseDocumentStatus: Record<DocumentStatus, string> = {
  Available: 'available', Needed: 'needed', 'In progress': 'in_progress', 'Booked â€” result pending': 'booked_result_pending',
}
const toDatabaseDocumentStatus = (status: string) => databaseDocumentStatus[status as DocumentStatus] ?? 'needed'
const uiDocumentStatus = (status: string): DocumentStatus => ({
  available: 'Available', needed: 'Needed', in_progress: 'In progress', booked_result_pending: 'Booked â€” result pending',
}[status] as DocumentStatus) ?? 'Needed'
const isEvidenceStale = (checkedAt?: string) => !checkedAt || Date.now() - new Date(checkedAt).getTime() > 30 * 24 * 60 * 60 * 1000
const isFreshOfficialEvidence = (evidence: ClaimEvidence, intake: string) => {
  const checkedAt = new Date(`${evidence.checkedAt}T00:00:00Z`).getTime()
  return evidence.status === 'confirmed' && evidence.intake === intake && evidence.url.startsWith('https://') &&
    evidence.quote.trim() !== '' && Number.isFinite(checkedAt) && checkedAt <= Date.now() &&
    Date.now() - checkedAt <= 90 * 24 * 60 * 60 * 1000
}
const hasCurrentRequirementEvidence = (requirement: ProgramRequirement, intake: string) =>
  (requirement.evidence ?? []).some(evidence => isFreshOfficialEvidence(evidence, intake))

function readLocal(key: string): Workspace {
  try {
    const raw = localStorage.getItem(key)
    if (raw) {
      const saved = JSON.parse(raw) as Partial<Workspace>
      const universities = Array.isArray(saved.universities) ? saved.universities.map(university => {
        const normalized = { ...university }
        if (!normalized.country) normalized.country = 'South Korea'
        if (!normalized.intake) normalized.intake = 'Fall 2027'
        return normalized
      }) : structuredClone(initialWorkspace.universities)
      return {
        profile: { ...structuredClone(initialWorkspace.profile), ...saved.profile,
          name: saved.profile?.name === 'Applicant' ? initialWorkspace.profile.name : saved.profile?.name ?? initialWorkspace.profile.name },
        universities,
        opportunities: Array.isArray(saved.opportunities)
          ? saved.opportunities.map(opportunity => normalizeOpportunity(opportunity))
          : structuredClone(initialWorkspace.opportunities),
        tasks: Array.isArray(saved.tasks) ? saved.tasks : structuredClone(initialWorkspace.tasks),
      }
    }
  } catch (error) {
    console.error('Could not read the saved workspace.', error)
  }
  return structuredClone(initialWorkspace)
}
function readLocalValue<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key)
    if (raw) return JSON.parse(raw) as T
  } catch (error) {
    console.error(`Could not read ${key}.`, error)
  }
  return structuredClone(fallback)
}
function readDocuments(key: string) {
  return readLocalValue(key, initialDocuments).map(document => ({
    ...initialDocuments[0], ...document, id: document.id || newId(),
    translation: document.translation || 'Not reviewed',
    notarization: document.notarization || 'Not reviewed',
    apostille: document.apostille || 'Not reviewed',
  }))
}

function App() {
  const [view, setView] = useState<View>('Overview')
  const [workspace, setWorkspace] = useState<Workspace>(() => readLocal('korea-command-center:guest'))
  const [userId, setUserId] = useState<string | null>(null)
  const [email, setEmail] = useState('')
  const [dark, setDark] = useState(() => localStorage.getItem('kcc-dark') === 'true')
  const [query, setQuery] = useState('')
  const searchRef = useRef<HTMLInputElement>(null)
  const [mobileMenu, setMobileMenu] = useState(false)
  const [notificationOpen, setNotificationOpen] = useState(false)
  const [refreshFailures, setRefreshFailures] = useState<RefreshFailure[]>([])
  const [sourceChanges, setSourceChanges] = useState<SourceChange[]>([])
  const [opportunityAlerts, setOpportunityAlerts] = useState<{ id: string; title: string; detail: string }[]>([])
  const opportunitySnapshot = useRef<ScholarshipOpportunity[]>([])
  const [cloudDataUserId, setCloudDataUserId] = useState<string | null>(null)
  const [toast, setToast] = useState('')
  const [drawer, setDrawer] = useState<University | null>(null)
  const [modal, setModal] = useState<'university' | 'task' | 'profile' | 'readiness' | 'auth' | 'workbook' | null>(null)
  const [authBusy, setAuthBusy] = useState(false)
  const [authAction, setAuthAction] = useState<'in' | 'up'>('in')
  const [filter, setFilter] = useState('All')
  const [countryFilter, setCountryFilter] = useState<'All' | Country>('All')
  const [selected, setSelected] = useState<string[]>([])
  const [budget, setBudget] = useState<Budget>(() => readBudget('kcc-budget:guest'))
  const [documents, setDocuments] = useState<DocumentRecord[]>(() => readDocuments('kcc-documents:guest'))
  const [docName, setDocName] = useState('')
  const [docType, setDocType] = useState('Academic')
  const [taskForm, setTaskForm] = useState({ title: '', dueDate: '', reminderAt: '', priority: 'Medium' as Task['priority'] })
  const [uniForm, setUniForm] = useState({ name: '', city: '', program: '', url: '', category: 'Match' as Category, country: 'South Korea' as Country })
  const [profileForm, setProfileForm] = useState<Profile>(workspace.profile)
  const [pendingWorkbook, setPendingWorkbook] = useState<Awaited<ReturnType<typeof parseApplicantWorkbook>> | null>(null)
  const [remindersEnabled, setRemindersEnabled] = useState(() => localStorage.getItem('kcc-reminders-enabled') === 'true')

  useEffect(() => {
    const key = `korea-command-center:${userId ?? 'guest'}`
    try { localStorage.setItem(key, JSON.stringify(workspace)) } catch (error) { console.error('Could not save the workspace.', error) }
  }, [workspace, userId])

  useEffect(() => {
    try {
      const owner = userId ?? 'guest'
      localStorage.setItem(`kcc-budget:${owner}`, JSON.stringify(budget))
      localStorage.setItem(`kcc-documents:${owner}`, JSON.stringify(documents))
    } catch (error) {
      console.error('Could not save budget and document checklist.', error)
    }
  }, [budget, documents, userId])

  useEffect(() => {
    if (!supabase || !userId || cloudDataUserId !== userId) return
    const client = supabase
    const timer = window.setTimeout(async () => {
      const value = (raw: string) => raw === '' ? null : Number(raw)
      const amounts = [budget.monthlyLiving, budget.annualTuition, budget.travel, budget.fees, budget.insurance, budget.guaranteedMonthly].map(value)
      if (amounts.some(amount => amount !== null && (!Number.isFinite(amount) || amount < 0))) {
        setToast('Budget values must be non-negative numbers.')
        return
      }
      try {
        const { error } = await client.from('budget_scenarios').upsert({
          user_id: userId, currency: budget.currency, monthly_living: amounts[0],
          annual_tuition: amounts[1], annual_travel: amounts[2], annual_fees: amounts[3],
          annual_insurance: amounts[4], guaranteed_monthly: amounts[5],
        })
        if (error) setToast(`Budget save failed: ${error.message}`)
      } catch (error) {
        setToast(`Budget save failed: ${error instanceof Error ? error.message : 'Network request failed'}`)
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [budget, userId, cloudDataUserId])

  useEffect(() => {
    if (!supabase || !userId || cloudDataUserId !== userId) return
    const client = supabase
    const timer = window.setTimeout(async () => {
      try {
        const rows = documents.map(document => ({
          id: document.id, user_id: userId, file_name: document.name, document_type: document.type,
          issued_at: document.issued || null, expires_at: document.expiry || null,
          availability_status: toDatabaseDocumentStatus(document.status),
          translation_status: document.translation, notarization_status: document.notarization,
          apostille_status: document.apostille, storage_path: document.storagePath ?? null,
        }))
        if (rows.length) {
          const { error } = await client.from('documents').upsert(rows)
          if (error) { setToast(`Document metadata save failed: ${error.message}`); return }
        }
        const { data: saved, error: readError } = await client.from('documents').select('id').eq('user_id', userId)
        if (readError) { setToast(`Could not reconcile document metadata: ${readError.message}`); return }
        const currentIds = new Set(documents.map(document => document.id))
        const removedIds = (saved ?? []).map(document => document.id).filter(id => !currentIds.has(id))
        if (removedIds.length) {
          const { error } = await client.from('documents').delete().eq('user_id', userId).in('id', removedIds)
          if (error) setToast(`Document removal failed: ${error.message}`)
        }
      } catch (error) {
        setToast(`Document metadata sync failed: ${error instanceof Error ? error.message : 'Network request failed'}`)
      }
    }, 500)
    return () => window.clearTimeout(timer)
  }, [documents, userId, cloudDataUserId])

  useEffect(() => {
    localStorage.setItem('kcc-dark', String(dark))
    document.documentElement.classList.toggle('dark', dark)
  }, [dark])

  useEffect(() => {
    if (!remindersEnabled || !('Notification' in window) || Notification.permission !== 'granted') return
    const checkReminders = () => {
      const now = Date.now()
      const todayDate = today(workspace.profile.timezone)
      let notified: string[] = []
      try { notified = JSON.parse(localStorage.getItem('kcc-notified-reminders') ?? '[]') as string[] }
      catch (error) { console.error('Could not read reminder history.', error) }
      const dueSoon = (date: string) => {
        if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return null
        const days = Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${todayDate}T12:00:00Z`)) / 86_400_000)
        return days >= 0 && days <= 7 ? days : null
      }
      const reminders = [
        ...workspace.tasks.filter(task => !task.done && task.dueDate).flatMap(task => {
          const days = dueSoon(task.dueDate)
          return days === null ? [] : [{ id: `task:${task.id}:${days}`, title: 'Task deadline approaching', body: `${task.title} · ${days === 0 ? 'due today' : `${days} days left`}` }]
        }),
        ...workspace.universities.filter(uni => !uni.isExample && uni.deadline).flatMap(uni => {
          const days = dueSoon(uni.deadline!)
          return days === null ? [] : [{ id: `university:${uni.id}:${days}`, title: 'Application deadline approaching', body: `${uni.name} · ${days === 0 ? 'due today' : `${days} days left`} (check the official source)` }]
        }),
        ...workspace.opportunities.filter(item => item.applicationDeadline && item.intakeVerification === 'Fall 2027 verified' &&
          freshVerifiedEvidence((item.applicationEvidence ?? []).filter(evidence => evidence.fieldKey === 'applicationDeadline')))
          .flatMap(item => {
            const days = dueSoon(item.applicationDeadline)
            return days === null ? [] : [{ id: `opportunity:${item.id}:${days}`, title: 'Verified funding deadline approaching', body: `${item.name} · ${days === 0 ? 'due today' : `${days} days left`}` }]
          }),
        ...workspace.tasks.filter(task => !task.done && task.reminderAt && new Date(task.reminderAt).getTime() <= now)
          .map(task => ({ id: `reminder:${task.id}`, title: 'Master’s application reminder', body: task.title })),
      ]
      reminders.filter(item => !notified.includes(item.id)).forEach(item => {
        new Notification(item.title, { body: item.body })
        notified.push(item.id)
      })
      try { localStorage.setItem('kcc-notified-reminders', JSON.stringify(notified.slice(-500))) }
      catch (error) { console.error('Could not save reminder history.', error) }
    }
    checkReminders()
    const timer = window.setInterval(checkReminders, 60_000)
    return () => window.clearInterval(timer)
  }, [remindersEnabled, workspace.tasks, workspace.universities, workspace.opportunities, workspace.profile.timezone])

  useEffect(() => {
    opportunitySnapshot.current = workspace.opportunities
  }, [workspace.opportunities])

  useEffect(() => {
    if (!supabase || !userId || cloudDataUserId !== userId) return
    const client = supabase
    const channel = client.channel(`opportunity-alerts-${userId}`)
      .on('postgres_changes', { event: '*', schema: 'public', table: 'scholarship_opportunities', filter: `user_id=eq.${userId}` }, async payload => {
        if (payload.eventType === 'DELETE') return
        const rowId = (payload.new as { id?: string }).id
        if (!rowId) return
        const { data, error } = await client.from('scholarship_opportunities').select('id,opportunity_data').eq('id', rowId).maybeSingle()
        if (error || !data) return
        const incoming = normalizeOpportunity(data.opportunity_data as Partial<ScholarshipOpportunity>)
        const previous = opportunitySnapshot.current.find(item => item.id === incoming.id)
        if (previous && compareOpportunityRank(incoming, previous) >= 0) return
        const title = previous ? 'A better ranked opportunity arrived' : 'New opportunity arrived'
        const detail = `${incoming.name || 'Funding opportunity'} · ${incoming.university || 'Institution not specified'} · ${tierFor(incoming)}`
        setOpportunityAlerts(items => [{ id: `opportunity-alert-${incoming.id}-${Date.now()}`, title, detail }, ...items].slice(0, 10))
        setToast(`${title}: ${detail}`)
        if (remindersEnabled && 'Notification' in window && Notification.permission === 'granted') new Notification(title, { body: detail })
        setWorkspace(current => ({ ...current, opportunities: previous
          ? current.opportunities.map(item => item.id === incoming.id ? incoming : item)
          : [...current.opportunities, incoming] }))
      })
      .subscribe()
    return () => { void client.removeChannel(channel) }
  }, [userId, cloudDataUserId, remindersEnabled])

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault()
        if (window.matchMedia('(min-width: 768px)').matches) {
          setView('University research')
          requestAnimationFrame(() => searchRef.current?.focus())
        } else {
          setMobileMenu(true)
        }
      }
      if (event.key === 'Escape') {
        setModal(null); setDrawer(null); setMobileMenu(false); setNotificationOpen(false)
      }
    }
    window.addEventListener('keydown', onKeyDown)
    return () => window.removeEventListener('keydown', onKeyDown)
  }, [])

  useEffect(() => {
    if (!supabase) return
    let alive = true
    supabase.auth.getSession().then(async ({ data, error }) => {
      if (error) { console.error('Could not restore authentication.', error); return }
      if (!alive || !data.session) return
      const uid = data.session.user.id
      setBudget(readBudget(`kcc-budget:${uid}`))
      setDocuments(readDocuments(`kcc-documents:${uid}`))
      setUserId(uid)
      setEmail(data.session.user.email ?? '')
      const [profile, universities, tasks, programs, applications, evidence, failures, cloudBudget, cloudDocuments, sourceChangesResult, opportunitiesResult] = await Promise.all([
        supabase!.from('profiles').select('*').eq('id', uid).maybeSingle(),
        supabase!.from('universities').select('id,name,city,country,intake_label,deadline_note,planning_tier,research_notes,category,rank,coverage_summary').order('created_at'),
        supabase!.from('tasks').select('*').order('due_date'),
        supabase!.from('programs').select('id,university_id,name,research_area,program_details').order('created_at'),
        supabase!.from('applications').select('university_id,stage,submitted_at,decision_at,decision,notes,next_action').order('created_at'),
        supabase!.from('source_evidence').select('id,university_id,source_type,url,intake,published_at,last_checked_at,verification_status,verifier_note,needs_review').order('created_at'),
        supabase!.from('refresh_logs').select('id,checked_at,error_message,source_evidence_id').eq('outcome', 'failed').order('checked_at', { ascending: false }).limit(5),
        supabase!.from('budget_scenarios').select('*').eq('user_id', uid).maybeSingle(),
        supabase!.from('documents').select('*').order('created_at'),
        supabase!.from('source_changes').select('id,source_evidence_id,old_sha256,new_sha256,detected_at,review_status,old_content_snapshot,new_content_snapshot').order('detected_at', { ascending: false }).limit(100),
        supabase!.from('scholarship_opportunities').select('id,opportunity_data').order('created_at'),
      ])
      if (!alive) return
      if (universities.error) console.error('Could not load universities.', universities.error)
      if (profile.error) console.error('Could not load applicant profile.', profile.error)
      if (tasks.error) console.error('Could not load tasks.', tasks.error)
      if (programs.error) console.error('Could not load programs.', programs.error)
      if (applications.error) console.error('Could not load applications.', applications.error)
      if (evidence.error) console.error('Could not load source evidence.', evidence.error)
      if (failures.error) console.error('Could not load recent source refresh failures.', failures.error)
      if (cloudBudget.error) console.error('Could not load budget scenario.', cloudBudget.error)
      if (cloudDocuments.error) console.error('Could not load document metadata.', cloudDocuments.error)
      if (sourceChangesResult.error) console.error('Could not load source change history.', sourceChangesResult.error)
      if (opportunitiesResult.error) console.error('Could not load scholarship opportunity records.', opportunitiesResult.error)
      setRefreshFailures(failures.data ?? [])
      const loadErrors = [
        universities.error, profile.error, tasks.error, programs.error, applications.error, evidence.error,
        failures.error, cloudBudget.error, cloudDocuments.error, sourceChangesResult.error, opportunitiesResult.error,
      ].filter(Boolean)
      if (loadErrors.length) setToast(`Some account data could not be loaded: ${loadErrors.map(error => error!.message).join('; ')}`)
      if (!cloudBudget.error) setBudget(cloudBudget.data ? {
        currency: cloudBudget.data.currency,
        monthlyLiving: cloudBudget.data.monthly_living == null ? '' : String(cloudBudget.data.monthly_living),
        annualTuition: cloudBudget.data.annual_tuition == null ? '' : String(cloudBudget.data.annual_tuition),
        travel: cloudBudget.data.annual_travel == null ? '' : String(cloudBudget.data.annual_travel),
        fees: cloudBudget.data.annual_fees == null ? '' : String(cloudBudget.data.annual_fees),
        insurance: cloudBudget.data.annual_insurance == null ? '' : String(cloudBudget.data.annual_insurance),
        guaranteedMonthly: cloudBudget.data.guaranteed_monthly == null ? '' : String(cloudBudget.data.guaranteed_monthly),
      } : readBudget(`kcc-budget:${uid}`))
      if (!cloudDocuments.error) setDocuments(cloudDocuments.data?.length ? cloudDocuments.data.map(document => ({
        id: document.id, name: document.file_name, type: document.document_type,
        issued: document.issued_at ?? '', expiry: document.expires_at ?? '',
        status: uiDocumentStatus(document.availability_status),
        translation: document.translation_status ?? 'Not reviewed',
        notarization: document.notarization_status ?? 'Not reviewed',
        apostille: document.apostille_status ?? 'Not reviewed', storagePath: document.storage_path ?? null,
      })) : readDocuments(`kcc-documents:${uid}`))
      if (!sourceChangesResult.error) {
        const sourceRows = evidence.data ?? []
        const universityRows = universities.data ?? []
        setSourceChanges((sourceChangesResult.data ?? []).flatMap(change => {
          const source = sourceRows.find(item => item.id === change.source_evidence_id)
          if (!source) return []
          const university = universityRows.find(item => item.id === source.university_id)
          return [{
            id: change.id, sourceEvidenceId: change.source_evidence_id,
            oldHash: change.old_sha256, newHash: change.new_sha256, detectedAt: change.detected_at,
            reviewStatus: change.review_status, oldSnapshot: change.old_content_snapshot,
            newSnapshot: change.new_content_snapshot, url: source.url, type: source.source_type,
            intake: source.intake, university: university?.name ?? 'Source record',
          } as SourceChange]
        }))
      }
      if (loadErrors.length === 0) setCloudDataUserId(uid)
      setWorkspace(readLocal(`korea-command-center:${uid}`))
      setWorkspace(prev => ({
        ...prev,
        profile: profile.data ? {
          name: profile.data.name || prev.profile.name,
          portfolioUrl: profile.data.portfolio_url || prev.profile.portfolioUrl,
          githubUrl: profile.data.github_url || prev.profile.githubUrl,
          linkedinUrl: profile.data.linkedin_url || prev.profile.linkedinUrl,
          contactEmail: profile.data.contact_email || prev.profile.contactEmail,
          cvUrl: profile.data.cv_url || prev.profile.cvUrl,
          skills: profile.data.skills || prev.profile.skills,
          experience: profile.data.experience || prev.profile.experience,
          university: profile.data.institution, degree: profile.data.degree, cgpa: profile.data.cgpa,
          ssc: profile.data.ssc_gpa, hsc: profile.data.hsc_gpa, status: profile.data.academic_status,
          ielts: profile.data.language_test, target: profile.data.target_intake, needs: profile.data.funding_needs,
          ieltsBookingDate: profile.data.ielts_booking_date ?? '',
          ieltsResultDate: profile.data.ielts_result_date ?? '',
          ieltsScore: profile.data.ielts_score ?? '',
          upfrontBudget: profile.data.upfront_budget ?? '',
          passportExpiry: profile.data.passport_expiry ?? '',
          timezone: profile.data.timezone,
        } : prev.profile,
        universities: universities.data?.length ? universities.data.map(row => ({
          id: row.id, country: row.country ?? 'South Korea', intake: row.intake_label ?? 'Fall 2027',
          name: row.name, city: row.city ?? 'â€”',
          program: programs.data?.find(program => program.university_id === row.id)?.name ?? 'Not specified',
          area: programs.data?.find(program => program.university_id === row.id)?.research_area ?? 'Not specified',
          applicationPortal: programs.data?.find(program => program.university_id === row.id)?.program_details?.applicationPortal ?? '',
          supervisorConsent: programs.data?.find(program => program.university_id === row.id)?.program_details?.supervisorConsent ?? 'Unverified',
          requirements: programs.data?.find(program => program.university_id === row.id)?.program_details?.requirements ?? [],
          recommendations: programs.data?.find(program => program.university_id === row.id)?.program_details?.recommendations ?? [],
          category: row.category ?? 'Match', rank: row.rank ?? 99,
          stage: applications.data?.find(application => application.university_id === row.id)?.stage ?? 'Researching',
          submittedAt: applications.data?.find(application => application.university_id === row.id)?.submitted_at ?? undefined,
          decisionAt: applications.data?.find(application => application.university_id === row.id)?.decision_at ?? undefined,
          decision: applications.data?.find(application => application.university_id === row.id)?.decision ?? undefined,
          applicationNotes: applications.data?.find(application => application.university_id === row.id)?.notes ?? undefined,
          nextAction: applications.data?.find(application => application.university_id === row.id)?.next_action ?? undefined,
          coverage: row.coverage_summary ?? 'Not confirmed',
          deadlineNote: row.deadline_note ?? undefined, planningTier: row.planning_tier ?? undefined,
          researchNotes: row.research_notes ?? undefined,
          evidence: (evidence.data ?? []).filter(source => source.university_id === row.id).map(source => ({
            url: source.url, type: source.source_type, intake: source.intake, status: source.verification_status,
            note: source.verifier_note ?? 'Official source; manual verification pending.',
            publishedAt: source.published_at ?? undefined, checkedAt: source.last_checked_at ?? undefined, needsReview: source.needs_review,
          })),
        })) : prev.universities,
        opportunities: opportunitiesResult.data?.length
          ? opportunitiesResult.data.map(row => normalizeOpportunity(row.opportunity_data as Partial<ScholarshipOpportunity>))
          : prev.opportunities,
        tasks: tasks.data?.length ? tasks.data.map(row => ({
          id: row.id, title: row.title, dueDate: row.due_date ?? '', reminderAt: row.reminder_at ?? undefined,
          priority: row.priority ?? 'Medium', done: row.status === 'done', description: row.description ?? '',
        })) : prev.tasks,
      }))
    })
    const { data: listener } = supabase.auth.onAuthStateChange((_event, session) => {
      if (!session) {
        setCloudDataUserId(null); setSourceChanges([])
        setUserId(null); setEmail(''); setWorkspace(readLocal('korea-command-center:guest'))
        setRefreshFailures([])
        setBudget(readBudget('kcc-budget:guest'))
        setDocuments(readDocuments('kcc-documents:guest'))
      }
    })
    return () => { alive = false; listener.subscription.unsubscribe() }
  }, [])

  const tasks = workspace.tasks
  const universities = workspace.universities
  const openTasks = tasks.filter(task => !task.done)
  const overdue = openTasks.filter(task => task.dueDate && task.dueDate < today(workspace.profile.timezone))
  const daysUntil = (date: string) => /^\d{4}-\d{2}-\d{2}$/.test(date)
    ? Math.round((Date.parse(`${date}T12:00:00Z`) - Date.parse(`${today(workspace.profile.timezone)}T12:00:00Z`)) / 86_400_000)
    : null
  const deadlineAlerts = [
    ...openTasks.flatMap(task => {
      const days = daysUntil(task.dueDate)
      return days !== null && days >= 0 && days <= 7 ? [{ id: `task-deadline-${task.id}`, title: days === 0 ? 'Task due today' : `Task due in ${days} days`, detail: task.title }] : []
    }),
    ...universities.filter(uni => !uni.isExample).flatMap(uni => {
      const days = uni.deadline ? daysUntil(uni.deadline) : null
      return days !== null && days >= 0 && days <= 7 ? [{ id: `uni-deadline-${uni.id}`, title: days === 0 ? 'Application deadline today' : `Application deadline in ${days} days`, detail: `${uni.name} · recorded deadline; verify against the official notice` }] : []
    }),
    ...workspace.opportunities.filter(item => item.intakeVerification === 'Fall 2027 verified' &&
      freshVerifiedEvidence((item.applicationEvidence ?? []).filter(evidence => evidence.fieldKey === 'applicationDeadline')))
      .flatMap(item => {
        const days = daysUntil(item.applicationDeadline)
        return days !== null && days >= 0 && days <= 7 ? [{ id: `funding-deadline-${item.id}`, title: days === 0 ? 'Verified funding deadline today' : `Verified funding deadline in ${days} days`, detail: item.name }] : []
      }),
  ]
  const notificationItems = [
    ...opportunityAlerts,
    ...deadlineAlerts,
    ...overdue.map(task => ({ id: `task-${task.id}`, title: 'Overdue task', detail: task.title })),
    ...refreshFailures.map(failure => ({ id: `refresh-${failure.id}`, title: 'Source refresh failed', detail: failure.error_message ?? 'Review the source refresh log.' })),
    ...universities.flatMap(uni => uni.evidence.filter(item => item.needsReview).map(item => ({ id: `changed-${uni.id}-${item.url}`, title: 'Official page changed â€” review required', detail: uni.name }))),
    ...universities.flatMap(uni => uni.evidence.filter(item => isEvidenceStale(item.checkedAt)).map(item => ({
      id: `source-${uni.id}-${item.url}`, title: item.checkedAt ? 'Official source check is stale' : 'Official source not checked', detail: uni.name,
    }))),
    ...documents.filter(document => ['Needed', 'Booked â€” result pending'].includes(document.status)).map(document => ({ id: `document-${document.name}`, title: 'Document needs attention', detail: `${document.name} Â· ${document.status}` })),
  ]
  const notifications = notificationItems.length
  const searchMatches = useMemo(() => {
    const needle = query.trim().toLowerCase()
    if (!needle) return universities
    return universities.filter(uni => `${uni.name} ${uni.city} ${uni.program} ${uni.area} ${uni.stage}`.toLowerCase().includes(needle))
  }, [query, universities])
  const taskChart = useMemo(() => {
    const byMonth = new Map<string, number>()
    tasks.filter(task => task.dueDate).forEach(task => {
      const key = task.dueDate.slice(0, 7)
      byMonth.set(key, (byMonth.get(key) ?? 0) + 1)
    })
    return [...byMonth].sort(([a], [b]) => a.localeCompare(b)).map(([key, count]) => ({
      month: new Intl.DateTimeFormat('en', { month: 'short', year: '2-digit', timeZone: 'UTC' }).format(new Date(`${key}-15T12:00:00Z`)),
      tasks: count,
    }))
  }, [tasks])
  const funnel = stageOptions.map(stage => ({ stage, count: universities.filter(uni => !uni.isExample && uni.stage === stage).length }))

  const notify = (message: string) => { setToast(message); window.setTimeout(() => setToast(''), 3200) }
  const configureReminders = async (enabled: boolean) => {
    if (!enabled) {
      localStorage.setItem('kcc-reminders-enabled', 'false')
      setRemindersEnabled(false)
      return
    }
    if (!('Notification' in window)) { notify('This browser does not support notifications.'); return }
    const permission = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission()
    if (permission !== 'granted') { notify('Browser notification permission was not granted; reminders remain disabled.'); return }
    localStorage.setItem('kcc-reminders-enabled', 'true')
    setRemindersEnabled(true)
    notify('Browser reminders enabled. This app must remain open for reminders to fire.')
  }
  const patchWorkspace = (update: (current: Workspace) => Workspace) => setWorkspace(current => update(current))
  const exportBackup = async () => {
    let cloudAccountData: unknown
    if (userId && supabase) {
      const { data, error } = await supabase.rpc('export_my_account_data')
      if (error) { notify(`Account export failed: ${error.message}. Apply the latest migrations first.`); return }
      cloudAccountData = data
    }
    const owner = userId ?? 'guest'
    const backup = {
      format: 'korea-masters-command-center',
      version: 1,
      exportedAt: new Date().toISOString(),
      workspace,
      budget,
      documents,
      professorContacts: readLocalValue<ProfessorRecord[]>(`kcc-professors:${owner}`, []),
      cloudAccountData,
      includesPrivateFileBytes: false,
    }
    const file = new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' })
    const href = URL.createObjectURL(file)
    const link = document.createElement('a')
    link.href = href; link.download = `korea-masters-backup-${new Date().toISOString().slice(0, 10)}.json`
    link.click(); URL.revokeObjectURL(href)
    notify('Backup downloaded. Uploaded document files are not included.')
  }
  const importBackup = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    if (userId) { notify('Import is limited to a guest workspace. Export the signed-in account first; cloud restore is not automatic.'); return }
    try {
      if (!file.size || file.size > 25 * 1024 * 1024) throw new Error('Choose a non-empty backup smaller than 25 MB.')
      const parsed: unknown = JSON.parse(await file.text())
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('The backup must be a JSON object.')
      const record = parsed as Record<string, unknown>
      if (record.format !== 'korea-masters-command-center' || record.version !== 1 ||
        !isValidWorkspaceBackup(record.workspace) || !isValidBudgetBackup(record.budget) ||
        !isValidDocumentsBackup(record.documents) || !isValidProfessorContactsBackup(record.professorContacts))
        throw new Error('This file is not a complete, valid command-center backup.')
      localStorage.setItem('kcc-professors:guest', JSON.stringify(record.professorContacts))
      setWorkspace({
        ...record.workspace,
        opportunities: record.workspace.opportunities.map(normalizeOpportunity),
      })
      setBudget({ ...emptyBudget, ...(record.budget as Budget) })
      setDocuments(record.documents as DocumentRecord[])
      notify('Backup imported into this guest browser workspace.')
    } catch (error) {
      notify(`Backup import failed: ${error instanceof Error ? error.message : 'Invalid backup file.'}`)
    }
  }
  const deleteAccount = async () => {
    if (!userId || !supabase) { notify('Sign in to request account deletion.'); return }
    if (!window.confirm('Permanently delete your account, all cloud records, and private uploaded documents? Download a backup first. This cannot be undone.')) return
    const { error } = await supabase.functions.invoke('delete-my-account')
    if (error) { notify(`Account deletion failed: ${error.message}. Confirm the delete-my-account Edge Function is deployed.`); return }
    for (const key of [`korea-command-center:${userId}`, `kcc-budget:${userId}`, `kcc-documents:${userId}`, `kcc-professors:${userId}`])
      localStorage.removeItem(key)
    const { error: signOutError } = await supabase.auth.signOut()
    setUserId(null); setEmail(''); setCloudDataUserId(null)
    setWorkspace(readLocal('korea-command-center:guest'))
    setBudget(readBudget('kcc-budget:guest')); setDocuments(readDocuments('kcc-documents:guest'))
    notify(signOutError
      ? 'Account and cloud data deleted, but the local sign-out failed. Sign out manually or clear this browser session.'
      : 'Account and cloud data deleted.')
  }
  const saveUniversity = async (uni: University) => {
    if (supabase && userId) {
      const { error } = await supabase.from('universities').upsert({
        id: uni.id, user_id: userId, name: uni.name, city: uni.city,
        category: uni.category, rank: uni.rank, coverage_summary: uni.coverage,
        country: uni.country, intake_label: uni.intake, deadline_note: uni.deadlineNote ?? null,
        planning_tier: uni.planningTier ?? null, research_notes: uni.researchNotes ?? null,
      })
      if (error) { notify(`Save failed: ${error.message}`); return false }
      const existingProgram = await supabase.from('programs').select('id').eq('university_id', uni.id).maybeSingle()
      if (existingProgram.error) { notify(`Program lookup failed: ${existingProgram.error.message}`); return false }
      const programId = existingProgram.data?.id ?? newId()
      const programWrite = await supabase.from('programs').upsert({
        id: programId, user_id: userId, university_id: uni.id, name: uni.program,
        research_area: uni.area === 'Not specified' ? null : uni.area,
        program_details: {
          applicationPortal: uni.applicationPortal ?? '',
          supervisorConsent: uni.supervisorConsent ?? 'Unverified',
          requirements: uni.requirements ?? [],
          recommendations: uni.recommendations ?? [],
        },
      })
      if (programWrite.error) { notify(`Program save failed: ${programWrite.error.message}`); return false }
      const existingApplication = await supabase.from('applications').select('id').eq('university_id', uni.id).maybeSingle()
      if (existingApplication.error) { notify(`Application lookup failed: ${existingApplication.error.message}`); return false }
      const applicationWrite = await supabase.from('applications').upsert({
        id: existingApplication.data?.id ?? newId(), user_id: userId,
        university_id: uni.id, program_id: programId, stage: uni.stage,
        submitted_at: uni.submittedAt ?? null,
        decision_at: uni.decisionAt ?? null,
        decision: uni.decision ?? null,
        notes: uni.applicationNotes ?? '',
        next_action: uni.nextAction ?? null,
      })
      if (applicationWrite.error) { notify(`Application save failed: ${applicationWrite.error.message}`); return false }
      for (const source of uni.evidence) {
        const existingEvidence = await supabase.from('source_evidence').select('id,verified_at').eq('university_id', uni.id).eq('url', source.url).maybeSingle()
        if (existingEvidence.error) { notify(`Evidence lookup failed: ${existingEvidence.error.message}`); return false }
        const evidenceWrite = await supabase.from('source_evidence').upsert({
          id: existingEvidence.data?.id ?? newId(), user_id: userId, university_id: uni.id, program_id: programId,
          source_type: source.type, url: source.url, intake: source.intake, published_at: source.publishedAt ?? null,
          verification_status: source.status, verifier_note: source.note,
          verified_by: source.status === 'confirmed' ? userId : null,
          verified_at: source.status === 'confirmed' ? existingEvidence.data?.verified_at ?? new Date().toISOString() : null,
          needs_review: source.needsReview ?? false,
        })
        if (evidenceWrite.error) { notify(`Evidence save failed: ${evidenceWrite.error.message}`); return false }
        if (source.needsReview === false) {
          const reviewWrite = await supabase.from('source_changes').update({ review_status: 'reviewed' })
            .eq('source_evidence_id', existingEvidence.data?.id ?? '').eq('user_id', userId).eq('review_status', 'pending')
          if (reviewWrite.error) { notify(`Change history update failed: ${reviewWrite.error.message}`); return false }
        }
      }
    }
    patchWorkspace(current => ({ ...current, universities: [...current.universities.filter(item => item.id !== uni.id && normalizeUniversityName(item.name) !== normalizeUniversityName(uni.name)), { ...uni, isExample: false }] }))
    return true
  }
  const saveOpportunity = async (opportunity: ScholarshipOpportunity) => {
    if (supabase && userId) {
      const { error } = await supabase.from('scholarship_opportunities').upsert({
        id: opportunity.id, user_id: userId, opportunity_data: opportunity,
      })
      if (error) throw new Error(`Scholarship opportunity save failed: ${error.message}`)
    }
    patchWorkspace(current => ({ ...current, opportunities: [
      ...current.opportunities.filter(item => item.id !== opportunity.id), opportunity,
    ] }))
  }
  const deleteOpportunity = async (opportunity: ScholarshipOpportunity) => {
    if (supabase && userId) {
      const { error } = await supabase.from('scholarship_opportunities').delete()
        .eq('id', opportunity.id).eq('user_id', userId)
      if (error) throw new Error(`Scholarship opportunity delete failed: ${error.message}`)
    }
    patchWorkspace(current => ({ ...current, opportunities: current.opportunities.filter(item => item.id !== opportunity.id) }))
  }
  const addUniversity = async (event: FormEvent) => {
    event.preventDefault()
    if (!uniForm.name.trim()) return
    const intake = uniForm.country === 'South Korea' ? 'Fall 2027' : uniForm.country === 'Germany' ? 'Winter Semester 2027/28' : 'Autumn 2027'
    const university: University = {
      id: newId(), country: uniForm.country,
      intake,
      name: uniForm.name.trim(), city: uniForm.city || 'Not specified', program: uniForm.program || 'Not specified',
      area: 'Not specified', category: uniForm.category, rank: universities.length + 1, stage: 'Researching', coverage: 'Not confirmed',
      evidence: uniForm.url ? [{ url: uniForm.url, type: 'Official source', intake, status: 'unknown', note: 'Not yet reviewed.' }] : [],
    }
    if (!await saveUniversity(university)) return
    setModal(null); setUniForm({ name: '', city: '', program: '', url: '', category: 'Match', country: 'South Korea' }); notify('University added.')
  }
  const prepareWorkbookImport = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.currentTarget.files?.[0]
    event.currentTarget.value = ''
    if (!file) return
    try {
      const result = await parseApplicantWorkbook(file)
      setPendingWorkbook(result)
      setModal('workbook')
    } catch (error) {
      notify(error instanceof Error ? error.message : 'Could not read the workbook.')
    }
  }
  const confirmWorkbookImport = async () => {
    if (!pendingWorkbook) return
    const currentByName = new Map(universities.map(university => [normalizeUniversityName(university.name), university]))
    const candidates = pendingWorkbook.universities
      .filter(candidate => !currentByName.has(normalizeUniversityName(candidate.name)) || currentByName.get(normalizeUniversityName(candidate.name))?.isExample)
      .map(candidate => {
        const prior = currentByName.get(normalizeUniversityName(candidate.name))
        if (!prior?.isExample) return candidate
        const mergedEvidence = candidate.evidence.map(source => {
          const existing = prior.evidence.find(item => item.url === source.url)
          return existing ? { ...source, ...existing } : source
        })
        mergedEvidence.push(...prior.evidence.filter(item => !candidate.evidence.some(source => source.url === item.url)))
        return { ...candidate, id: prior.id, stage: prior.stage, evidence: mergedEvidence }
      })
    const importedTasks = [...pendingWorkbook.tasks]
    for (const warning of pendingWorkbook.warnings) {
      const cvGpa = warning.match(/CV lists\s+([\d.]+\s*\/\s*4\.00)/i)?.[1]
      const profileGpa = workspace.profile.cgpa
      const title = `Verify CGPA consistency: CV ${cvGpa ?? 'value in workbook'} vs profile ${profileGpa}`
      if (!tasks.some(task => task.title === title)) importedTasks.push({
        id: newId(), title, dueDate: '', priority: 'High', done: false,
        description: 'The workbook notes a different CGPA on the CV. Confirm the official transcript value and update the CV/application profile consistently.',
      })
    }
    const newTasks = importedTasks.filter(task => !tasks.some(existing => existing.title === task.title))
    if (supabase && userId && candidates.length) {
      const ids = candidates.map(candidate => candidate.id)
      const universityRows = candidates.map(candidate => ({
        id: candidate.id, user_id: userId, name: candidate.name, city: candidate.city,
        country: candidate.country, intake_label: candidate.intake, deadline_note: candidate.deadlineNote ?? null,
        planning_tier: candidate.planningTier ?? null, research_notes: candidate.researchNotes ?? null,
        category: candidate.category, rank: candidate.rank, coverage_summary: candidate.coverage,
      }))
      const universityWrite = await supabase.from('universities').upsert(universityRows)
      if (universityWrite.error) { notify(`Workbook import stopped while saving universities: ${universityWrite.error.message}`); return }
      const [programsResult, applicationsResult, evidenceResult] = await Promise.all([
        supabase.from('programs').select('id,university_id').in('university_id', ids),
        supabase.from('applications').select('id,university_id').in('university_id', ids),
        supabase.from('source_evidence').select('id,university_id,url,verified_at,verification_status,verifier_note,needs_review,last_checked_at,published_at,source_type,intake').in('university_id', ids),
      ])
      const lookupError = programsResult.error ?? applicationsResult.error ?? evidenceResult.error
      if (lookupError) { notify(`Universities saved, but related records could not be loaded: ${lookupError.message}. Import again after resolving the error.`); return }
      const programIds = new Map(candidates.map(candidate => [candidate.id, programsResult.data?.find(program => program.university_id === candidate.id)?.id ?? newId()]))
      const programWrite = await supabase.from('programs').upsert(candidates.map(candidate => ({
        id: programIds.get(candidate.id), user_id: userId, university_id: candidate.id,
        name: candidate.program, research_area: candidate.area === 'Not specified' ? null : candidate.area,
      })))
      if (programWrite.error) { notify(`Universities saved, but programs could not be saved: ${programWrite.error.message}. Import again after resolving the error.`); return }
      const applicationWrite = await supabase.from('applications').upsert(candidates.map(candidate => ({
        id: applicationsResult.data?.find(application => application.university_id === candidate.id)?.id ?? newId(),
        user_id: userId, university_id: candidate.id, program_id: programIds.get(candidate.id), stage: candidate.stage,
      })))
      if (applicationWrite.error) { notify(`Universities and programs saved, but stages could not be saved: ${applicationWrite.error.message}. Import again after resolving the error.`); return }
      const evidenceRows = candidates.flatMap(candidate => candidate.evidence.map(source => {
        const prior = evidenceResult.data?.find(item => item.university_id === candidate.id && item.url === source.url)
        return {
          id: prior?.id ?? newId(), user_id: userId, university_id: candidate.id, program_id: programIds.get(candidate.id),
          source_type: prior?.verification_status === 'confirmed' ? prior.source_type : source.type,
          url: source.url, intake: prior?.verification_status === 'confirmed' ? prior.intake : source.intake,
          published_at: prior?.verification_status === 'confirmed' ? prior.published_at : source.publishedAt ?? null,
          last_checked_at: prior?.last_checked_at ?? null,
          verification_status: prior?.verification_status === 'confirmed' ? 'confirmed' : source.status,
          verified_by: prior?.verification_status === 'confirmed' ? userId : null,
          verified_at: prior?.verification_status === 'confirmed' ? prior.verified_at : null,
          verifier_note: prior?.verification_status === 'confirmed' ? prior.verifier_note : source.note,
          needs_review: prior?.verification_status === 'confirmed' ? prior.needs_review : source.needsReview ?? false,
        }
      }))
      if (evidenceRows.length) {
        const evidenceWrite = await supabase.from('source_evidence').upsert(evidenceRows)
        if (evidenceWrite.error) { notify(`University records saved, but source evidence could not be saved: ${evidenceWrite.error.message}. Import again after resolving the error.`); return }
      }
    }
    if (supabase && userId && newTasks.length) {
      const taskWrite = await supabase.from('tasks').upsert(newTasks.map(task => ({
        id: task.id, user_id: userId, title: task.title, description: task.description ?? '',
        due_date: task.dueDate || null, priority: task.priority, status: 'todo',
      })))
      if (taskWrite.error) { notify(`University records saved, but workbook planning tasks could not be saved: ${taskWrite.error.message}. Import again after resolving the error.`); return }
    }
    patchWorkspace(current => ({
      ...current,
      universities: [...current.universities.filter(university => !candidates.some(candidate => candidate.id === university.id)), ...candidates],
      tasks: [...current.tasks, ...newTasks],
    }))
    setModal(null); setPendingWorkbook(null)
    notify(`Imported ${candidates.length} university leads and ${newTasks.length} planning tasks. All workbook research remains unverified.`)
  }
  const importKoreaContext = async () => {
    let existingNames = new Set(workspace.universities.map(uni => normalizeUniversityName(uni.name)))
    let existingTitles = new Set(workspace.tasks.map(task => task.title.trim().toLowerCase()))
    if (supabase && userId) {
      const [universitiesResult, tasksResult] = await Promise.all([
        supabase.from('universities').select('id,name'),
        supabase.from('tasks').select('id,title'),
      ])
      const lookupError = universitiesResult.error ?? tasksResult.error
      if (lookupError) { notify(`Context import stopped before writing: ${lookupError.message}`); return }
      existingNames = new Set((universitiesResult.data ?? []).map(row => normalizeUniversityName(row.name)))
      existingTitles = new Set((tasksResult.data ?? []).map(row => row.title.trim().toLowerCase()))
    }
    const candidates = initialWorkspace.universities
      .filter(uni => uni.country === 'South Korea' && !existingNames.has(normalizeUniversityName(uni.name)))
      .map(uni => ({ ...uni, id: newId() }))
    if (supabase && userId) {
      for (const candidate of candidates) if (!await saveUniversity(candidate)) return
    } else if (candidates.length) {
      patchWorkspace(current => ({ ...current, universities: [...current.universities, ...candidates] }))
    }
    const tasksToAdd = initialWorkspace.tasks
      .filter(task => !existingTitles.has(task.title.trim().toLowerCase()))
      .map(task => ({ ...task, id: newId() }))
    if (tasksToAdd.length && supabase && userId) {
      const { error } = await supabase.from('tasks').insert(tasksToAdd.map(task => ({
        id: task.id, user_id: userId, title: task.title, description: task.description ?? '',
        due_date: null, priority: task.priority, status: 'todo',
      })))
      if (error) { notify(`University leads saved, but roadmap tasks could not be saved: ${error.message}`); return }
    }
    if (tasksToAdd.length) patchWorkspace(current => ({ ...current, tasks: [...current.tasks, ...tasksToAdd.filter(task => !current.tasks.some(item => item.title.trim().toLowerCase() === task.title.trim().toLowerCase()))] }))
    notify(`Added ${candidates.length} missing Korean candidates and ${tasksToAdd.length} roadmap tasks. Existing database records were left unchanged.`)
  }
  const addTask = async (event: FormEvent) => {
    event.preventDefault()
    if (!taskForm.title.trim()) return
    const task: Task = { id: newId(), ...taskForm, reminderAt: taskForm.reminderAt || undefined, done: false }
    if (supabase && userId) {
      const { error } = await supabase.from('tasks').insert({ id: task.id, user_id: userId, title: task.title, description: task.description ?? '', due_date: task.dueDate || null, reminder_at: task.reminderAt ?? null, priority: task.priority, status: 'todo' })
      if (error) { notify(`Save failed: ${error.message}`); return }
    }
    patchWorkspace(current => ({ ...current, tasks: [...current.tasks, task] }))
    setTaskForm({ title: '', dueDate: '', reminderAt: '', priority: 'Medium' }); setModal(null); notify('Task added.')
  }
  const toggleTask = async (task: Task) => {
    if (supabase && userId) {
      const { error } = await supabase.from('tasks').update({ status: task.done ? 'todo' : 'done', completed_at: task.done ? null : new Date().toISOString() }).eq('id', task.id)
      if (error) { notify(`Update failed: ${error.message}`); return }
    }
    patchWorkspace(current => ({ ...current, tasks: current.tasks.map(item => item.id === task.id ? { ...item, done: !item.done, isExample: false } : item) }))
  }
  const changeStage = async (uni: University, stage: Stage) => {
    const next = { ...uni, stage }
    if (!await saveUniversity(next)) return
    notify(`Application stage updated to ${stage}.`)
  }
  const signIn = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault()
    if (!supabase) { notify('Add Supabase URL and anon key to .env.local to enable sign-in.'); return }
    setAuthBusy(true)
    const form = new FormData(event.currentTarget)
    const address = String(form.get('email') ?? '')
    const password = String(form.get('password') ?? '')
    const action = authAction
    const result = action === 'up'
      ? await supabase.auth.signUp({ email: address, password })
      : await supabase.auth.signInWithPassword({ email: address, password })
    setAuthBusy(false)
    if (result.error) { notify(result.error.message); return }
    if (action === 'up' && !result.data.session) {
      setModal(null)
      notify('Account created. Confirm your email before signing in.')
      return
    }
    if (result.data.user) {
      setBudget(readBudget(`kcc-budget:${result.data.user.id}`))
      setDocuments(readDocuments(`kcc-documents:${result.data.user.id}`))
      setUserId(result.data.user.id); setEmail(result.data.user.email ?? '')
      const { data } = await supabase.auth.getSession()
      if (data.session) {
        setWorkspace(readLocal(`korea-command-center:${result.data.user.id}`))
        setTimeout(() => window.location.reload(), 250)
      }
    }
    setModal(null); notify(action === 'up' ? 'Account created. Check your email if confirmation is enabled.' : 'Signed in.')
  }
  const refreshSources = async () => {
    if (!supabase || !userId) { notify('Sign in with a configured Supabase project to run a server-side source check.'); return }
    notify('Checking official source pagesâ€¦')
    const { data, error } = await supabase.functions.invoke('refresh-sources')
    if (error) { notify(`Refresh failed: ${error.message}`); return }
    const [failuresResult, evidenceResult, changesResult] = await Promise.all([
      supabase.from('refresh_logs').select('id,checked_at,error_message,source_evidence_id')
        .eq('outcome', 'failed').order('checked_at', { ascending: false }).limit(5),
      supabase.from('source_evidence').select('id,university_id,source_type,url,intake,published_at,last_checked_at,verification_status,verifier_note,needs_review').order('created_at'),
      supabase.from('source_changes').select('id,source_evidence_id,old_sha256,new_sha256,detected_at,review_status,old_content_snapshot,new_content_snapshot').order('detected_at', { ascending: false }).limit(100),
    ])
    const loadError = failuresResult.error ?? evidenceResult.error ?? changesResult.error
    if (loadError) { notify(`Refresh completed, but updated source details could not be loaded: ${loadError.message}`); return }
    const failures = failuresResult.data
    setRefreshFailures(failures ?? [])
    const sourceRows = evidenceResult.data ?? []
    setWorkspace(current => ({ ...current, universities: current.universities.map(university => ({
      ...university,
      evidence: sourceRows.filter(source => source.university_id === university.id).map(source => ({
        url: source.url, type: source.source_type, intake: source.intake, status: source.verification_status,
        note: source.verifier_note ?? 'Official source; manual verification pending.',
        publishedAt: source.published_at ?? undefined, checkedAt: source.last_checked_at ?? undefined, needsReview: source.needs_review,
      })),
    })) }))
    setSourceChanges((changesResult.data ?? []).flatMap(change => {
      const source = sourceRows.find(item => item.id === change.source_evidence_id)
      if (!source) return []
      const university = workspace.universities.find(item => item.id === source.university_id)
      return [{
        id: change.id, sourceEvidenceId: change.source_evidence_id,
        oldHash: change.old_sha256, newHash: change.new_sha256, detectedAt: change.detected_at,
        reviewStatus: change.review_status, oldSnapshot: change.old_content_snapshot,
        newSnapshot: change.new_content_snapshot, url: source.url, type: source.source_type,
        intake: source.intake, university: university?.name ?? 'Source record',
      } as SourceChange]
    }))
    notify(`${data?.checked ?? 0} source checks recorded. Content remains unverified until reviewed.`)
  }
  const reviewSourceChange = async (change: SourceChange, reviewStatus: 'reviewed' | 'dismissed') => {
    if (!supabase || !userId) { notify('Sign in to update source review status.'); return }
    const { error } = await supabase.from('source_changes').update({ review_status: reviewStatus })
      .eq('id', change.id).eq('user_id', userId)
    if (error) { notify(`Source review update failed: ${error.message}`); return }
    const { count, error: pendingError } = await supabase.from('source_changes').select('id', { count: 'exact', head: true })
      .eq('source_evidence_id', change.sourceEvidenceId).eq('user_id', userId).eq('review_status', 'pending')
    if (pendingError) { notify(`Review status saved, but pending changes could not be checked: ${pendingError.message}`); return }
    if (!count) {
      const { error: evidenceError } = await supabase.from('source_evidence').update({ needs_review: false })
        .eq('id', change.sourceEvidenceId).eq('user_id', userId)
      if (evidenceError) { notify(`Review status saved, but source flag could not be cleared: ${evidenceError.message}`); return }
      setWorkspace(current => ({ ...current, universities: current.universities.map(university => ({
        ...university, evidence: university.evidence.map(evidence => evidence.url === change.url ? { ...evidence, needsReview: false } : evidence),
      })) }))
    }
    setSourceChanges(current => current.map(item => item.id === change.id ? { ...item, reviewStatus } : item))
    notify(reviewStatus === 'reviewed' ? 'Source change marked reviewed. Check the official page and update facts manually.' : 'Source change dismissed; no facts were changed.')
  }
  const exportCsv = () => {
    const escape = (value: string | number | undefined) => `"${String(value ?? '').replaceAll('"', '""')}"`
    const rows = [
      ['University', 'Country', 'Intake', 'City', 'Program', 'Research area', 'Category', 'Application stage', 'Deadline', 'Coverage', 'Evidence status', 'Official source'],
      ...universities.map(uni => [uni.name, uni.country, uni.intake, uni.city, uni.program, uni.area, uni.category, uni.stage, uni.deadline ?? 'Unknown', uni.coverage, uni.evidence[0]?.status ?? 'unknown', uni.evidence[0]?.url ?? '']),
    ]
    const blob = new Blob([rows.map(row => row.map(escape).join(',')).join('\r\n')], { type: 'text/csv;charset=utf-8' })
    const link = document.createElement('a'); link.href = URL.createObjectURL(blob); link.download = 'masters-shortlist.csv'; link.click(); URL.revokeObjectURL(link.href)
  }
  const addDocument = () => {
    if (!docName.trim()) return
    setDocuments(current => [...current, { id: newId(), name: docName.trim(), type: docType, issued: '', expiry: '', status: 'Needed', translation: 'Not reviewed', notarization: 'Not reviewed', apostille: 'Not reviewed' }]); setDocName(''); notify('Document requirement added.')
  }
  const saveProfile = async (event: FormEvent) => {
    event.preventDefault()
    try { new Intl.DateTimeFormat('en', { timeZone: profileForm.timezone }).format(new Date()) }
    catch { notify('Enter a valid IANA timezone, such as Asia/Dhaka.'); return }
    if (supabase && userId) {
      const { error } = await supabase.from('profiles').upsert({
        id: userId, name: profileForm.name, institution: profileForm.university, degree: profileForm.degree,
        portfolio_url: profileForm.portfolioUrl, github_url: profileForm.githubUrl,
        linkedin_url: profileForm.linkedinUrl, contact_email: profileForm.contactEmail,
        cv_url: profileForm.cvUrl, skills: profileForm.skills, experience: profileForm.experience,
        cgpa: profileForm.cgpa, ssc_gpa: profileForm.ssc, hsc_gpa: profileForm.hsc,
        academic_status: profileForm.status, language_test: profileForm.ielts, target_intake: profileForm.target,
        funding_needs: profileForm.needs, timezone: profileForm.timezone,
        ielts_booking_date: profileForm.ieltsBookingDate || null,
        ielts_result_date: profileForm.ieltsResultDate || null,
        ielts_score: profileForm.ieltsScore, upfront_budget: profileForm.upfrontBudget,
        passport_expiry: profileForm.passportExpiry || null,
      })
      if (error) { notify(`Profile save failed: ${error.message}`); return }
    }
    patchWorkspace(current => ({ ...current, profile: profileForm }))
    setModal(null); notify('Profile saved.')
  }
  const setProfile = (key: keyof Profile, value: string) => setProfileForm(current => ({ ...current, [key]: value }))

  return (
    <div className={dark ? 'dark' : ''}>
      <div className="min-h-screen bg-paper text-ink dark:bg-[#101b20] dark:text-[#e8edeb]">
        <aside className="sidebar-pattern fixed inset-y-0 left-0 z-30 hidden w-[248px] flex-col text-white lg:flex">
          <div className="flex h-[82px] items-center gap-3 px-6">
            <div className="grid h-9 w-9 place-items-center rounded-xl border border-white/15 bg-white/[0.07]"><span className="font-display text-lg font-bold text-[#d5bb85]">í•œ</span></div>
            <div><div className="font-display text-[13px] font-bold tracking-[.03em]">KOREA MASTER'S</div><div className="mt-0.5 text-[10px] tracking-[.18em] text-white/45">COMMAND CENTER</div></div>
          </div>
          <div className="mx-4 mb-5 rounded-xl border border-white/10 bg-white/[0.055] px-3.5 py-3">
            <div className="flex items-center justify-between"><span className="text-[10px] font-semibold uppercase tracking-[.15em] text-white/45">Target intake</span><span className="h-1.5 w-1.5 rounded-full bg-[#d6b469]" /></div>
            <div className="mt-1.5 font-display text-sm font-semibold">{workspace.profile.target}</div><div className="mt-1 text-[11px] text-white/45">Korea priority Â· Germany / France alternatives</div>
          </div>
          <nav className="flex-1 space-y-1 overflow-y-auto px-3">
            <div className="px-3 pb-2 pt-1 text-[10px] font-semibold uppercase tracking-[.17em] text-white/35">Workspace</div>
            {nav.map(({ label, icon: Icon }) => <button key={label} onClick={() => setView(label)} className={`flex w-full items-center gap-3 rounded-lg px-3 py-[10px] text-left text-[12px] font-medium transition ${view === label ? 'bg-white/[0.12] text-white shadow-sm' : 'text-white/65 hover:bg-white/[0.06] hover:text-white'}`}><Icon size={16} strokeWidth={1.8} /><span>{label}</span>{label === 'Tasks & calendar' && overdue.length > 0 && <span className="ml-auto rounded bg-[#bd7967]/25 px-1.5 py-0.5 text-[10px] text-[#efb6a5]">{overdue.length}</span>}</button>)}
            <div className="mt-6 px-3 pb-2 pt-2 text-[10px] font-semibold uppercase tracking-[.17em] text-white/35">Preferences</div>
            <button onClick={() => setView('Settings')} className={`flex w-full items-center gap-3 rounded-lg px-3 py-[10px] text-left text-[12px] font-medium ${view === 'Settings' ? 'bg-white/[0.12] text-white' : 'text-white/65 hover:bg-white/[0.06]'}`}><Settings size={16} strokeWidth={1.8} />Settings</button>
          </nav>
          <div className="m-3 rounded-xl border border-white/10 bg-white/[0.045] p-3">
            <div className="flex items-center gap-2.5"><div className="grid h-8 w-8 place-items-center rounded-full bg-[#b9d1c5]/20 text-[11px] font-semibold text-[#d1e3d8]">{(email || workspace.profile.name).slice(0, 1).toUpperCase()}</div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-medium">{email || workspace.profile.name}</div><div className="text-[10px] text-white/45">{userId ? 'Secure workspace' : 'Local workspace'}</div></div><button aria-label={userId ? 'Sign out' : 'Sign in'} onClick={async () => { if (userId && supabase) await supabase.auth.signOut(); else setModal('auth') }} className="rounded p-1.5 text-white/50 hover:bg-white/10 hover:text-white">{userId ? <LogOut size={15} /> : <ShieldCheck size={15} />}</button></div>
          </div>
        </aside>
        <div className="lg:pl-[248px]">
          <header className="surface sticky top-0 z-20 flex h-[68px] items-center justify-between border-b border-[#e7e5de] bg-[#fbfaf7]/95 px-4 backdrop-blur-md sm:px-7">
          <div className="flex min-w-0 items-center gap-3"><button className="rounded-lg p-2 hover:bg-black/5 lg:hidden" aria-label="Toggle navigation" onClick={() => setMobileMenu(value => !value)}><Menu size={19} /></button><span className="hidden h-4 w-px bg-[#dddcd5] sm:block" /><div className="font-display text-[13px] font-semibold">{view}</div><span className="hidden text-xs text-slate-400 sm:block">/</span><div className="hidden text-[11px] text-slate-500 sm:block">{workspace.profile.target} planning</div></div>
            <div className="flex items-center gap-2 sm:gap-3">
              <label className="hidden h-9 w-[240px] items-center gap-2 rounded-lg border border-[#e8e6df] bg-white px-3 md:flex"><Search size={14} className="text-slate-400" /><input ref={searchRef} aria-label="Search universities" placeholder="Search universities..." className="w-full border-0 bg-transparent text-[11px] outline-none placeholder:text-slate-400" value={query} onChange={event => setQuery(event.target.value)} /><kbd className="rounded border border-[#e9e7e1] px-1 text-[9px] text-slate-400">âŒ˜K</kbd></label>
              <button title="Toggle color theme" onClick={() => setDark(value => !value)} className="rounded-lg p-2 text-slate-500 hover:bg-black/5">{dark ? <Sun size={17} /> : <Moon size={17} />}</button>
              <button onClick={() => setNotificationOpen(value => !value)} className="relative rounded-lg p-2 text-slate-500 hover:bg-black/5" aria-label={`${notifications} notifications`}><Bell size={17} />{notifications > 0 && <span className="absolute right-1 top-1 h-1.5 w-1.5 rounded-full bg-[#bb765d]" />}</button>
              <button onClick={() => setModal('auth')} className="hidden items-center gap-2 rounded-lg border border-[#e6e4dd] px-3 py-2 text-[11px] font-semibold hover:bg-white sm:flex">{userId ? 'Account' : 'Sign in'}<ChevronDown size={13} /></button>
            </div>
          </header>
          {mobileMenu && <nav className="surface fixed inset-x-3 top-[62px] z-40 grid grid-cols-2 gap-1 rounded-xl border border-[#e7e5de] bg-white p-2 shadow-lg sm:grid-cols-3 lg:hidden">{nav.map(({ label, icon: Icon }) => <button key={label} onClick={() => { setView(label); setMobileMenu(false) }} className={`flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] ${view === label ? 'bg-[#eaf1ed] font-semibold text-teal' : 'text-slate-600 hover:bg-[#f5f4ef]'}`}><Icon size={14} />{label}</button>)}<button onClick={() => { setView('Settings'); setMobileMenu(false) }} className="flex items-center gap-2 rounded-lg px-3 py-2.5 text-left text-[10px] text-slate-600"><Settings size={14} />Settings</button></nav>}
          {notificationOpen && <div className="surface absolute right-3 top-[62px] z-40 w-[min(360px,calc(100vw-24px))] rounded-xl border border-[#e7e5de] bg-white p-3 shadow-xl"><div className="flex items-center justify-between border-b border-[#eeede8] px-1 pb-2"><div className="text-[11px] font-semibold">Workspace alerts</div><button onClick={() => setNotificationOpen(false)} aria-label="Close notifications"><X size={14} /></button></div>{notificationItems.length ? <div className="max-h-72 divide-y divide-[#f0efe9] overflow-y-auto">{notificationItems.map(item => <div key={item.id} className="py-2.5"><div className="text-[10px] font-semibold">{item.title}</div><div className="mt-0.5 text-[9px] text-slate-500">{item.detail}</div></div>)}</div> : <div className="py-4 text-center text-[10px] text-slate-500">No alerts from current workspace data.</div>}<p className="mt-2 border-t border-[#eeede8] pt-2 text-[9px] leading-relaxed text-slate-400">Deadlines use dates in this workspace; opportunity updates stream from your signed-in Supabase account. External scholarship discovery and background alerts are not configured.</p></div>}

          <main className="mx-auto max-w-[1450px] p-4 sm:p-7 xl:px-10">
            <div className="mb-6 flex items-end justify-between">
              <div><div className="mb-2 flex items-center gap-2 text-[10px] font-semibold uppercase tracking-[.17em] text-teal"><span className="h-px w-5 bg-teal" />YOUR GRADUATE JOURNEY</div><h1 className="font-display text-[25px] font-bold tracking-[-.04em] sm:text-[29px]">{view === 'Overview' ? <>Good afternoon, {workspace.profile.name.trim().split(/\s+/).slice(0, 2).join(' ')}<span className="ml-2 text-[#c39c56]">.</span></> : view}</h1>              <p className="mt-1 text-[12px] text-slate-500">{view === 'Overview' ? 'A clear view of your path to a funded masterâ€™s degree.' : `Your ${workspace.profile.target} application workspace.`}</p></div>
              <div className="hidden items-center gap-2 sm:flex"><button onClick={() => setModal('task')} className="flex items-center gap-1.5 rounded-lg border border-[#e1dfd8] bg-white px-3 py-2 text-[11px] font-semibold hover:border-teal/40"><Plus size={14} />Quick task</button><button onClick={() => setModal('university')} className="flex items-center gap-1.5 rounded-lg bg-ink px-3.5 py-2 text-[11px] font-semibold text-white shadow-sm hover:bg-[#24434a]"><Plus size={14} />Add university</button></div>
            </div>
            {!userId && <div className="surface mb-4 rounded-xl border border-[#eadfca] bg-[#fbf7ed] px-4 py-3 text-[10px] leading-relaxed text-[#806e48]">Guest mode: workspace data is stored in unencrypted browser storage on this device. Sign in and configure Supabase to sync records and upload private documents.</div>}
            {view === 'Overview' && <Dashboard workspace={workspace} documents={documents} overdue={overdue} openTasks={openTasks} taskChart={taskChart} funnel={funnel} timezone={workspace.profile.timezone} onOpenTasks={() => setView('Tasks & calendar')} onOpenUniversities={() => setView('University research')} onOpenScholarships={() => setView('Scholarships & funding')} onOpenDocuments={() => setView('Documents')} onOpenReadiness={() => { setProfileForm(workspace.profile); setModal('readiness') }} onComplete={toggleTask} onEditProfile={() => { setProfileForm(workspace.profile); setModal('profile') }} />}
            {view === 'University research' && <UniversityPage universities={searchMatches} filter={filter} setFilter={setFilter} countryFilter={countryFilter} setCountryFilter={setCountryFilter} selected={selected} setSelected={setSelected} onAdd={() => setModal('university')} onImportWorkbook={prepareWorkbookImport} onImportContext={importKoreaContext} onOpen={setDrawer} onStage={changeStage} onExport={exportCsv} />}
            {view === 'Scholarships & funding' && <ScholarshipsPage opportunities={workspace.opportunities} profile={workspace.profile} onSave={saveOpportunity} onDelete={deleteOpportunity} />}
            {view === 'Official search' && <ResearchSearchPage country={countryFilter === 'All' ? 'South Korea' : countryFilter} timezone={workspace.profile.timezone} />}
            {view === 'Applications' && <ApplicationsPage universities={universities} onStage={changeStage} onOpen={setDrawer} />}
            {view === 'Tasks & calendar' && <TasksPage tasks={tasks} timezone={workspace.profile.timezone} onAdd={() => setModal('task')} onComplete={toggleTask} />}
            {view === 'Funding & budget' && <BudgetPage budget={budget} setBudget={setBudget} onOpenScholarships={() => setView('Scholarships & funding')} />}
            {view === 'Documents' && <DocumentsPage docs={documents} setDocs={setDocuments} name={docName} setName={setDocName} type={docType} setType={setDocType} onAdd={addDocument} authenticated={Boolean(userId)} userId={userId} cloudReady={Boolean(userId && cloudDataUserId === userId)} setToast={setToast} />}
            {view === 'Professor outreach' && <ProfessorPage storageKey={`kcc-professors:${userId ?? 'guest'}`} userId={userId} />}
            {view === 'Sources & reports' && <SourcesPage universities={universities} opportunities={workspace.opportunities} failures={refreshFailures} changes={sourceChanges} timezone={workspace.profile.timezone} onRefresh={refreshSources} onReviewChange={reviewSourceChange} onExport={exportCsv} />}
            {view === 'Settings' && <SettingsPage profile={workspace.profile} onEdit={() => { setProfileForm(workspace.profile); setModal('profile') }} onEditReadiness={() => { setProfileForm(workspace.profile); setModal('readiness') }} userId={userId} cloudReady={Boolean(userId && cloudDataUserId === userId)} remindersEnabled={remindersEnabled} onReminderChange={configureReminders} onExport={exportBackup} onImport={importBackup} onDeleteAccount={deleteAccount} />}
            <footer className="mt-10 flex flex-wrap items-center justify-between gap-2 border-t border-[#e7e5de] py-4 text-[10px] text-slate-400"><span>{userId ? 'Authenticated workspace' : 'Browser-local workspace'} Â· Timezone: {workspace.profile.timezone}</span><span>Source facts are never verified automatically Â· Korea, Germany, and France</span></footer>
          </main>
        </div>
      </div>
      {toast && <div role="status" className="fixed bottom-5 right-5 z-[60] flex max-w-sm items-center gap-2 rounded-xl bg-[#17343b] px-4 py-3 text-[12px] text-white shadow-xl"><CheckCircle2 size={16} className="shrink-0 text-[#b7d5c8]" />{toast}</div>}
      {modal === 'task' && <Modal title="Add a task" onClose={() => setModal(null)}><form onSubmit={addTask} className="space-y-4"><Field label="Task title"><input autoFocus required value={taskForm.title} onChange={event => setTaskForm({ ...taskForm, title: event.target.value })} placeholder="e.g. Ask professor for a short meeting" className="input" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Due date"><input type="date" value={taskForm.dueDate} onChange={event => setTaskForm({ ...taskForm, dueDate: event.target.value })} className="input" /></Field><Field label="Reminder (browser must be open)"><input type="datetime-local" value={taskForm.reminderAt} onChange={event => setTaskForm({ ...taskForm, reminderAt: event.target.value })} className="input" /></Field><Field label="Priority"><select className="input" value={taskForm.priority} onChange={event => setTaskForm({ ...taskForm, priority: event.target.value as Task['priority'] })}><option>High</option><option>Medium</option><option>Low</option></select></Field></div><p className="text-[9px] text-slate-500">Browser notifications are best-effort; enable them in Settings and keep this app open.</p><ModalActions onCancel={() => setModal(null)} submit="Add task" /></form></Modal>}
      {modal === 'university' && <Modal title="Add university to research" onClose={() => setModal(null)}><form onSubmit={addUniversity} className="space-y-4"><Field label="University name"><input autoFocus required value={uniForm.name} onChange={event => setUniForm({ ...uniForm, name: event.target.value })} placeholder="Official institution name" className="input" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Country"><select className="input" value={uniForm.country} onChange={event => setUniForm({ ...uniForm, country: event.target.value as Country })}>{countries.map(country => <option key={country}>{country}</option>)}</select></Field><Field label="City"><input value={uniForm.city} onChange={event => setUniForm({ ...uniForm, city: event.target.value })} placeholder="City" className="input" /></Field></div><Field label="Program"><input value={uniForm.program} onChange={event => setUniForm({ ...uniForm, program: event.target.value })} placeholder="English-taught master's program to verify" className="input" /></Field><div className="grid grid-cols-2 gap-3"><Field label="Official admissions URL"><input type="url" value={uniForm.url} onChange={event => setUniForm({ ...uniForm, url: event.target.value })} placeholder="https://..." className="input" /></Field><Field label="Shortlist category"><select className="input" value={uniForm.category} onChange={event => setUniForm({ ...uniForm, category: event.target.value as Category })}>{categories.map(item => <option key={item}>{item}</option>)}</select></Field></div><p className="text-[10px] text-slate-500">New sources begin as <strong>unknown</strong>; adding a URL does not confirm its contents.</p><ModalActions onCancel={() => setModal(null)} submit="Add to shortlist" /></form></Modal>}
      {modal === 'workbook' && pendingWorkbook && <Modal title="Review workbook import" onClose={() => { setModal(null); setPendingWorkbook(null) }} wide><div className="space-y-4"><p className="text-[11px] leading-relaxed text-slate-600">The workbook is read locally in your browser. Nothing is uploaded. {pendingWorkbook.universities.length} Korean university leads and {pendingWorkbook.tasks.length} undated timeline tasks were found. University deadlines, fees, scholarships, funding notes, and URLs remain unverified until you check each official page.</p><div className="rounded-lg border border-[#e7e5de] bg-white p-3"><div className="mb-2 text-[10px] font-semibold">Preview</div><ul className="grid gap-1 text-[10px] text-slate-600 sm:grid-cols-2">{pendingWorkbook.universities.slice(0, 8).map(university => <li key={university.name}>{university.rank}. {university.name} Â· {university.category}</li>)}</ul><p className="mt-2 text-[9px] text-slate-400">Existing starter examples will be enriched; duplicate universities already in your shortlist will be skipped. No spreadsheet date is added as a confirmed deadline.</p></div>{pendingWorkbook.warnings.length > 0 && <div className="rounded-lg border border-[#ecd9b7] bg-[#fbf7ed] p-3 text-[10px] text-[#806e48]"><strong>Profile discrepancy found:</strong> {pendingWorkbook.warnings.join(' ')} Your current profile says {workspace.profile.cgpa}. A verification task will be added; no value will be overwritten.</div>}<ModalActions onCancel={() => { setModal(null); setPendingWorkbook(null) }} submit="Import unverified leads" onSubmit={confirmWorkbookImport} /></div></Modal>}
      {modal === 'profile' && <Modal title="Applicant profile" onClose={() => setModal(null)} wide><form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2"><Field label="Name"><input className="input" value={profileForm.name} onChange={event => setProfile('name', event.target.value)} /></Field><Field label="Contact email"><input type="email" className="input" value={profileForm.contactEmail} onChange={event => setProfile('contactEmail', event.target.value)} /></Field><Field label="Portfolio URL"><input type="url" className="input" value={profileForm.portfolioUrl} onChange={event => setProfile('portfolioUrl', event.target.value)} /></Field><Field label="GitHub URL"><input type="url" className="input" value={profileForm.githubUrl} onChange={event => setProfile('githubUrl', event.target.value)} /></Field><Field label="LinkedIn URL"><input type="url" className="input" value={profileForm.linkedinUrl} onChange={event => setProfile('linkedinUrl', event.target.value)} /></Field><Field label="CV URL"><input type="url" className="input" value={profileForm.cvUrl} onChange={event => setProfile('cvUrl', event.target.value)} /></Field><Field label="University"><input className="input" value={profileForm.university} onChange={event => setProfile('university', event.target.value)} /></Field><Field label="Degree"><input className="input" value={profileForm.degree} onChange={event => setProfile('degree', event.target.value)} /></Field><Field label="CGPA"><input className="input" value={profileForm.cgpa} onChange={event => setProfile('cgpa', event.target.value)} /></Field><Field label="SSC GPA"><input className="input" value={profileForm.ssc} onChange={event => setProfile('ssc', event.target.value)} /></Field><Field label="HSC GPA"><input className="input" value={profileForm.hsc} onChange={event => setProfile('hsc', event.target.value)} /></Field><Field label="Academic status"><input className="input" value={profileForm.status} onChange={event => setProfile('status', event.target.value)} /></Field><Field label="IELTS"><input className="input" value={profileForm.ielts} onChange={event => setProfile('ielts', event.target.value)} /></Field><Field label="Target intake"><input className="input" value={profileForm.target} onChange={event => setProfile('target', event.target.value)} /></Field><Field label="Funding need"><input className="input" value={profileForm.needs} onChange={event => setProfile('needs', event.target.value)} /></Field><Field label="Timezone"><input className="input" value={profileForm.timezone} onChange={event => setProfile('timezone', event.target.value)} /></Field><Field label="Skills from portfolio"><textarea className="input min-h-20" value={profileForm.skills} onChange={event => setProfile('skills', event.target.value)} /></Field><Field label="Experience from portfolio"><textarea className="input min-h-20" value={profileForm.experience} onChange={event => setProfile('experience', event.target.value)} /></Field><div className="flex items-end justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg border px-4 py-2 text-xs">Cancel</button><button className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white">Save profile</button></div></form></Modal>}
      {modal === 'readiness' && <Modal title="Language tests & applicant readiness" onClose={() => setModal(null)} wide><form onSubmit={saveProfile} className="grid gap-4 sm:grid-cols-2">
        <Field label="IELTS booking/result status (self-reported)"><input className="input" value={profileForm.ielts} onChange={event => setProfile('ielts', event.target.value)} placeholder="Booked / not booked / completed / result pending" /></Field>
        <Field label="IELTS booking date"><input type="date" className="input" value={profileForm.ieltsBookingDate} onChange={event => setProfile('ieltsBookingDate', event.target.value)} /></Field>
        <Field label="IELTS result date"><input type="date" className="input" value={profileForm.ieltsResultDate} onChange={event => setProfile('ieltsResultDate', event.target.value)} /></Field>
        <Field label="IELTS score (leave blank until result received)"><input className="input" value={profileForm.ieltsScore} onChange={event => setProfile('ieltsScore', event.target.value)} placeholder="No score entered" /></Field>
        <Field label="Upfront budget available (your own amount and currency)"><input className="input" value={profileForm.upfrontBudget} onChange={event => setProfile('upfrontBudget', event.target.value)} placeholder="Unknown until you enter it" /></Field>
        <Field label="Passport expiry date"><input type="date" className="input" value={profileForm.passportExpiry} onChange={event => setProfile('passportExpiry', event.target.value)} /></Field>
        <p className="rounded-lg bg-[#faf9f6] p-3 text-[10px] leading-relaxed text-slate-500 sm:col-span-2">These are personal planning fields and are not independently verified. An empty IELTS score stays empty; no status or budget is inferred. Universities may have different passport-validity and English-test requirements—verify each program notice.</p>
        <div className="flex justify-end gap-2 sm:col-span-2"><button type="button" onClick={() => setModal(null)} className="rounded-lg border px-4 py-2 text-xs">Cancel</button><button className="rounded-lg bg-ink px-4 py-2 text-xs font-semibold text-white">Save readiness details</button></div>
      </form></Modal>}
      {modal === 'auth' && <Modal title={userId ? 'Account' : 'Secure sign in'} onClose={() => setModal(null)}><div className="mb-4 rounded-lg bg-[#f4f3ee] p-3 text-[11px] leading-relaxed text-slate-600">{supabaseConfigured ? 'Authenticate to sync your workspace to your private Supabase account.' : 'Local mode is ready. Configure Supabase to enable account sync and private file storage.'}</div>{userId ? <div><p className="mb-4 text-sm">{email}</p><button onClick={async () => { if (supabase) await supabase.auth.signOut(); setUserId(null); setModal(null); notify('Signed out.') }} className="rounded-lg border px-4 py-2 text-xs">Sign out</button></div> : <form onSubmit={signIn} className="space-y-3"><Field label="Email"><input name="email" type="email" required className="input" placeholder="you@example.com" /></Field><Field label="Password"><input name="password" type="password" required minLength={8} className="input" placeholder="At least 8 characters" /></Field><div className="flex gap-2 pt-2"><button name="action" value="in" onClick={() => setAuthAction('in')} disabled={authBusy} className="flex-1 rounded-lg bg-ink px-3 py-2.5 text-xs font-semibold text-white disabled:opacity-50">{authBusy ? <LoaderCircle className="mx-auto animate-spin" size={16} /> : 'Sign in'}</button><button name="action" value="up" onClick={() => setAuthAction('up')} disabled={authBusy} className="flex-1 rounded-lg border px-3 py-2.5 text-xs font-semibold">Create account</button></div></form>}</Modal>}
      {drawer && <UniversityDrawer university={drawer} documents={documents} timezone={workspace.profile.timezone} onClose={() => setDrawer(null)} onUpdate={async (uni) => { if (await saveUniversity(uni)) { setDrawer(uni); notify('University details saved.') } }} onStage={stage => changeStage(drawer, stage)} />}
    </div>
  )
}

function Dashboard({ workspace, documents, overdue, openTasks, taskChart, funnel, timezone, onOpenTasks, onOpenUniversities, onOpenScholarships, onOpenDocuments, onOpenReadiness, onComplete, onEditProfile }: {
  workspace: Workspace; documents: DocumentRecord[]; overdue: Task[]; openTasks: Task[]; taskChart: { month: string; tasks: number }[];
  funnel: { stage: Stage; count: number }[]; timezone: string; onOpenTasks: () => void; onOpenUniversities: () => void; onOpenScholarships: () => void;
  onOpenDocuments: () => void; onOpenReadiness: () => void;
  onComplete: (task: Task) => void; onEditProfile: () => void
}) {
  const done = workspace.tasks.filter(task => task.done).length
  const completion = workspace.tasks.length ? Math.round(done / workspace.tasks.length * 100) : 0
  return <div className="space-y-5">
    {(workspace.universities.some(uni => uni.isExample) || workspace.tasks.some(task => task.isExample)) && <div className="surface rounded-xl border border-[#eadfca] bg-[#fbf7ed] px-4 py-3 text-[10px] leading-relaxed text-[#806e48]"><strong>Starter examples:</strong> university stages, shortlist tiers, and task ideas are placeholders for you to replace. They are not actual application status or university deadlines; no seeded task has a due date.</div>}
    <section className="soft-grid surface relative overflow-hidden rounded-2xl border border-[#e7e5de] bg-[#fffefa] p-5 sm:p-6">
      <div className="absolute -right-8 -top-12 select-none font-display text-[190px] font-bold leading-none text-teal/[0.035]">í•œ</div>
      <div className="relative flex flex-wrap items-center justify-between gap-5">
        <div><div className="mb-2 inline-flex items-center gap-1.5 rounded-full border border-[#e8ddc3] bg-[#faf6eb] px-2.5 py-1 text-[9px] font-semibold uppercase tracking-[.1em] text-[#967442]"><Sparkles size={11} /> Personal application plan</div><h2 className="font-display text-[20px] font-bold tracking-[-.03em]">Your next chapter starts here.</h2><p className="mt-1 max-w-xl text-[11px] leading-relaxed text-slate-500">Build an evidence-backed shortlist, prepare a strong application, and keep every funding decision visible.</p></div>
        <button onClick={onEditProfile} className="inline-flex items-center gap-1.5 rounded-lg border border-[#dedbd1] bg-white/80 px-3 py-2 text-[10px] font-semibold hover:border-teal/40"><SlidersHorizontal size={13} />Edit profile</button>
      </div>
    </section>
    <section className="grid grid-cols-2 gap-3 xl:grid-cols-4">
      <Metric label="Shortlisted" value={String(workspace.universities.length).padStart(2, '0')} note={workspace.universities.some(uni => uni.isExample) ? 'starter examples included' : 'your university records'} icon={GraduationCap} tint="teal" onClick={onOpenUniversities} />
      <Metric label="Applications in progress" value={String(workspace.universities.filter(uni => !['Researching', 'Rejected'].includes(uni.stage)).length).padStart(2, '0')} note="active application records" icon={Activity} tint="gold" onClick={onOpenUniversities} />
      <Metric label="Open actions" value={String(openTasks.length).padStart(2, '0')} note={overdue.length ? `${overdue.length} overdue â€” review now` : openTasks.some(task => task.isExample) ? 'planning examples; no dates set' : 'no overdue tasks'} icon={ListTodo} tint={overdue.length ? 'rose' : 'slate'} onClick={onOpenTasks} />
      <Metric label="Verified full-funding routes" value={String(workspace.opportunities.filter(item => fundingStatus(item) === 'Verified full funding').length).padStart(2, '0')} note="Fall 2027 evidence required" icon={Wallet} tint="slate" onClick={onOpenScholarships} />
    </section>
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="font-display text-[13px] font-bold">Funding priorities</div>
          <p className="mt-1 text-[10px] text-slate-500">Sorted by funding tier, profile fit, funding completeness, evidence, and intake verification—not university prestige.</p></div>
        <button onClick={onOpenScholarships} className="text-[10px] font-semibold text-teal">Scholarships & filters <ChevronRight size={13} className="inline" /></button>
      </div>
      {workspace.opportunities.filter(item => fundingStatus(item) === 'Verified full funding' && item.ieltsRequirement === 'Not required').length === 0 &&
        <p className="mt-3 rounded-lg border border-[#eadfca] bg-[#fbf7ed] p-3 text-[9px] leading-relaxed text-[#806e48]">No verified opportunity currently meets “full funding + IELTS not required.” The leads below are closest available research records, not confirmed scholarship or admission offers.</p>}
      <div className="mt-3 grid gap-2 md:grid-cols-3">
        {rankScholarshipOpportunities(workspace.opportunities).slice(0, 3).map(item => <button key={item.id} onClick={onOpenScholarships} className="rounded-lg bg-[#faf9f6] p-3 text-left hover:bg-[#f4f3ee]">
          <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold text-teal">{tierFor(item)}</span><span className="text-[8px] text-slate-400">{item.intakeVerification}</span></div>
          <div className="mt-1 truncate text-[10px] font-semibold">{item.name}</div>
          <div className="mt-0.5 truncate text-[9px] text-slate-500">{item.university}</div>
          <div className="mt-2 text-[9px] text-slate-500">{fundingStatus(item)} · IELTS {item.ieltsRequirement.toLowerCase()}</div>
        </button>)}
        {!workspace.opportunities.length && <p className="text-[10px] text-slate-500">Add program or funding records to rank them against your priorities.</p>}
      </div>
    </section>
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div><div className="font-display text-[13px] font-bold">Applicant readiness</div><p className="mt-1 text-[10px] text-slate-500">Based on information you enter; this is not an admissions eligibility decision.</p></div>
        <div className="flex gap-2"><button onClick={onOpenReadiness} className="rounded-lg border px-3 py-2 text-[9px] font-semibold">Update profile</button><button onClick={onOpenDocuments} className="rounded-lg border px-3 py-2 text-[9px] font-semibold">Review documents</button></div>
      </div>
      <div className="mt-3 grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
        <ReadinessItem label="Academic profile" value={`${workspace.profile.cgpa || 'CGPA not entered'} · ${workspace.profile.status || 'status not entered'}`} complete={Boolean(workspace.profile.cgpa && workspace.profile.university && workspace.profile.degree)} />
        <ReadinessItem label="IELTS booking" value={workspace.profile.ieltsBookingDate || workspace.profile.ielts || 'Not entered'} complete={Boolean(workspace.profile.ieltsBookingDate || workspace.profile.ielts)} />
        <ReadinessItem label="IELTS result" value={workspace.profile.ieltsScore ? `Score entered: ${workspace.profile.ieltsScore}` : 'No score entered'} complete={Boolean(workspace.profile.ieltsScore)} />
        <ReadinessItem label="Passport expiry" value={workspace.profile.passportExpiry || 'Not entered'} complete={Boolean(workspace.profile.passportExpiry)} />
        <ReadinessItem label="Upfront budget" value={workspace.profile.upfrontBudget ? `${workspace.profile.upfrontBudget} (user-entered)` : 'Unknown · enter your own amount'} complete={Boolean(workspace.profile.upfrontBudget)} />
        <ReadinessItem label="Passport document" value={documents.find(item => item.name.toLowerCase().includes('passport'))?.status ?? 'Not in checklist'} complete={documents.some(item => item.name.toLowerCase().includes('passport') && item.status === 'Available')} />
        <ReadinessItem label="Transcript" value={documents.find(item => item.name.toLowerCase().includes('transcript'))?.status ?? 'Not in checklist'} complete={documents.some(item => item.name.toLowerCase().includes('transcript') && item.status === 'Available')} />
        <ReadinessItem label="MOI letter" value={documents.find(item => item.name.toLowerCase().includes('medium of instruction'))?.status ?? 'Not in checklist'} complete={documents.some(item => item.name.toLowerCase().includes('medium of instruction') && item.status === 'Available')} />
      </div>
    </section>
    <section className="grid gap-4 xl:grid-cols-[1.6fr_1fr]">
      <div className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
        <div className="mb-4 flex items-start justify-between"><div><div className="font-display text-[13px] font-bold">Application timeline</div><p className="mt-1 text-[10px] text-slate-500">Task due dates entered in your workspace Â· {timezone}</p></div><button onClick={onOpenTasks} className="text-[10px] font-semibold text-teal hover:underline">View calendar <ChevronRight size={13} className="inline" /></button></div>
        {taskChart.length ? <div className="h-[205px]"><ResponsiveContainer width="100%" height="100%"><AreaChart data={taskChart} margin={{ top: 8, right: 8, left: -22, bottom: 0 }}><defs><linearGradient id="taskFill" x1="0" y1="0" x2="0" y2="1"><stop offset="0%" stopColor="#20877f" stopOpacity={0.2} /><stop offset="95%" stopColor="#20877f" stopOpacity={0.01} /></linearGradient></defs><CartesianGrid stroke="#eeede8" vertical={false} /><XAxis dataKey="month" tick={{ fontSize: 10, fill: '#929996' }} axisLine={false} tickLine={false} /><YAxis allowDecimals={false} tick={{ fontSize: 10, fill: '#929996' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 10, fontSize: 11, borderColor: '#e5e5dd' }} /><Area type="monotone" dataKey="tasks" name="Tasks due" stroke="#20877f" strokeWidth={2.4} fill="url(#taskFill)" /></AreaChart></ResponsiveContainer></div> : <EmptyState icon={CalendarDays} title="No deadline timeline yet" text="Add dates to your own tasks to build a real timeline. University deadlines are shown only when confirmed." />}
      </div>
      <div className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
        <div className="mb-1 font-display text-[13px] font-bold">Application funnel</div><p className="text-[10px] text-slate-500">Live university counts by application stage</p>
        {workspace.universities.some(uni => !uni.isExample) ? <div className="mt-2 h-[310px]"><ResponsiveContainer width="100%" height="100%"><BarChart data={funnel} layout="vertical" margin={{ left: 4, right: 13, top: 5, bottom: 5 }}><CartesianGrid stroke="#eeede8" horizontal={false} /><XAxis type="number" allowDecimals={false} tick={{ fontSize: 9, fill: '#929996' }} axisLine={false} tickLine={false} /><YAxis type="category" dataKey="stage" width={115} tick={{ fontSize: 9, fill: '#707b79' }} axisLine={false} tickLine={false} /><Tooltip contentStyle={{ borderRadius: 10, fontSize: 11, borderColor: '#e5e5dd' }} /><Bar dataKey="count" name="Universities" fill="#247e77" radius={[0, 4, 4, 0]} barSize={12} /></BarChart></ResponsiveContainer></div> : <EmptyState icon={Activity} title="No application stages yet" text="Starter universities are examples. Add or update a real application stage to populate this chart." />}
      </div>
    </section>
    <section className="grid gap-4 xl:grid-cols-[1.15fr_1fr]">
      <div className="surface rounded-xl border border-[#e7e5de] bg-white">
        <div className="flex items-center justify-between border-b border-[#eeede8] px-5 py-4"><div><div className="font-display text-[13px] font-bold">Priority actions</div><div className="mt-0.5 text-[10px] text-slate-500">{openTasks.length} open Â· {completion}% of all tasks complete</div></div><button onClick={onOpenTasks} className="text-[10px] font-semibold text-teal">All tasks <ChevronRight size={13} className="inline" /></button></div>
        <div className="divide-y divide-[#f0efe9]">{openTasks.slice(0, 4).map(task => <TaskRow key={task.id} task={task} timezone={timezone} onToggle={() => onComplete(task)} />)}{!openTasks.length && <div className="p-5 text-xs text-slate-500">Nothing pending. Add a task to plan your next action.</div>}</div>
      </div>
      <div className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
        <div className="flex items-center justify-between"><div><div className="font-display text-[13px] font-bold">Shortlist at a glance</div><p className="mt-1 text-[10px] text-slate-500">Source references attached Â· intake verification pending</p></div><button onClick={onOpenUniversities} aria-label="Open research" className="rounded-lg border border-[#e7e5de] p-2 text-slate-500"><ChevronRight size={15} /></button></div>
        <div className="mt-3 space-y-2">{workspace.universities.slice(0, 3).map(uni => {
          const statuses = [...new Set(uni.evidence.map(item => item.status))]
          const evidenceLabel = uni.evidence.some(item => item.needsReview) ? 'Review required' : statuses.length > 1 ? 'Mixed evidence' : statuses[0] ?? 'unknown'
          return <button key={uni.id} onClick={onOpenUniversities} className="flex w-full items-center gap-3 rounded-lg bg-[#faf9f6] px-3 py-2.5 text-left hover:bg-[#f4f3ee]"><div className="grid h-8 w-8 place-items-center rounded-lg bg-[#e9f1ed] text-teal"><GraduationCap size={15} /></div><div className="min-w-0 flex-1"><div className="truncate text-[11px] font-semibold">{uni.name}</div><div className="mt-0.5 text-[9px] text-slate-500">{uni.city} Â· {uni.category}</div></div><span className="rounded-full border border-[#e5e2da] px-2 py-0.5 text-[9px] text-slate-500">{evidenceLabel}</span></button>
        })}</div>
        <div className="mt-3 flex items-start gap-2 rounded-lg border border-[#f0e8d6] bg-[#fbf7ed] p-3"><CircleHelp size={14} className="mt-0.5 shrink-0 text-[#a3834a]" /><p className="text-[10px] leading-relaxed text-[#827451]">Target-intake deadlines, tuition, and funding have not been confirmed. No amounts or dates are inferred from older intakes.</p></div>
      </div>
    </section>
  </div>
}

function UniversityPage({ universities, filter, setFilter, countryFilter, setCountryFilter, selected, setSelected, onAdd, onImportWorkbook, onImportContext, onOpen, onStage, onExport }: {
  universities: University[]; filter: string; setFilter: (value: string) => void;
  countryFilter: 'All' | Country; setCountryFilter: (value: 'All' | Country) => void; selected: string[];
  setSelected: (value: string[]) => void; onAdd: () => void; onImportWorkbook: (event: React.ChangeEvent<HTMLInputElement>) => void; onImportContext: () => void; onOpen: (uni: University) => void;
  onStage: (uni: University, stage: Stage) => void; onExport: () => void
}) {
  const filtered = [...universities.filter(uni => (countryFilter === 'All' || uni.country === countryFilter) && (filter === 'All' || uni.category === filter))].sort((a, b) => a.rank - b.rank)
  const compared = universities.filter(uni => selected.includes(uni.id))
  return <div className="space-y-4">
    <div className="surface rounded-xl border border-[#e7e5de] bg-white p-4"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-display text-[13px] font-bold">Research database</div><p className="mt-1 text-[10px] text-slate-500">Country-specific intake labels Â· figures stay unknown until evidence is checked</p></div><div className="flex flex-wrap gap-2"><select aria-label="Filter by country" value={countryFilter} onChange={event => setCountryFilter(event.target.value as 'All' | Country)} className="rounded-lg border border-[#e5e3dc] bg-white px-3 py-2 text-[11px]"><option>All</option>{countries.map(country => <option key={country}>{country}</option>)}</select><select aria-label="Filter by category" value={filter} onChange={event => setFilter(event.target.value)} className="rounded-lg border border-[#e5e3dc] bg-white px-3 py-2 text-[11px]"><option>All</option>{categories.map(item => <option key={item}>{item}</option>)}</select><button onClick={onImportContext} className="rounded-lg border border-[#e5e3dc] px-3 py-2 text-[11px] font-medium hover:bg-[#faf9f6]">Import Korea context</button><label className="cursor-pointer rounded-lg border border-[#e5e3dc] px-3 py-2 text-[11px] font-medium hover:bg-[#faf9f6]"><input type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" onChange={onImportWorkbook} className="sr-only" />Import .xlsx</label><button onClick={onExport} className="rounded-lg border border-[#e5e3dc] px-3 py-2 text-[11px] font-medium"><Download size={13} className="mr-1 inline" />CSV</button><button onClick={onAdd} className="rounded-lg bg-ink px-3 py-2 text-[11px] font-semibold text-white"><Plus size={13} className="mr-1 inline" />Add university</button></div></div></div>
    {compared.length > 0 && <div className="surface overflow-x-auto rounded-xl border border-[#dfe7e1] bg-[#f3f7f3] p-4"><div className="mb-3 flex items-center justify-between"><div className="text-xs font-semibold">Comparison Â· {compared.length} selected</div><button onClick={() => setSelected([])} className="text-[10px] text-slate-500">Clear</button></div><div className="grid min-w-[520px] gap-3" style={{ gridTemplateColumns: `repeat(${compared.length}, minmax(150px,1fr))` }}>{compared.map(uni => <div key={uni.id} className="rounded-lg border border-[#e1e7e0] bg-white p-3"><div className="truncate text-[11px] font-semibold">{uni.name}</div><div className="mt-1 text-[9px] text-slate-500">{uni.country} Â· {uni.intake}</div><div className="mt-2 text-[10px] text-slate-500">Tuition / year <strong className="block text-slate-700">{uni.tuition ? `â‚©${uni.tuition.toLocaleString()}` : 'Unknown'}</strong></div><div className="mt-2 text-[10px] text-slate-500">Stipend / month <strong className="block text-slate-700">{uni.stipend ? `â‚©${uni.stipend.toLocaleString()}` : 'Unknown'}</strong></div><div className="mt-2 text-[10px] text-slate-500">Deadline <strong className="block text-slate-700">{uni.deadline ? dateLabel(uni.deadline) : 'Not confirmed'}</strong></div></div>)}</div></div>}
    <div className="surface overflow-hidden rounded-xl border border-[#e7e5de] bg-white">
      <div className="overflow-x-auto"><table className="w-full min-w-[1020px] text-left"><thead><tr className="border-b border-[#eeede8] bg-[#faf9f6] text-[9px] font-semibold uppercase tracking-[.1em] text-slate-500"><th className="w-9 px-4 py-3"></th><th className="px-3 py-3">Rank</th><th className="px-3 py-3">University / program</th><th className="px-3 py-3">Country / intake</th><th className="px-3 py-3">Shortlist tier</th><th className="px-3 py-3">Application stage</th><th className="px-3 py-3">Tuition / year</th><th className="px-3 py-3">Funding</th><th className="px-3 py-3">Deadline</th><th className="px-3 py-3">Evidence</th></tr></thead><tbody>{filtered.map(uni => <tr key={uni.id} className="border-b border-[#f1f0eb] last:border-0 hover:bg-[#fcfbf8]"><td className="px-4 py-3"><input aria-label={`Select ${uni.name} for comparison`} type="checkbox" checked={selected.includes(uni.id)} onChange={event => setSelected(event.target.checked ? [...selected, uni.id] : selected.filter(id => id !== uni.id))} /></td><td className="px-3 py-3 text-[10px] text-slate-500">#{uni.rank}</td><td className="px-3 py-3"><button onClick={() => onOpen(uni)} className="text-left"><div className="text-[11px] font-semibold hover:text-teal">{uni.name}{uni.isExample && <span className="ml-2 rounded-full bg-[#f6f1e4] px-1.5 py-0.5 text-[8px] font-normal text-[#8f7543]">example</span>}</div><div className="mt-0.5 text-[9px] text-slate-500">{uni.program} Â· {uni.city}</div></button></td><td className="px-3 py-3 text-[9px] text-slate-600">{uni.country}<div className="mt-0.5 text-slate-400">{uni.intake}</div></td><td className="px-3 py-3"><span className="rounded-full bg-[#f3f1eb] px-2 py-1 text-[9px] text-slate-600">{uni.category}</span></td><td className="px-3 py-3"><select aria-label={`Stage for ${uni.name}`} className="max-w-[145px] rounded-md border border-[#eceae3] bg-white px-2 py-1.5 text-[10px]" value={uni.stage} onChange={event => onStage(uni, event.target.value as Stage)}>{stageOptions.map(stage => <option key={stage}>{stage}</option>)}</select>{uni.isExample && <div className="mt-1 text-[8px] text-slate-400">sample stage</div>}</td><td className="px-3 py-3 text-[10px]">{uni.tuition ? `â‚©${uni.tuition.toLocaleString()}` : <span className="text-slate-400">Unknown</span>}</td><td className="px-3 py-3 text-[10px]">{uni.coverage}</td><td className="px-3 py-3 text-[10px]">{uni.deadline ? dateLabel(uni.deadline) : <span className="text-slate-400">Not confirmed</span>}</td><td className="px-3 py-3"><span className={`rounded-full border px-2 py-1 text-[9px] ${badge[uni.evidence[0]?.status ?? 'unknown']}`}>{uni.evidence[0]?.status ?? 'unknown'}</span></td></tr>)}{!filtered.length && <tr><td colSpan={10} className="p-10 text-center text-xs text-slate-500">No universities match this filter. Add one or adjust your search.</td></tr>}</tbody></table></div>
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-[#eeede8] px-4 py-3 text-[9px] text-slate-500"><span>{filtered.length} universities Â· select rows to compare</span><span>Funding completeness formula: verified tuition + living + guaranteed support + duration + renewal terms (each 20%). No evidence = 0%.</span></div>
    </div>
  </div>
}

function ApplicationsPage({ universities, onStage, onOpen }: { universities: University[]; onStage: (uni: University, stage: Stage) => void; onOpen: (uni: University) => void }) {
  return <div className="space-y-4">
    <div className="surface rounded-xl border border-[#eadfca] bg-[#fbf7ed] p-4 text-[10px] leading-relaxed text-[#806e48]">Starter stages are examples, not actual application outcomes. Use each program’s detail panel to record verified requirements, official deadlines, recommendation letters, submission dates, decisions, and next actions.</div>
    <div className="surface rounded-xl border border-[#e7e5de] bg-white p-5"><div className="font-display text-[13px] font-bold">Master’s application pipeline</div><p className="mt-1 text-[10px] text-slate-500">Open a program card to manage its requirements, document links, recommender progress, submission details, and decision.</p></div>
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">{stageOptions.map(stage => {
      const items = universities.filter(uni => uni.stage === stage)
      return <section key={stage} className="surface min-h-[145px] rounded-xl border border-[#e7e5de] bg-white p-3">
        <div className="mb-3 flex items-center justify-between"><span className="text-[11px] font-semibold">{stage}</span><span className="rounded-full bg-[#f1f0eb] px-2 py-0.5 text-[9px] text-slate-500">{items.length}</span></div>
        {items.length ? items.map(uni => <button key={uni.id} onClick={() => onOpen(uni)} className="mb-2 block w-full rounded-lg border border-[#eeede8] p-3 text-left hover:border-teal/40">
          <div className="text-[11px] font-semibold">{uni.name}{uni.isExample && <span className="ml-2 rounded-full bg-[#f6f1e4] px-1.5 py-0.5 text-[8px] font-normal text-[#8f7543]">example</span>}</div>
          <div className="mt-1 flex items-center justify-between text-[9px] text-slate-500"><span>{uni.city} · {uni.category}</span><select aria-label={`Update stage for ${uni.name}`} onClick={event => event.stopPropagation()} onChange={event => onStage(uni, event.target.value as Stage)} value={uni.stage} className="max-w-[115px] rounded border px-1 py-1 text-[9px]">{stageOptions.map(item => <option key={item}>{item}</option>)}</select></div>
          <div className="mt-2 text-[9px] text-slate-500">Requirements: {uni.requirements?.length ?? 0} · Recommendations: {uni.recommendations?.length ?? 0} · {uni.submittedAt ? `Submitted ${dateLabel(uni.submittedAt)}` : 'Not submitted'}</div>
        </button>) : <p className="py-4 text-center text-[10px] text-slate-400">No applications in this stage.</p>}
      </section>
    })}</div>
  </div>
}

function TasksPage({ tasks, timezone, onAdd, onComplete }: { tasks: Task[]; timezone: string; onAdd: () => void; onComplete: (task: Task) => void }) {
  const sorted = [...tasks].sort((a, b) => a.done === b.done ? a.dueDate.localeCompare(b.dueDate) : a.done ? 1 : -1)
  const completed = tasks.filter(task => task.done).length
  return <div className="grid gap-4 xl:grid-cols-[1.5fr_1fr]"><section className="surface overflow-hidden rounded-xl border border-[#e7e5de] bg-white"><div className="flex items-center justify-between border-b border-[#eeede8] p-4"><div><div className="font-display text-[13px] font-bold">Task manager</div><div className="mt-1 text-[10px] text-slate-500">{completed} of {tasks.length} complete Â· overdue tasks highlighted</div></div><button onClick={onAdd} className="rounded-lg bg-ink px-3 py-2 text-[10px] font-semibold text-white"><Plus size={13} className="mr-1 inline" />Add task</button></div><div className="divide-y divide-[#f0efe9]">{sorted.map(task => <TaskRow key={task.id} task={task} timezone={timezone} onToggle={() => onComplete(task)} />)}{!tasks.length && <div className="p-8 text-center text-xs text-slate-500">No tasks yet. Add one to start planning.</div>}</div></section><section className="surface rounded-xl border border-[#e7e5de] bg-white p-5"><div className="font-display text-[13px] font-bold">Calendar Â· {timezone}</div><p className="mt-1 text-[10px] text-slate-500">Only user-entered task dates and confirmed application deadlines appear here.</p><div className="mt-4 space-y-2">{sorted.filter(task => task.dueDate).map(task => <div key={task.id} className="flex gap-3 rounded-lg bg-[#faf9f6] p-3"><div className="grid h-9 min-w-9 place-items-center rounded-lg bg-[#e7f0eb] text-center"><span className="text-[12px] font-bold text-teal">{new Date(`${task.dueDate}T12:00:00Z`).getUTCDate()}</span></div><div className="min-w-0"><div className="truncate text-[10px] font-semibold">{task.title}</div><div className="mt-1 text-[9px] text-slate-500">{dateLabel(task.dueDate)} Â· {task.priority}{!task.done && task.dueDate < today(timezone) && <span className="ml-2 text-rose-600">Overdue</span>}</div></div></div>)}{!sorted.some(task => task.dueDate) && <div className="py-8 text-center text-xs text-slate-400">No dated tasks. Add a due date to see it in the calendar.</div>}</div></section></div>
}

function BudgetPage({ budget, setBudget, onOpenScholarships }: { budget: Budget; setBudget: (value: Budget) => void; onOpenScholarships: () => void }) {
  const fields: [Exclude<keyof Budget, 'currency'>, string][] = [
    ['monthlyLiving', `Monthly living costs (${budget.currency})`], ['annualTuition', `Tuition per year (${budget.currency})`],
    ['travel', `Annual travel (${budget.currency})`], ['fees', `Annual application / mandatory fees (${budget.currency})`],
    ['insurance', `Annual insurance (${budget.currency})`], ['guaranteedMonthly', `Guaranteed monthly funding (${budget.currency})`],
  ]
  const val = (key: Exclude<keyof Budget, 'currency'>) => Number(budget[key]) || 0
  const cost = val('monthlyLiving') * 12 + val('annualTuition') + val('travel') + val('fees') + val('insurance')
  const guaranteed = val('guaranteedMonthly') * 12
  const gap = Math.max(cost - guaranteed, 0)
  return <div className="space-y-4">
    <div className="surface rounded-xl border border-[#e7e5de] bg-white p-5"><div className="font-display text-[13px] font-bold">Funding & budget planner</div><p className="mt-1 text-[10px] text-slate-500">All amounts are your editable planning inputs, not official cost estimates. Unknowns are excluded until you enter evidence-backed figures.</p></div>
    <section className="surface flex flex-wrap items-center justify-between gap-3 rounded-xl border border-[#e7e5de] bg-white p-5"><div><div className="font-display text-[12px] font-bold">Scholarship and program funding</div><p className="mt-1 text-[10px] text-slate-500">Review claim-level official evidence, language rules, intake status, and funding completeness in the opportunity tracker.</p></div><button onClick={onOpenScholarships} className="rounded-lg bg-ink px-3 py-2 text-[10px] font-semibold text-white">Open funding tracker</button></section>
    <div className="grid gap-4 xl:grid-cols-[1fr_1fr]">
      <div className="surface rounded-xl border border-[#e7e5de] bg-white p-5"><div className="mb-4 flex flex-wrap items-center justify-between gap-2"><div className="text-[11px] font-semibold">Annual planning assumptions Â· {budget.currency}</div><label className="text-[10px] text-slate-500">Scenario currency<select aria-label="Scenario currency" className="input ml-2 w-28" value={budget.currency} onChange={event => setBudget({ ...budget, currency: event.target.value as Currency })}>{(['KRW', 'EUR', 'BDT'] as Currency[]).map(currency => <option key={currency}>{currency}</option>)}</select></label></div><div className="grid gap-3 sm:grid-cols-2">{fields.map(([key, label]) => <Field key={key} label={label}><input inputMode="numeric" type="number" min="0" value={budget[key]} onChange={event => setBudget({ ...budget, [key]: event.target.value })} placeholder="Unknown" className="input" /></Field>)}</div><div className="mt-4 rounded-lg border border-[#ede8db] bg-[#fbf8f0] p-3 text-[10px] leading-relaxed text-[#827451]">Competitive or conditional scholarships do not count toward guaranteed funding. Add only written, applicable support in the guaranteed monthly field. Use one currency per scenario; the app does not convert amounts.</div></div>
      <div className="surface rounded-xl border border-[#e7e5de] bg-white p-5"><div className="text-[11px] font-semibold">Out-of-pocket scenario Â· {budget.currency}</div>{cost > 0 ? <><div className="mt-4 grid grid-cols-2 gap-3"><Amount label="Annual costs entered" value={cost} symbol={currencySymbols[budget.currency]} /><Amount label="Guaranteed support entered" value={guaranteed} symbol={currencySymbols[budget.currency]} /><Amount label="Estimated remaining gap" value={gap} symbol={currencySymbols[budget.currency]} emphasis /><Amount label="Support coverage" value={cost ? Math.min(100, Math.round(guaranteed / cost * 100)) : 0} suffix="%" /></div><div className="mt-5 h-3 overflow-hidden rounded-full bg-[#eeede8]"><div className="h-full rounded-full bg-teal transition-all" style={{ width: `${Math.min(100, cost ? guaranteed / cost * 100 : 0)}%` }} /></div><div className="mt-2 flex justify-between text-[9px] text-slate-500"><span>Guaranteed support</span><span>Entered cost scenario</span></div></> : <EmptyState icon={Wallet} title="Costs are unknown" text="Enter costs from official sources or your own budget to see an estimate. No costs have been invented." />}<p className="mt-4 text-[9px] text-slate-400">Simple 12-month model; does not account for one-time funding, start dates, renewal, tax, or currency conversion. Verify terms before relying on it.</p></div>
    </div>
  </div>
}

function DocumentsPage({ docs, setDocs, name, setName, type, setType, onAdd, authenticated, userId, cloudReady, setToast }: {
  docs: DocumentRecord[]; setDocs: (docs: DocumentRecord[]) => void;
  name: string; setName: (value: string) => void; type: string; setType: (value: string) => void; onAdd: () => void;
  authenticated: boolean; userId: string | null; cloudReady: boolean; setToast: (message: string) => void
}) {
  const [busyId, setBusyId] = useState<string | null>(null)
  const upload = async (doc: DocumentRecord, file: File) => {
    if (!supabase || !userId || !cloudReady) { setToast('Sign in and wait for account data to load before uploading.'); return }
    if (!['application/pdf', 'image/jpeg', 'image/png'].includes(file.type) || file.size > 20 * 1024 * 1024) { setToast('Choose a PDF, JPG, or PNG file up to 20 MB.'); return }
    setBusyId(doc.id)
    const safeName = file.name.replace(/[^a-zA-Z0-9._-]/g, '_').slice(-100) || 'document'
    const path = `${userId}/${doc.id}/${crypto.randomUUID()}-${safeName}`
    const { error } = await supabase.storage.from('private-documents').upload(path, file, { contentType: file.type, upsert: false })
    if (error) setToast(`Document upload failed: ${error.message}`)
    else { setDocs(docs.map(item => item.id === doc.id ? { ...item, storagePath: path } : item)); setToast('Private document uploaded.') }
    setBusyId(null)
  }
  const openFile = async (doc: DocumentRecord) => {
    if (!supabase || !doc.storagePath) return
    const { data, error } = await supabase.storage.from('private-documents').createSignedUrl(doc.storagePath, 60)
    if (error) setToast(`Could not open document: ${error.message}`)
    else window.open(data.signedUrl, '_blank', 'noopener,noreferrer')
  }
  const remove = async (doc: DocumentRecord) => {
    if (doc.storagePath && supabase) {
      const { error } = await supabase.storage.from('private-documents').remove([doc.storagePath])
      if (error) { setToast(`Could not delete private file: ${error.message}`); return }
    }
    setDocs(docs.filter(item => item.id !== doc.id))
  }
  return <div className="space-y-4">
    <div className="surface rounded-xl border border-[#dfe9e2] bg-[#f2f7f2] p-4">
      <div className="flex gap-3"><ShieldCheck className="shrink-0 text-teal" size={18} /><div>
        <div className="text-[11px] font-semibold">{cloudReady ? 'Private document metadata sync enabled' : 'Local document checklist'}</div>
        <p className="mt-1 text-[10px] text-slate-600">{cloudReady ? 'Checklist details and uploaded files are stored in your authenticated account. Files stay in the private bucket and open through short-lived signed links.' : authenticated ? 'Account metadata has not loaded. Wait for the account connection before uploading files.' : 'Checklist metadata is stored in this browser until you sign in. Private file uploads require sign-in.'}</p>
      </div></div>
    </div>
    <section className="surface overflow-hidden rounded-xl border border-[#e7e5de] bg-white">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#eeede8] p-4">
        <div><div className="font-display text-[13px] font-bold">Document vault checklist</div><div className="mt-1 text-[10px] text-slate-500">{docs.filter(doc => doc.status === 'Available').length} available Â· expiry and per-university requirements need review</div></div>
        <div className="flex gap-2"><input value={name} onChange={event => setName(event.target.value)} placeholder="Add document requirement" className="input max-w-[210px]" /><select value={type} onChange={event => setType(event.target.value)} className="input w-28"><option>Academic</option><option>Identity</option><option>Language</option><option>Financial</option><option>Recommendation</option><option>Other</option></select><button aria-label="Add document requirement" onClick={onAdd} className="rounded-lg bg-ink px-3 text-[10px] font-semibold text-white"><Plus size={13} className="inline" /></button></div>
      </div>
      <div className="overflow-x-auto"><table className="w-full min-w-[820px] text-left">
        <thead><tr className="bg-[#faf9f6] text-[9px] uppercase tracking-wider text-slate-500"><th className="px-4 py-3">Document</th><th className="px-4 py-3">Type</th><th className="px-4 py-3">Issue / expiry date</th><th className="px-4 py-3">Status</th><th className="px-4 py-3">Translation / notarization / apostille</th><th /></tr></thead>
        <tbody>{docs.map((doc, index) => <tr key={doc.id} className="border-t border-[#f0efe9] text-[10px]">
          <td className="px-4 py-3 font-medium"><FileText size={13} className="mr-2 inline text-teal" />{doc.name}</td><td className="px-4 py-3 text-slate-500">{doc.type}</td>
          <td className="px-4 py-3"><div className="space-y-1"><input aria-label={`Issue date for ${doc.name}`} type="date" value={doc.issued} onChange={event => setDocs(docs.map((item, i) => i === index ? { ...item, issued: event.target.value } : item))} className="rounded border border-[#eceae3] px-2 py-1 text-[9px]" /><input aria-label={`Expiry date for ${doc.name}`} type="date" value={doc.expiry} onChange={event => setDocs(docs.map((item, i) => i === index ? { ...item, expiry: event.target.value } : item))} className="rounded border border-[#eceae3] px-2 py-1 text-[9px]" /></div></td>
          <td className="px-4 py-3"><select aria-label={`Status for ${doc.name}`} value={doc.status} onChange={event => setDocs(docs.map((item, i) => i === index ? { ...item, status: event.target.value } : item))} className="rounded border border-[#eceae3] px-2 py-1 text-[9px]">{['Available', 'Needed', 'In progress', 'Booked â€” result pending'].map(option => <option key={option}>{option}</option>)}</select></td>
          <td className="px-4 py-3"><div className="space-y-1">{([['translation', 'Translation'], ['notarization', 'Notarization'], ['apostille', 'Apostille']] as const).map(([key, label]) => <select key={key} aria-label={`${label} status for ${doc.name}`} value={doc[key]} onChange={event => setDocs(docs.map((item, i) => i === index ? { ...item, [key]: event.target.value } : item))} className="w-full rounded border border-[#eceae3] px-2 py-1 text-[9px]"><option>Not reviewed</option><option>Not needed</option><option>Needed</option><option>In progress</option><option>Complete</option></select>)}</div></td>
          <td className="px-4 py-3"><div className="flex items-center gap-2">{doc.storagePath ? <button onClick={() => void openFile(doc)} className="text-teal hover:underline">Open</button> : <label className={`cursor-pointer text-teal hover:underline ${!cloudReady ? 'pointer-events-none opacity-40' : ''}`}>{busyId === doc.id ? 'Uploading…' : 'Upload'}<input type="file" accept="application/pdf,image/jpeg,image/png" disabled={!cloudReady || busyId === doc.id} onChange={event => { const file = event.currentTarget.files?.[0]; if (file) void upload(doc, file); event.currentTarget.value = '' }} className="sr-only" /></label>}<button aria-label={`Remove ${doc.name}`} onClick={() => void remove(doc)} className="text-slate-400 hover:text-rose-600"><X size={14} /></button></div></td>
        </tr>)}</tbody>
      </table></div>
    </section>
    <div className="surface rounded-xl border border-[#e7e5de] bg-white p-4 text-[10px] text-slate-500">Program-specific missing documents are unknown until each target-intake admissions notice is confirmed.</div>
  </div>
}

function ProfessorPage({ storageKey, userId }: { storageKey: string; userId: string | null }) {
  const [entries, setEntries] = useState<ProfessorRecord[]>(() => readLocalValue<ProfessorRecord[]>(storageKey, []).map(entry => ({ ...entry, id: entry.id || newId(), papers: entry.papers ?? '', funding: entry.funding ?? '', nextAction: entry.nextAction ?? '' })))
  const [form, setForm] = useState({ professor: '', lab: '', email: '', contacted: '', followUp: '', fit: '', papers: '', notes: '', funding: '', nextAction: '' })
  const [editingId, setEditingId] = useState<string | null>(null)
  const [formOpen, setFormOpen] = useState(false)
  const [cloudLoaded, setCloudLoaded] = useState(!supabase || !userId)
  const [loadError, setLoadError] = useState('')
  const [saveError, setSaveError] = useState('')

  useEffect(() => {
    if (!userId || !supabase) {
      setEntries(readLocalValue<ProfessorRecord[]>(storageKey, []).map(entry => ({ ...entry, id: entry.id || newId(), papers: entry.papers ?? '', funding: entry.funding ?? '', nextAction: entry.nextAction ?? '' })))
      setCloudLoaded(true)
      setLoadError('')
      return
    }
    let active = true
    setCloudLoaded(false)
    setLoadError('')
    Promise.resolve(supabase.from('professor_contacts').select('*').eq('user_id', userId).order('created_at')).then(({ data, error }) => {
      if (!active) return
      if (error) {
        setLoadError(`Professor contacts could not be loaded: ${error.message}`)
        return
      }
      const local = readLocalValue<ProfessorRecord[]>(storageKey, []).map(entry => ({ ...entry, id: entry.id || newId(), papers: entry.papers ?? '', funding: entry.funding ?? '', nextAction: entry.nextAction ?? '' }))
      setEntries(data?.length ? data.map(entry => ({
        id: entry.id, professor: entry.professor_name, lab: entry.lab_name ?? '', email: entry.email ?? '',
        contacted: entry.contacted_at ?? '', followUp: entry.follow_up_at ?? '',
        fit: entry.research_fit ?? '', papers: Array.isArray(entry.papers_read) ? entry.papers_read.join('\n') : '',
        notes: entry.reply_summary ?? '', funding: entry.funding_statement ?? '', nextAction: entry.next_action ?? '',
      })) : local)
      setCloudLoaded(true)
    }).catch(error => {
      if (!active) return
      setLoadError(`Professor contacts could not be loaded: ${error instanceof Error ? error.message : 'Network request failed'}`)
    })
    return () => { active = false }
  }, [storageKey, userId])

  useEffect(() => {
    if (userId) return
    try { localStorage.setItem(storageKey, JSON.stringify(entries)) }
    catch (error) { console.error('Could not save professor contacts locally.', error); setSaveError('Could not save contacts to this browser.') }
  }, [entries, storageKey, userId])

  useEffect(() => {
    if (!userId || !supabase || !cloudLoaded) return
    const client = supabase
    const timer = window.setTimeout(async () => {
      try {
        const rows = entries.map(entry => ({
          id: entry.id, user_id: userId, professor_name: entry.professor, lab_name: entry.lab || null,
          email: entry.email || null, contacted_at: entry.contacted || null, follow_up_at: entry.followUp || null,
          research_fit: entry.fit, papers_read: entry.papers.split(/\r?\n/).map(paper => paper.trim()).filter(Boolean),
          reply_summary: entry.notes || null, funding_statement: entry.funding || null, next_action: entry.nextAction || null,
        }))
        if (rows.length) {
          const { error } = await client.from('professor_contacts').upsert(rows)
          if (error) { setSaveError(`Contact sync failed: ${error.message}`); return }
        }
        const { data: saved, error: readError } = await client.from('professor_contacts').select('id').eq('user_id', userId)
        if (readError) { setSaveError(`Could not reconcile account contacts: ${readError.message}`); return }
        const currentIds = new Set(entries.map(entry => entry.id))
        const removedIds = (saved ?? []).map(entry => entry.id).filter(id => !currentIds.has(id))
        if (removedIds.length) {
          const { error } = await client.from('professor_contacts').delete().eq('user_id', userId).in('id', removedIds)
          if (error) setSaveError(`Contact removal sync failed: ${error.message}`)
        }
      } catch (error) {
        setSaveError(`Contact sync failed: ${error instanceof Error ? error.message : 'Network request failed'}`)
      }
    }, 400)
    return () => window.clearTimeout(timer)
  }, [entries, userId, cloudLoaded])

  const editEntry = (entry: ProfessorRecord) => {
    setForm({ professor: entry.professor, lab: entry.lab, email: entry.email, contacted: entry.contacted, followUp: entry.followUp, fit: entry.fit, papers: entry.papers, notes: entry.notes, funding: entry.funding, nextAction: entry.nextAction })
    setEditingId(entry.id)
    setFormOpen(true)
  }
  const saveEntry = async (event: FormEvent) => {
    event.preventDefault()
    if (!form.professor.trim()) return
    if (userId && (!supabase || !cloudLoaded)) { setSaveError(loadError || 'Wait for account data to finish loading before saving.'); return }
    const record: ProfessorRecord = { ...form, professor: form.professor.trim(), id: editingId ?? newId() }
    if (userId && supabase) {
      try {
        const { error } = await supabase.from('professor_contacts').upsert({
          id: record.id, user_id: userId, professor_name: record.professor, lab_name: record.lab || null,
          email: record.email || null, contacted_at: record.contacted || null, follow_up_at: record.followUp || null,
          research_fit: record.fit, papers_read: record.papers.split(/\r?\n/).map(paper => paper.trim()).filter(Boolean),
          reply_summary: record.notes || null, funding_statement: record.funding || null, next_action: record.nextAction || null,
        })
        if (error) { setSaveError(`Contact save failed: ${error.message}`); return }
      } catch (error) {
        setSaveError(`Contact save failed: ${error instanceof Error ? error.message : 'Network request failed'}`)
        return
      }
    }
    setEntries(current => editingId ? current.map(entry => entry.id === editingId ? record : entry) : [...current, record])
    setForm({ professor: '', lab: '', email: '', contacted: '', followUp: '', fit: '', papers: '', notes: '', funding: '', nextAction: '' })
    setEditingId(null); setFormOpen(false); setSaveError('')
  }
  const deleteEntry = async (entry: ProfessorRecord) => {
    if (userId && supabase) {
      try {
        const { error } = await supabase.from('professor_contacts').delete().eq('id', entry.id).eq('user_id', userId)
        if (error) { setSaveError(`Contact removal failed: ${error.message}`); return }
      } catch (error) {
        setSaveError(`Contact removal failed: ${error instanceof Error ? error.message : 'Network request failed'}`)
        return
      }
    }
    setEntries(current => current.filter(item => item.id !== entry.id))
  }

  return <div className="space-y-4"><div className="surface flex items-start justify-between gap-3 rounded-xl border border-[#e7e5de] bg-white p-5"><div><div className="font-display text-[13px] font-bold">Professor outreach CRM</div><p className="mt-1 max-w-2xl text-[10px] leading-relaxed text-slate-500">Track research fit, papers, outreach, replies, funding statements, and next actions. {userId ? 'Account records sync through your private Supabase user account.' : 'Guest records are stored in this browser.'} This tool never sends email.</p></div><button onClick={() => { setForm({ professor: '', lab: '', email: '', contacted: '', followUp: '', fit: '', papers: '', notes: '', funding: '', nextAction: '' }); setEditingId(null); setFormOpen(true) }} className="shrink-0 rounded-lg bg-ink px-3 py-2 text-[10px] font-semibold text-white"><Plus size={13} className="mr-1 inline" />Add contact</button></div>
    {loadError && <p role="alert" className="rounded-lg border border-[#f0d9d2] bg-[#fff8f5] p-3 text-[10px] text-[#9b5945]">{loadError}</p>}
    {saveError && <p role="alert" className="rounded-lg border border-[#f0d9d2] bg-[#fff8f5] p-3 text-[10px] text-[#9b5945]">{saveError}</p>}
    {!cloudLoaded && <p role="status" className="rounded-lg bg-[#f4f3ee] p-3 text-[10px] text-slate-500">Loading account contactsâ€¦</p>}
    {formOpen && <form onSubmit={saveEntry} className="surface grid gap-3 rounded-xl border border-[#e7e5de] bg-white p-4 sm:grid-cols-2 xl:grid-cols-3">{[
      ['professor', 'Professor name'], ['lab', 'Lab / university'], ['email', 'Contact email'], ['contacted', 'Date contacted'], ['followUp', 'Follow-up date'],
      ['fit', 'Research fit'], ['papers', 'Papers read (one per line)'], ['notes', 'Reply summary'], ['funding', 'Funding statement'], ['nextAction', 'Next action'],
    ].map(([key, label]) => <Field key={key} label={label}>{key === 'papers' || key === 'fit' || key === 'notes' || key === 'funding' || key === 'nextAction' ? <textarea rows={key === 'papers' ? 3 : 2} value={form[key as keyof typeof form]} onChange={event => setForm({ ...form, [key]: event.target.value })} className="input" /> : <input type={key === 'contacted' || key === 'followUp' ? 'date' : key === 'email' ? 'email' : 'text'} value={form[key as keyof typeof form]} onChange={event => setForm({ ...form, [key]: event.target.value })} className="input" />}</Field>)}<div className="flex items-end gap-2"><button disabled={!cloudLoaded} className="rounded-lg bg-teal px-4 py-2 text-xs font-semibold text-white disabled:opacity-50">Save contact</button><button type="button" onClick={() => { setEditingId(null); setFormOpen(false); setForm({ professor: '', lab: '', email: '', contacted: '', followUp: '', fit: '', papers: '', notes: '', funding: '', nextAction: '' }) }} className="rounded-lg border px-4 py-2 text-xs">Cancel</button></div></form>}
    {entries.length ? <div className="grid gap-3 md:grid-cols-2">{entries.map(entry => <div key={entry.id} className="surface rounded-xl border border-[#e7e5de] bg-white p-4"><div className="flex items-start justify-between gap-2"><div><div className="font-semibold text-[12px]">{entry.professor}</div><div className="mt-1 text-[10px] text-slate-500">{entry.lab || 'Lab not specified'}</div>{entry.email && <a className="mt-1 block text-[10px] text-teal" href={`mailto:${entry.email}`}>{entry.email}</a>}</div><div className="flex gap-1"><button aria-label={`Edit ${entry.professor}`} onClick={() => editEntry(entry)} className="rounded border px-2 py-1 text-[9px]">Edit</button><button aria-label={`Remove ${entry.professor}`} onClick={() => deleteEntry(entry)} className="rounded border px-2 py-1 text-[9px] text-rose-700">Remove</button></div></div><div className="mt-3 grid grid-cols-2 gap-2 text-[10px]"><div>Contacted: {entry.contacted || 'Not recorded'}</div><div>Follow-up: {entry.followUp || 'Not set'}</div></div>{[['Research fit', entry.fit], ['Papers read', entry.papers], ['Reply', entry.notes], ['Funding', entry.funding], ['Next action', entry.nextAction]].filter(([, value]) => value).map(([label, value]) => <div key={label} className="mt-2 text-[10px] text-slate-600"><strong>{label}:</strong> {value}</div>)}</div>)}</div> : <div className="surface rounded-xl border border-dashed border-[#dcdad2] bg-white py-14"><EmptyState icon={Mail} title="No professor contacts yet" text="Add a lab contact to track your outreach and next step. No messages are sent automatically." /></div>}</div>
}

function SourcesPage({ universities, opportunities, failures, changes, timezone, onRefresh, onReviewChange, onExport }: {
  universities: University[]; opportunities: ScholarshipOpportunity[]; failures: RefreshFailure[]; changes: SourceChange[]; timezone: string;
  onRefresh: () => void; onReviewChange: (change: SourceChange, status: 'reviewed' | 'dismissed') => void; onExport: () => void
}) {
  const all = [
    ...universities.flatMap(uni => [
      ...uni.evidence.map((item, index) => ({ ...item, url: safeHttpsUrl(item.url) ?? '', university: uni.name, id: `${uni.id}-${index}`, quote: '', fieldKey: '' })),
      ...(uni.requirements ?? []).flatMap(requirement => (requirement.evidence ?? []).map((item, index) => ({
        ...item,
        url: safeHttpsUrl(item.url) ?? '', type: `Program requirement · ${requirement.name}`, intake: item.intake, status: item.status,
        note: item.quote, quote: item.quote, fieldKey: item.fieldKey, checkedAt: item.checkedAt,
        needsReview: false, university: uni.name, id: `${uni.id}-${requirement.id}-${index}`,
      }))),
    ]),
    ...opportunities.flatMap(opportunity => [
      ...opportunity.claimEvidence, ...opportunity.languageEvidence, ...(opportunity.applicationEvidence ?? []),
    ].map((item, index) => ({
      ...item,
      url: safeHttpsUrl(item.url) ?? '',
      type: `Scholarship claim · ${item.fieldKey}`, intake: item.intake, status: item.status,
      note: item.quote, quote: item.quote, fieldKey: item.fieldKey, checkedAt: item.checkedAt,
      needsReview: false, university: opportunity.university || opportunity.name, id: `${opportunity.id}-claim-${index}`,
    }))),
  ]
  const stale = all.filter(item => isEvidenceStale(item.checkedAt)).length
  const pendingChanges = changes.filter(change => change.reviewStatus === 'pending')
    .map(change => ({ ...change, url: safeHttpsUrl(change.url) ?? '' }))
  const pastChanges = changes.filter(change => change.reviewStatus !== 'pending')
  return <div className="space-y-4">
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-5"><div className="flex flex-wrap items-center justify-between gap-3"><div><div className="font-display text-[13px] font-bold">Official-source monitoring</div><p className="mt-1 text-[10px] text-slate-500">Fetch success is a freshness signal, never proof that a fact is true or applies to Fall 2027. Checks older than 30 days are marked stale. Claim-level scholarship and program evidence is shown here but not auto-refreshed.</p></div><div className="flex gap-2"><button onClick={() => window.print()} className="rounded-lg border px-3 py-2 text-[10px]">Print report</button><button onClick={onExport} className="rounded-lg border px-3 py-2 text-[10px]"><Download size={13} className="mr-1 inline" />CSV export</button><button onClick={onRefresh} className="rounded-lg bg-ink px-3 py-2 text-[10px] font-semibold text-white"><RefreshCw size={13} className="mr-1 inline" />Refresh monitored pages</button></div></div></section>
    <div className="grid grid-cols-2 gap-3 xl:grid-cols-4"><Metric label="Tracked official URLs" value={String(all.length).padStart(2, '0')} note="linked to shortlist records" icon={ExternalLink} tint="teal" /><Metric label="Confirmed for Fall 2027" value={String(all.filter(item => item.status === 'confirmed' && item.intake === 'Fall 2027').length).padStart(2, '0')} note="evidence reviewed by you" icon={ShieldCheck} tint="slate" /><Metric label="Needs human review" value={String(all.filter(item => item.status !== 'confirmed' || item.needsReview).length).padStart(2, '0')} note="unconfirmed or changed" icon={CircleHelp} tint="gold" /><Metric label="Stale checks" value={String(stale).padStart(2, '0')} note="never checked or older than 30 days" icon={Clock3} tint="rose" /></div>
    {failures.length > 0 && <section className="surface rounded-xl border border-[#f0d9d2] bg-[#fff8f5] p-4"><div className="text-[11px] font-semibold text-[#9b5945]">Recent refresh failures</div>{failures.map(failure => <div key={failure.id} className="mt-2 flex flex-wrap justify-between gap-2 text-[10px] text-slate-600"><span>{failure.error_message ?? 'Source request failed'}</span><span>{timestampLabel(failure.checked_at, timezone)}</span></div>)}</section>}
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-4">
      <div className="flex items-center justify-between gap-2"><div><div className="font-display text-[12px] font-bold">Source-change review queue</div><p className="mt-1 text-[10px] text-slate-500">Page changes are evidence to review, not verified fact updates. Check the official page before editing any application data.</p></div><span className="rounded-full bg-[#fbf7ed] px-2.5 py-1 text-[9px] font-semibold text-[#8a7041]">{pendingChanges.length} pending</span></div>
      {pendingChanges.length ? <div className="mt-3 space-y-3">{pendingChanges.map(change => <article key={change.id} className="rounded-lg border border-[#ebe9e2] bg-[#faf9f6] p-3"><div className="flex flex-wrap items-start justify-between gap-3"><div className="min-w-[220px] flex-1"><div className="text-[11px] font-semibold">{change.university} Â· {change.type}</div><div className="mt-1 text-[9px] text-slate-500">{change.intake} Â· Detected {timestampLabel(change.detectedAt, timezone)}</div><a href={change.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[9px] text-teal hover:underline">{change.url} <ExternalLink size={10} className="inline" /></a></div><div className="flex gap-2"><button onClick={() => onReviewChange(change, 'reviewed')} className="rounded-lg bg-teal px-3 py-1.5 text-[9px] font-semibold text-white">Reviewed official page</button><button onClick={() => onReviewChange(change, 'dismissed')} className="rounded-lg border px-3 py-1.5 text-[9px] font-semibold">Dismiss</button></div></div><details className="mt-3"><summary className="cursor-pointer text-[10px] font-medium text-slate-600">Compare captured page text and content hashes</summary><div className="mt-2 grid gap-2 lg:grid-cols-2"><div className="min-w-0 rounded border bg-white p-2"><div className="text-[9px] font-semibold">Previous capture Â· SHA-256 {change.oldHash ?? 'unavailable'}</div><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[9px] text-slate-600">{change.oldSnapshot ?? 'No previous text snapshot was retained for this change.'}</pre></div><div className="min-w-0 rounded border bg-white p-2"><div className="text-[9px] font-semibold">New capture Â· SHA-256 {change.newHash}</div><pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words text-[9px] text-slate-600">{change.newSnapshot ?? 'No new text snapshot was retained for this change.'}</pre></div></div></details><p className="mt-2 text-[9px] text-slate-400">Marking reviewed only closes this review item. It does not confirm deadlines, funding, or other facts.</p></article>)}</div> : <p className="mt-3 rounded-lg bg-[#faf9f6] p-4 text-center text-[10px] text-slate-500">No pending source changes. Changes are created only when a monitored pageâ€™s content hash changes.</p>}
      {pastChanges.length > 0 && <details className="mt-3"><summary className="cursor-pointer text-[10px] font-medium text-slate-500">Review history ({pastChanges.length})</summary><div className="mt-2 space-y-2">{pastChanges.map(change => <div key={change.id} className="flex flex-wrap justify-between gap-2 rounded border bg-white p-2 text-[9px] text-slate-500"><span>{change.university} Â· {change.type} Â· {change.reviewStatus}</span><span>{timestampLabel(change.detectedAt, timezone)}</span></div>)}</div></details>}
    </section>
    <section className="surface overflow-hidden rounded-xl border border-[#e7e5de] bg-white"><div className="border-b border-[#eeede8] p-4"><div className="font-display text-[12px] font-bold">Source evidence register</div></div>{all.length ? <div className="divide-y divide-[#f0efe9]">{all.map(item => <div key={item.id} className="flex flex-wrap items-start justify-between gap-3 p-4"><div className="min-w-[220px] flex-1"><div className="text-[11px] font-semibold">{item.university} <span className="font-normal text-slate-400">Â· {item.type}</span></div><a href={item.url} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[10px] text-teal hover:underline">{item.url} <ExternalLink size={10} className="inline" /></a><p className="mt-1 text-[10px] text-slate-500">{item.note}</p></div><div className="flex flex-wrap gap-2"><span className={`rounded-full border px-2 py-1 text-[9px] ${badge[item.status]}`}>{item.status}</span>{item.needsReview && <span className="rounded-full border border-[#ecd9b7] bg-[#fbf7ed] px-2 py-1 text-[9px] text-[#8a7041]">Review change</span>}<span className="rounded-full border border-[#e5e2da] px-2 py-1 text-[9px] text-slate-500">{item.intake}</span><span className={`text-[9px] ${isEvidenceStale(item.checkedAt) ? 'text-[#a65f48]' : 'text-slate-500'}`}>Checked: {timestampLabel(item.checkedAt, timezone)}{item.checkedAt && isEvidenceStale(item.checkedAt) ? ' Â· stale' : ''}</span></div></div>)}</div> : <div className="p-8 text-center text-xs text-slate-500">No source URLs tracked yet. Add an official admissions URL to a university.</div>}</section>
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-4"><div className="text-[11px] font-semibold">Review statuses</div><div className="mt-2 grid gap-2 text-[10px] text-slate-500 sm:grid-cols-2 xl:grid-cols-5">{[['Confirmed current', 'Human-reviewed and explicitly applicable to the target intake.'], ['Official, intake unconfirmed', 'Official page, but 2027 terms not confirmed.'], ['Historical', 'Prior intake evidence only; not a current promise.'], ['Estimate', 'Planning input, never represented as official.'], ['Unknown', 'Not sourced or not reviewed.']].map(([title, text]) => <div key={title} className="rounded-lg bg-[#faf9f6] p-3"><div className="font-semibold text-slate-700">{title}</div><p className="mt-1 leading-relaxed">{text}</p></div>)}</div></section>
  </div>
}

function SettingsPage({ profile, onEdit, onEditReadiness, userId, cloudReady, remindersEnabled, onReminderChange, onExport, onImport, onDeleteAccount }: {
  profile: Profile; onEdit: () => void; onEditReadiness: () => void; userId: string | null; cloudReady: boolean; remindersEnabled: boolean
  onReminderChange: (enabled: boolean) => void; onExport: () => void
  onImport: (event: React.ChangeEvent<HTMLInputElement>) => void; onDeleteAccount: () => void
}) {
  return <div className="grid gap-4 xl:grid-cols-2">
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
      <div className="flex items-start justify-between"><div><div className="font-display text-[13px] font-bold">Applicant profile</div><p className="mt-1 text-[10px] text-slate-500">Edit your personal and application assumptions.</p></div><div className="flex gap-2"><button onClick={onEdit} className="rounded-lg border px-3 py-2 text-[10px] font-semibold">Edit profile</button><button onClick={onEditReadiness} className="rounded-lg border px-3 py-2 text-[10px] font-semibold">Test & readiness</button></div></div>
      <dl className="mt-4 grid grid-cols-2 gap-3">{Object.entries(profile).map(([key, value]) => {
        const webUrl = ['portfolioUrl', 'githubUrl', 'linkedinUrl', 'cvUrl'].includes(key) ? safeHttpsUrl(value) : null
        const emailUrl = key === 'contactEmail' ? safeMailto(value) : null
        return <div key={key} className="rounded-lg bg-[#faf9f6] p-3"><dt className="text-[9px] capitalize text-slate-500">{key.replace(/[A-Z]/g, match => ` ${match}`)}</dt><dd className="mt-1 break-words text-[10px] font-semibold">
          {webUrl ? <a href={webUrl} target="_blank" rel="noreferrer" className="text-teal underline-offset-2 hover:underline">{value}</a>
            : emailUrl ? <a href={emailUrl} className="text-teal underline-offset-2 hover:underline">{value}</a> : value || '—'}
        </dd></div>
      })}</dl>
    </section>
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
      <div className="font-display text-[13px] font-bold">Workspace & refresh settings</div>
      <div className="mt-4 space-y-3">
        <SettingRow title="Workspace storage" value={userId ? cloudReady ? 'Signed-in · cloud data loaded' : 'Signed-in · cloud setup/migration needs attention' : 'Guest · browser-local, not encrypted'} />
        <SettingRow title="Timezone" value={profile.timezone} />
        <SettingRow title="Source refresh" value="Manual checks; no scheduled fetch or external opportunity feed" />
        <SettingRow title="Opportunity updates" value={userId && cloudReady ? 'Live Supabase changes while this page is open' : 'Local workspace only; sign in and configure Supabase for live sync'} />
        <SettingRow title="Currency assumption" value="One budget scenario currency; no conversion" />
        <label className="flex items-center justify-between gap-3 text-[10px] text-slate-500"><span>Browser reminders (app must remain open)</span><input type="checkbox" checked={remindersEnabled} onChange={event => onReminderChange(event.target.checked)} /></label>
      </div>
      <div className="mt-4 rounded-lg border border-[#ede8db] bg-[#fbf8f0] p-3 text-[10px] leading-relaxed text-[#827451]">Deadline and task browser notifications check while the app is open. Live opportunity alerts cover changes to records in your own Supabase account; they do not discover scholarships across the web. Source refresh is still manual, and background push or email delivery is not configured. Private documents stay in private storage for signed-in users.</div>
    </section>
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
      <div className="font-display text-[13px] font-bold">Export, restore & account controls</div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Export before restoring or deleting. Signed-in export includes cloud rows visible to your account and local checklist state; it does not include private file contents. Guest restore replaces the current guest workspace. Cloud restore must be performed manually after review.</p>
      <div className="mt-4 flex flex-wrap gap-2">
        <button onClick={onExport} className="rounded-lg bg-ink px-3 py-2 text-[10px] font-semibold text-white">Download JSON backup</button>
        {!userId && <label className="cursor-pointer rounded-lg border px-3 py-2 text-[10px] font-semibold">Restore guest backup<input type="file" accept="application/json,.json" onChange={onImport} className="sr-only" /></label>}
        {userId && <button onClick={onDeleteAccount} className="rounded-lg border border-[#e4c7bc] px-3 py-2 text-[10px] font-semibold text-[#9b5945]">Permanently delete account</button>}
      </div>
      {!userId && <p className="mt-3 text-[9px] text-slate-400">Guest records live only in this browser unless you download a backup. Clearing browser storage can permanently remove them.</p>}
    </section>
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
      <div className="font-display text-[13px] font-bold">GKS graduate scholarship · Fall 2027</div>
      <p className="mt-2 text-[10px] leading-relaxed text-slate-500">Embassy and University tracks are separate. The 2027 graduate notice, eligibility, language requirements, quotas, deadlines, and benefits must be confirmed from the official annual notice. No previous-year rules are carried forward as current terms.</p>
      <div className="mt-3 flex gap-2"><StatusPill status="unknown" /><span className="text-[10px] text-slate-500">2027 terms not confirmed by currently recorded evidence</span></div>
    </section>
  </div>
}

function UniversityDrawer({ university, documents, timezone, onClose, onUpdate, onStage }: { university: University; documents: DocumentRecord[]; timezone: string; onClose: () => void; onUpdate: (uni: University) => void; onStage: (stage: Stage) => void }) {
  const [form, setForm] = useState(university)
  const verifiedRequirementCount = (form.requirements ?? []).filter(requirement =>
    hasCurrentRequirementEvidence(requirement, form.intake)).length
  const changeEvidenceStatus = (index: number, status: Verification) => {
    setForm(current => ({ ...current, evidence: current.evidence.map((item, itemIndex) => itemIndex === index ? { ...item, status } : item) }))
  }
  return <div className="fixed inset-0 z-50 bg-[#102127]/40" onClick={onClose}>
    <aside role="dialog" aria-modal="true" aria-label={`${university.name} details`} onClick={event => event.stopPropagation()} className="surface absolute inset-y-0 right-0 w-full max-w-[520px] overflow-y-auto border-l border-[#e7e5de] bg-[#fbfaf7] p-5 shadow-2xl sm:p-7">
      <div className="flex items-start justify-between gap-4"><div><div className="mb-2 text-[9px] font-semibold uppercase tracking-[.14em] text-teal">UNIVERSITY DETAIL Â· {university.country} Â· {university.intake}</div><h2 className="font-display text-xl font-bold">{university.name}</h2><p className="mt-1 text-xs text-slate-500">{university.city} Â· {university.program}</p></div><button aria-label="Close details" onClick={onClose} className="rounded-lg p-2 hover:bg-black/5"><X size={18} /></button></div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <DetailStat label="Application stage"><select value={form.stage} onChange={event => { const value = event.target.value as Stage; setForm({ ...form, stage: value }); onStage(value) }} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-[10px]">{stageOptions.map(stage => <option key={stage}>{stage}</option>)}</select></DetailStat>
        <DetailStat label="Shortlist category"><select value={form.category} onChange={event => setForm({ ...form, category: event.target.value as Category })} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-[10px]">{categories.map(category => <option key={category}>{category}</option>)}</select></DetailStat>
        <DetailStat label="Research area"><input value={form.area} onChange={event => setForm({ ...form, area: event.target.value })} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-[10px]" /></DetailStat>
        <DetailStat label="Priority rank"><input type="number" min="1" value={form.rank} onChange={event => setForm({ ...form, rank: Number(event.target.value) })} className="mt-1 w-full rounded border bg-white px-2 py-1.5 text-[10px]" /></DetailStat>
      </div>
      <div className="mt-5"><h3 className="mb-2 text-[11px] font-semibold">Cost & funding Â· source-backed only</h3><div className="grid grid-cols-2 gap-2"><DetailStat label="Tuition / year">{form.tuition ? `â‚©${form.tuition.toLocaleString()}` : 'Unknown'}</DetailStat><DetailStat label="Monthly stipend">{form.stipend ? `â‚©${form.stipend.toLocaleString()}` : 'Unknown'}</DetailStat><DetailStat label="Coverage">{form.coverage}</DetailStat><DetailStat label="Deadline">{form.deadline ? dateLabel(form.deadline) : 'Not confirmed'}</DetailStat></div><p className="mt-2 text-[9px] text-slate-500">No confirmed intake-specific tuition, mandatory fee, funding duration, renewal rule, insurance, or housing data.</p></div>
      <ProgramReadinessEditor university={form} documents={documents} onChange={setForm} />
      <div className="mt-5"><h3 className="mb-2 text-[11px] font-semibold">Official-source evidence</h3>{form.evidence.length ? form.evidence.map((evidence, index) => <EvidenceCard key={index} evidence={evidence} timezone={timezone} onStatusChange={status => changeEvidenceStatus(index, status)} onAcknowledge={() => setForm(current => ({ ...current, evidence: current.evidence.map((item, itemIndex) => itemIndex === index ? { ...item, needsReview: false } : item) }))} />) : <p className="rounded-lg bg-white p-3 text-[10px] text-slate-500">No official source attached yet.</p>}</div>
      <div className="mt-5 grid grid-cols-2 gap-2">
        <DetailStat label="Program requirements verified">{verifiedRequirementCount} / {(form.requirements ?? []).length}</DetailStat>
        <DetailStat label="Supervisor agreement">{form.supervisorConsent ?? 'Unverified'}</DetailStat>
        <DetailStat label="Recommendations submitted">{(form.recommendations ?? []).filter(item => item.status === 'Submitted').length} / {(form.recommendations ?? []).length}</DetailStat>
        <DetailStat label="Application decision">{form.decision || 'Not received'}</DetailStat>
      </div>
      <button onClick={() => onUpdate(form)} className="mt-6 w-full rounded-lg bg-ink py-2.5 text-xs font-semibold text-white">Save research details</button>
    </aside>
  </div>
}

function ProgramReadinessEditor({ university, documents, onChange }: {
  university: University; documents: DocumentRecord[]; onChange: (university: University) => void
}) {
  const requirements = (university.requirements ?? []).map(requirement => ({ ...requirement, evidence: requirement.evidence ?? [] }))
  const recommendations = university.recommendations ?? []
  const patch = (values: Partial<University>) => onChange({ ...university, ...values })
  const updateRequirement = (id: string, values: Partial<ProgramRequirement>) =>
    patch({ requirements: requirements.map(item => item.id === id ? { ...item, ...values } : item) })
  const updateRequirementEvidence = (requirement: ProgramRequirement, id: string, values: Partial<ClaimEvidence>) =>
    updateRequirement(requirement.id, { evidence: requirement.evidence.map(item => item.id === id ? { ...item, ...values } : item) })
  const updateRecommendation = (id: string, values: Partial<RecommendationLetter>) =>
    patch({ recommendations: recommendations.map(item => item.id === id ? { ...item, ...values } : item) })
  const defaultRequirements = ['Application form', 'Degree certificate / proof of expected graduation', 'Official transcript and grading scale',
    'Statement of purpose / study plan', 'CV / resume', 'Recommendation letters', 'English-language evidence', 'Passport / identity document']
  return <section className="mt-5 space-y-4 rounded-xl border border-[#e7e5de] bg-white p-4">
    <div><h3 className="text-[11px] font-semibold">Master’s program and application requirements</h3>
      <p className="mt-1 text-[9px] leading-relaxed text-slate-500">Checklist items are planning prompts, not university rules. Set status and deadlines only after checking the official program notice.</p></div>
    <Field label="Official application portal"><input type="url" value={university.applicationPortal ?? ''} onChange={event => patch({ applicationPortal: event.target.value })} placeholder="https://..." className="input" /></Field>
    <label className="block text-[9px] font-medium text-slate-600">Supervisor agreement required
      <select className="input mt-1" value={university.supervisorConsent ?? 'Unverified'} onChange={event => patch({ supervisorConsent: event.target.value as AcceptanceStatus })}>
        {['Yes', 'No', 'Conditional', 'Unverified'].map(value => <option key={value}>{value}</option>)}
      </select>
    </label>
    <div className="grid grid-cols-2 gap-2">
      <Field label="Application submitted"><input type="date" value={university.submittedAt ?? ''} onChange={event => patch({ submittedAt: event.target.value })} className="input" /></Field>
      <Field label="Decision date"><input type="date" value={university.decisionAt ?? ''} onChange={event => patch({ decisionAt: event.target.value })} className="input" /></Field>
      <Field label="Decision / application outcome"><input value={university.decision ?? ''} onChange={event => patch({ decision: event.target.value })} placeholder="Not received" className="input" /></Field>
      <Field label="Next action"><input value={university.nextAction ?? ''} onChange={event => patch({ nextAction: event.target.value })} className="input" /></Field>
      <Field label="Application notes"><textarea value={university.applicationNotes ?? ''} onChange={event => patch({ applicationNotes: event.target.value })} rows={2} className="input" /></Field>
    </div>
    <div>
      <div className="flex items-center justify-between gap-2"><h4 className="text-[10px] font-semibold">Requirements & official deadlines</h4>
        <div className="flex gap-2">        <button type="button" onClick={() => patch({ requirements: [...requirements, { id: newId(), name: '', status: 'Unknown', progress: 'Not started', deadline: '', notes: '', evidence: [] }] })} className="rounded border px-2 py-1 text-[9px]">Add custom</button>
        <button type="button" onClick={() => patch({ requirements: [...requirements, ...defaultRequirements.filter(name => !requirements.some(item => item.name === name)).map(name => ({ id: newId(), name, status: 'Unknown' as const, progress: 'Not started' as const, deadline: '', notes: '', evidence: [] }))] })} className="rounded border px-2 py-1 text-[9px]">Add checklist prompts</button></div>
      </div>
      <div className="mt-2 space-y-2">{requirements.map(requirement => <div key={requirement.id} className="rounded-lg bg-[#faf9f6] p-2">
        <div className="grid gap-2 sm:grid-cols-2">
          <Field label="Requirement"><input value={requirement.name} onChange={event => updateRequirement(requirement.id, { name: event.target.value })} className="input" /></Field>
          <label className="block text-[9px] font-medium text-slate-600">Status<select className="input mt-1" value={requirement.status} onChange={event => updateRequirement(requirement.id, { status: event.target.value as ProgramRequirement['status'] })}>{['Required', 'Optional', 'Not required', 'Unknown'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="block text-[9px] font-medium text-slate-600">Preparation status<select className="input mt-1" value={requirement.progress ?? 'Not started'} onChange={event => updateRequirement(requirement.id, { progress: event.target.value as ProgramRequirement['progress'] })}>{['Not started', 'In progress', 'Ready', 'Not applicable'].map(value => <option key={value}>{value}</option>)}</select></label>
          <label className="block text-[9px] font-medium text-slate-600">Link applicant document<select className="input mt-1" value={requirement.documentId ?? ''} onChange={event => updateRequirement(requirement.id, { documentId: event.target.value || undefined })}><option value="">No document linked</option>{documents.map(document => <option key={document.id} value={document.id}>{document.name} · {document.status}</option>)}</select></label>
          <label className="block text-[9px] font-medium text-slate-600">Deadline (verify with official evidence)
            <input type="date" value={requirement.deadline} onChange={event => updateRequirement(requirement.id, { deadline: event.target.value })} className="input mt-1" />
            <span className="mt-1 block text-[8px] font-normal text-slate-500">{hasCurrentRequirementEvidence(requirement, university.intake) ? `Current evidence confirmed for ${university.intake}.` : `Not verified for ${university.intake}; a date alone is not official confirmation.`}</span>
          </label>
          <Field label="Notes / conditions"><input value={requirement.notes} onChange={event => updateRequirement(requirement.id, { notes: event.target.value })} className="input" /></Field>
        </div>
        <div className="mt-2 flex flex-wrap items-center justify-between gap-2"><span className="text-[8px] text-slate-500">Evidence records: {requirement.evidence.length} · this exact admission requirement</span>
          <button type="button" onClick={() => updateRequirement(requirement.id, { evidence: [...requirement.evidence, { id: newId(), fieldKey: 'admissionRequirement', url: '', quote: '', intake: university.intake, checkedAt: '', status: 'unknown' }] })} className="text-[9px] font-semibold text-teal">Add official evidence</button>
          <button type="button" onClick={() => patch({ requirements: requirements.filter(item => item.id !== requirement.id) })} className="text-[9px] text-[#9b5945]">Remove</button></div>
        {requirement.evidence.map(evidence => <div key={evidence.id} className="mt-2 grid gap-2 rounded border border-[#e7e5de] bg-white p-2 sm:grid-cols-2">
          <Field label="Official program URL"><input type="url" value={evidence.url} onChange={event => updateRequirementEvidence(requirement, evidence.id, { url: event.target.value })} className="input" /></Field>
          <Field label="Exact wording"><textarea value={evidence.quote} onChange={event => updateRequirementEvidence(requirement, evidence.id, { quote: event.target.value })} rows={2} className="input" /></Field>
          <Field label="Applicable intake"><input value={evidence.intake} onChange={event => updateRequirementEvidence(requirement, evidence.id, { intake: event.target.value })} className="input" /></Field>
          <div className="grid grid-cols-2 gap-2"><Field label="Checked date"><input type="date" value={evidence.checkedAt} onChange={event => updateRequirementEvidence(requirement, evidence.id, { checkedAt: event.target.value })} className="input" /></Field>
            <label className="block text-[9px] font-medium text-slate-600">Verification<select className="input mt-1" value={evidence.status} onChange={event => updateRequirementEvidence(requirement, evidence.id, { status: event.target.value as Verification })}>{(['unknown', 'unverified', 'confirmed', 'historical', 'estimate'] as Verification[]).map(value => <option key={value}>{value}</option>)}</select></label></div>
          <button type="button" onClick={() => updateRequirement(requirement.id, { evidence: requirement.evidence.filter(item => item.id !== evidence.id) })} className="text-left text-[9px] text-[#9b5945]">Remove evidence</button>
        </div>)}
      </div>)}
      {!requirements.length && <p className="mt-2 text-[9px] text-slate-400">No requirements recorded. Add prompts, then verify them against this program’s current official guide.</p>}</div>
    </div>
    <div>
      <div className="flex items-center justify-between"><h4 className="text-[10px] font-semibold">Recommendation-letter tracking</h4><button type="button" onClick={() => patch({ recommendations: [...recommendations, { id: newId(), recommender: '', email: '', status: 'Not identified', requestedAt: '', dueDate: '', submittedAt: '', notes: '' }] })} className="rounded border px-2 py-1 text-[9px]">Add recommender</button></div>
      <div className="mt-2 space-y-2">{recommendations.map(letter => <div key={letter.id} className="grid gap-2 rounded-lg bg-[#faf9f6] p-2 sm:grid-cols-2">
        <Field label="Recommender"><input value={letter.recommender} onChange={event => updateRecommendation(letter.id, { recommender: event.target.value })} className="input" /></Field>
        <Field label="Email (optional)"><input type="email" value={letter.email} onChange={event => updateRecommendation(letter.id, { email: event.target.value })} className="input" /></Field>
        <label className="block text-[9px] font-medium text-slate-600">Status<select className="input mt-1" value={letter.status} onChange={event => updateRecommendation(letter.id, { status: event.target.value as RecommendationLetter['status'] })}>{['Not identified', 'To request', 'Requested', 'Submitted', 'Declined', 'Unknown'].map(value => <option key={value}>{value}</option>)}</select></label>
        <Field label="Requested date"><input type="date" value={letter.requestedAt} onChange={event => updateRecommendation(letter.id, { requestedAt: event.target.value })} className="input" /></Field>
        <Field label="Deadline"><input type="date" value={letter.dueDate} onChange={event => updateRecommendation(letter.id, { dueDate: event.target.value })} className="input" /></Field>
        <Field label="Submitted date"><input type="date" value={letter.submittedAt} onChange={event => updateRecommendation(letter.id, { submittedAt: event.target.value })} className="input" /></Field>
        <Field label="Notes"><input value={letter.notes} onChange={event => updateRecommendation(letter.id, { notes: event.target.value })} className="input" /></Field>
        <button type="button" onClick={() => patch({ recommendations: recommendations.filter(item => item.id !== letter.id) })} className="self-end text-left text-[9px] text-[#9b5945]">Remove recommender</button>
      </div>)}
      {!recommendations.length && <p className="mt-2 text-[9px] text-slate-400">No recommender records yet; required count must be verified per program.</p>}</div>
    </div>
  </section>
}

function EvidenceCard({ evidence, timezone, onStatusChange, onAcknowledge }: { evidence: Evidence; timezone: string; onStatusChange: (status: Verification) => void; onAcknowledge: () => void }) {
  return <div className="mb-2 rounded-lg border border-[#e8e6df] bg-white p-3">
    <div className="flex items-center justify-between"><div className="text-[10px] font-semibold">{evidence.type}</div><select aria-label={`Verification status for ${evidence.type}`} value={evidence.status} onChange={event => onStatusChange(event.target.value as Verification)} className="rounded border px-2 py-1 text-[9px]">{(['unknown', 'unverified', 'confirmed', 'historical', 'estimate'] as Verification[]).map(status => <option key={status} value={status}>{status}</option>)}</select></div>
    <a href={safeHttpsUrl(evidence.url) ?? undefined} target="_blank" rel="noreferrer" className="mt-1 block break-all text-[9px] text-teal hover:underline">{evidence.url} <ExternalLink size={10} className="inline" /></a>
    <div className="mt-2 grid grid-cols-2 gap-1 text-[9px] text-slate-500"><span>Intake: {evidence.intake}</span><span>Published: {evidence.publishedAt ? dateLabel(evidence.publishedAt) : 'Unknown'}</span><span>Last checked: {timestampLabel(evidence.checkedAt, timezone)}</span><span>{evidence.needsReview ? 'Page changed Â· review required' : 'Change status: not reported'}</span></div>
    <p className="mt-2 text-[9px] text-slate-500">{evidence.note}</p>
    <p className="mt-1 text-[9px] text-slate-400">Confirm only after checking the official page for this program and intake. A successful fetch alone is not confirmation.</p>
    {evidence.needsReview && <button onClick={onAcknowledge} className="mt-2 rounded border border-[#eadbbd] bg-[#fbf7ed] px-2 py-1 text-[9px] font-semibold text-[#8a7041]">Acknowledge reviewed page change</button>}
  </div>
}

function Metric({ label, value, note, icon: Icon, tint, onClick }: { label: string; value: string; note: string; icon: typeof LayoutDashboard; tint: string; onClick?: () => void }) {
  const tones: Record<string, string> = { teal: 'bg-[#e8f1ec] text-[#247e77]', gold: 'bg-[#f5efe1] text-[#a18145]', rose: 'bg-[#f8eeea] text-[#b97760]', slate: 'bg-[#eef0ee] text-[#657371]' }
  const inner = <><div className="flex items-start justify-between"><span className="text-[10px] font-medium text-slate-500">{label}</span><span className={`grid h-8 w-8 place-items-center rounded-lg ${tones[tint] ?? tones.slate}`}><Icon size={15} /></span></div><div className="mt-2 font-display text-[25px] font-bold tracking-[-.04em]">{value}</div><div className="mt-1 text-[9px] text-slate-500">{note}</div></>
  return onClick ? <button onClick={onClick} className="surface rounded-xl border border-[#e7e5de] bg-white p-4 text-left transition hover:border-[#d3d9d1]">{inner}</button> : <div className="surface rounded-xl border border-[#e7e5de] bg-white p-4">{inner}</div>
}

function ReadinessItem({ label, value, complete }: { label: string; value: string; complete: boolean }) {
  return <div className="rounded-lg bg-[#faf9f6] p-3">
    <div className="flex items-center justify-between gap-2"><span className="text-[9px] font-semibold">{label}</span><span className={`rounded-full px-2 py-0.5 text-[8px] ${complete ? 'bg-[#e8f1ec] text-teal' : 'bg-[#f6f1e4] text-[#8f7543]'}`}>{complete ? 'Entered' : 'Needs entry'}</span></div>
    <div className="mt-1 break-words text-[9px] text-slate-500">{value}</div>
  </div>
}

function TaskRow({ task, timezone, onToggle }: { task: Task; timezone: string; onToggle: () => void }) {
  const isOverdue = !task.done && task.dueDate && task.dueDate < today(timezone)
  return <div className="flex items-center gap-3 px-4 py-3"><button aria-label={task.done ? `Mark ${task.title} incomplete` : `Complete ${task.title}`} onClick={onToggle} className={`grid h-[17px] w-[17px] shrink-0 place-items-center rounded border ${task.done ? 'border-teal bg-teal text-white' : 'border-[#d3d5ce] hover:border-teal'}`}>{task.done && <Check size={11} />}</button><div className="min-w-0 flex-1"><div className={`truncate text-[10px] font-medium ${task.done ? 'text-slate-400 line-through' : ''}`}>{task.title}{task.isExample && <span className="ml-2 rounded-full bg-[#f6f1e4] px-1.5 py-0.5 text-[8px] font-normal text-[#8f7543]">example</span>}</div><div className={`mt-1 text-[9px] ${isOverdue ? 'font-semibold text-rose-600' : 'text-slate-500'}`}>{task.dueDate ? `${isOverdue ? 'Overdue Â· ' : ''}${dateLabel(task.dueDate)}` : 'No due date'}</div></div><span className={`rounded-full px-2 py-1 text-[9px] ${task.priority === 'High' ? 'bg-[#faefea] text-[#a65f48]' : task.priority === 'Medium' ? 'bg-[#f6f1e4] text-[#8f7543]' : 'bg-[#f0f1ed] text-slate-500'}`}>{task.priority}</span></div>
}
function EmptyState({ icon: Icon, title, text }: { icon: typeof LayoutDashboard; title: string; text: string }) { return <div className="flex h-full min-h-[155px] flex-col items-center justify-center px-5 text-center"><span className="mb-2 grid h-9 w-9 place-items-center rounded-xl bg-[#eef3ef] text-teal"><Icon size={17} /></span><div className="text-[11px] font-semibold">{title}</div><p className="mt-1 max-w-[280px] text-[9px] leading-relaxed text-slate-500">{text}</p></div> }
function StatusPill({ status }: { status: Verification }) { return <span className={`rounded-full border px-2 py-1 text-[9px] ${badge[status]}`}>{status === 'confirmed' ? 'confirmed' : status === 'historical' ? 'historical' : status === 'estimate' ? 'estimate' : status === 'unverified' ? 'official Â· unconfirmed' : 'unknown'}</span> }
function Field({ label, children }: { label: string; children: React.ReactNode }) { return <label className="block text-[10px] font-medium text-slate-600">{label}<div className="mt-1.5">{children}</div></label> }
function Modal({ title, onClose, children, wide }: { title: string; onClose: () => void; children: React.ReactNode; wide?: boolean }) { return <div className="fixed inset-0 z-50 grid place-items-center bg-[#102127]/45 p-4" onClick={onClose}><section role="dialog" aria-modal="true" aria-label={title} onClick={event => event.stopPropagation()} className={`surface max-h-[90vh] w-full overflow-y-auto rounded-2xl border border-[#e7e5de] bg-[#fbfaf7] p-5 shadow-2xl sm:p-6 ${wide ? 'max-w-[700px]' : 'max-w-[430px]'}`}><div className="mb-5 flex items-center justify-between"><h2 className="font-display text-[16px] font-bold">{title}</h2><button aria-label="Close dialog" onClick={onClose} className="rounded-lg p-1.5 hover:bg-black/5"><X size={17} /></button></div>{children}</section></div> }
function ModalActions({ onCancel, submit, onSubmit }: { onCancel: () => void; submit: string; onSubmit?: () => void }) { return <div className="flex justify-end gap-2 pt-2"><button type="button" onClick={onCancel} className="rounded-lg border border-[#e5e3dc] px-4 py-2 text-[11px]">Cancel</button><button type={onSubmit ? 'button' : 'submit'} onClick={onSubmit} className="rounded-lg bg-ink px-4 py-2 text-[11px] font-semibold text-white">{submit}</button></div> }
function Amount({ label, value, suffix, symbol, emphasis }: { label: string; value: number; suffix?: string; symbol?: string; emphasis?: boolean }) { return <div className="rounded-lg bg-[#faf9f6] p-3"><div className="text-[9px] text-slate-500">{label}</div><div className={`mt-1 font-display text-[17px] font-bold ${emphasis ? 'text-[#a65f48]' : ''}`}>{suffix ? value : `${symbol ?? ''}${Math.round(value).toLocaleString()}`}{suffix ?? ''}</div></div> }
function DetailStat({ label, children }: { label: string; children: React.ReactNode }) { return <div className="rounded-lg border border-[#ebe9e2] bg-white p-3"><div className="text-[9px] text-slate-500">{label}</div><div className="mt-1 text-[10px] font-semibold">{children}</div></div> }
function SettingRow({ title, value }: { title: string; value: string }) { return <div className="flex justify-between gap-4 border-b border-[#f0efe9] pb-2.5"><span className="text-[10px] text-slate-500">{title}</span><span className="text-right text-[10px] font-medium">{value}</span></div> }

export default App
