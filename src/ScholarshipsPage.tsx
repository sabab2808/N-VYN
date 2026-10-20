import { useMemo, useState, type FormEvent, type ReactNode } from 'react'
import { ExternalLink, Plus, Save, X } from 'lucide-react'
import type {
  AcceptanceStatus, ClaimEvidence, EligibilityMatch, FundingComponent, FundingCoverageStatus, IntakeVerification,
  OpportunityKind, RequirementStatus, ScholarshipOpportunity, Verification,
} from './types'
import {
  compareScholarshipOpportunities as compareRank, fundingStatus, matchesScholarshipFilter as matchesFilter, tierFor,
  type ScholarshipFilterKey,
} from './lib/scholarshipLogic'
import { safeHttpsUrl } from './lib/safeUrl'

type FilterKey = ScholarshipFilterKey
const filterLabels: Record<FilterKey, string> = {
  fullFunding: 'Full funding only', ieltsFree: 'IELTS not required', moi: 'MOI accepted',
  waiver: 'English test waiver available', ieltsRequired: 'IELTS required',
  alternativeTest: 'Alternative test accepted', livingStipend: 'Living stipend confirmed',
  tuitionOnly: 'Tuition only', supervisor: 'Supervisor funding', fall2027: 'Fall 2027 officially announced',
  deadline: 'Deadline verified', suitable: 'Suitable for my academic profile',
}
const defaultFilters: Record<FilterKey, boolean> = {
  fullFunding: true, ieltsFree: true, moi: false, waiver: false, ieltsRequired: false,
  alternativeTest: false, livingStipend: false, tuitionOnly: false, supervisor: false,
  fall2027: false, deadline: false, suitable: true,
}
const filterKeys = Object.keys(filterLabels) as FilterKey[]
const fundingStatuses: FundingCoverageStatus[] = ['Confirmed', 'Not covered', 'Conditional', 'Unknown', 'Not applicable']
const acceptanceStatuses: AcceptanceStatus[] = ['Yes', 'No', 'Conditional', 'Unverified']
const requirementStatuses: RequirementStatus[] = ['Required', 'Not required', 'Conditional', 'Unknown']
const verificationStatuses: Verification[] = ['confirmed', 'unverified', 'historical', 'estimate', 'unknown']
const emptyFunding = (): FundingComponent => ({ status: 'Unknown', detail: '' })
function newRecord(): ScholarshipOpportunity {
  return {
    id: crypto.randomUUID(), kind: 'Scholarship', name: '', university: '', program: '',
    tier: 'Unassessed', eligibilityMatch: 'Not assessed', intakeVerification: 'Not yet announced',
    tuition: emptyFunding(), livingStipend: emptyFunding(), stipendSufficiency: 'Unknown', stipendAmount: '', housing: emptyFunding(),
    claimEvidence: [], applicationEvidence: [], languageEvidence: [],
    healthInsurance: emptyFunding(), airfare: emptyFunding(), mandatoryFees: emptyFunding(), upfrontCash: emptyFunding(),
    fundingConditions: '', fundingTermination: '', ieltsRequirement: 'Unknown', ieltsWaiver: 'Unverified',
    waiverProfileEligibility: 'Unverified', moiAccepted: 'Unverified', moiProfileEligibility: 'Unverified',
    moiScope: '', moiCondition: '', toeflAccepted: 'Unverified',
    otherEnglishTests: '', minimumIelts: '', alternativeMinimumScores: '', testValidity: '', testDeadline: '',
    applicationDeadline: '', sourceUrl: '', sourceQuote: '', sourceStatus: 'unknown', lastVerified: '',
    evidenceConflict: '', needsConfirmation: '', notes: '',
  }
}

export function ScholarshipsPage({ opportunities, profile, onSave, onDelete }: {
  opportunities: ScholarshipOpportunity[]
  profile: { university: string; degree: string; cgpa: string; ssc: string; hsc: string; status: string; ielts: string }
  onSave: (opportunity: ScholarshipOpportunity) => Promise<void>
  onDelete: (opportunity: ScholarshipOpportunity) => Promise<void>
}) {
  const [filters, setFilters] = useState(defaultFilters)
  const [editing, setEditing] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [error, setError] = useState('')
  const selected = filterKeys.filter(key => filters[key])
  const sorted = useMemo(() => [...opportunities].sort(compareRank), [opportunities])
  const exactMatches = sorted.filter(opportunity => selected.every(key => matchesFilter(opportunity, key)))
  const fallback = !exactMatches.length && opportunities.length > 0
  const records = fallback
    ? [...sorted].sort((a, b) => selected.filter(key => matchesFilter(b, key)).length - selected.filter(key => matchesFilter(a, key)).length || compareRank(a, b)).slice(0, 5)
    : exactMatches
  const countMatches = (item: ScholarshipOpportunity) => selected.filter(key => matchesFilter(item, key)).length

  const save = async (opportunity: ScholarshipOpportunity) => {
    setError('')
    try {
      await onSave({ ...opportunity, tier: tierFor(opportunity) })
      setCreating(false)
      setEditing(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not save the opportunity.')
    }
  }
  const remove = async (opportunity: ScholarshipOpportunity) => {
    setError('')
    try {
      await onDelete(opportunity)
      setEditing(null)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Could not delete the opportunity.')
    }
  }

  return <div className="space-y-4">
    <section className="surface rounded-xl border border-[#eadfca] bg-[#fbf7ed] p-4 text-[10px] leading-relaxed text-[#806e48]">
      <strong>Default view: verified full funding + IELTS not required + strongest profile match.</strong>
      No match is assumed from an MOI letter, university reputation, or an old intake. “Unknown” stays unknown.
      Your current profile: {profile.university}, {profile.degree}, CGPA {profile.cgpa}, SSC {profile.ssc}, HSC {profile.hsc}, {profile.status};
      IELTS status recorded as “{profile.ielts || 'not entered'}” (not independently checked, and no score is inferred).
    </section>
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div><h2 className="font-display text-[13px] font-bold">Scholarships & funding routes</h2>
          <p className="mt-1 text-[10px] text-slate-500">Separate program and award records · {opportunities.length} records · facts need official intake-specific evidence.</p></div>
        <button onClick={() => { setCreating(true); setEditing(null); setError('') }} className="rounded-lg bg-ink px-3 py-2 text-[10px] font-semibold text-white"><Plus size={13} className="mr-1 inline" />Add opportunity</button>
      </div>
      <div className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-3">
        {filterKeys.map(key => <label key={key} className="flex items-center gap-2 rounded-lg bg-[#faf9f6] px-3 py-2 text-[10px] text-slate-600">
          <input type="checkbox" checked={filters[key]} onChange={event => setFilters(current => ({ ...current, [key]: event.target.checked }))} />
          {filterLabels[key]}
        </label>)}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        <button onClick={() => setFilters(defaultFilters)} className="text-[9px] font-semibold text-teal hover:underline">Restore default filters</button>
        <button onClick={() => setFilters(Object.fromEntries(filterKeys.map(key => [key, false])) as Record<FilterKey, boolean>)} className="text-[9px] font-semibold text-teal hover:underline">Clear filters</button>
      </div>
    </section>
    {error && <div role="alert" className="rounded-lg border border-[#f0d9d2] bg-[#fff8f5] p-3 text-[10px] text-[#9b5945]">{error}</div>}
    {creating && <OpportunityEditor initial={newRecord()} onSave={save} onCancel={() => setCreating(false)} />}
    {fallback && <section className="rounded-xl border border-[#eadfca] bg-[#fbf7ed] p-4 text-[10px] leading-relaxed text-[#806e48]">
      No record satisfies every selected filter. The list below shows the closest available alternatives, with each record’s matching-filter count; it does not imply eligibility or verified funding.
    </section>}
    <section className="space-y-3">
      {!records.length && !creating && <div className="surface rounded-xl border border-[#e7e5de] bg-white p-8 text-center text-[11px] text-slate-500">No records yet. Add a university program, scholarship, RA/TA position, or supervisor funding route. Unverified records will not be presented as full funding.</div>}
      {records.map(opportunity => editing === opportunity.id
        ? <OpportunityEditor key={opportunity.id} initial={opportunity} onSave={save} onCancel={() => setEditing(null)} />
        : <OpportunityCard key={opportunity.id} opportunity={opportunity} fallback={fallback} matches={countMatches(opportunity)} onEdit={() => setEditing(opportunity.id)} onDelete={() => remove(opportunity)} />)}
    </section>
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-4">
      <h3 className="text-[11px] font-semibold">Needs confirmation from admissions / scholarship office</h3>
      <div className="mt-2 space-y-2">
        {opportunities.filter(item => item.needsConfirmation.trim()).map(item => <div key={item.id} className="rounded-lg bg-[#faf9f6] p-3 text-[10px]">
          <div className="font-semibold">{item.university || 'University not specified'} · {item.name || item.kind}</div>
          <p className="mt-1 text-slate-500">{item.needsConfirmation}</p>
        </div>)}
        {!opportunities.some(item => item.needsConfirmation.trim()) && <p className="text-[10px] text-slate-500">No confirmation questions are recorded. Add questions to an opportunity record as you research it.</p>}
      </div>
    </section>
  </div>
}

function OpportunityCard({ opportunity: item, fallback, matches, onEdit, onDelete }: {
  opportunity: ScholarshipOpportunity; fallback: boolean; matches: number; onEdit: () => void; onDelete: () => void
}) {
  const status = fundingStatus(item)
  const tier = tierFor(item)
  const fundingRows: [string, FundingComponent][] = [
    ['Full tuition', item.tuition], ['Living stipend', item.livingStipend], ['Housing', item.housing],
    ['Health insurance', item.healthInsurance], ['Airfare', item.airfare],
    ['Mandatory fees', item.mandatoryFees], ['Upfront cash before stipend', item.upfrontCash],
  ]
  return <article className="surface rounded-xl border border-[#e7e5de] bg-white p-4">
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div className="min-w-[240px] flex-1">
        <div className="flex flex-wrap gap-1.5 text-[9px]">
          <span className="rounded-full bg-[#e8f1ec] px-2 py-1 font-semibold text-teal">{tier}</span>
          <span className="rounded-full bg-[#f3f1eb] px-2 py-1 text-slate-600">{status}</span>
          <span className="rounded-full bg-[#f3f1eb] px-2 py-1 text-slate-600">{item.kind}</span>
          {fallback && <span className="rounded-full bg-[#fbf7ed] px-2 py-1 text-[#806e48]">Matches {matches} selected filters</span>}
        </div>
        <h3 className="mt-2 font-display text-[13px] font-bold">{item.name || 'Untitled opportunity'}</h3>
        <p className="mt-1 text-[10px] text-slate-500">{item.university || 'University not specified'} · {item.program || 'Program not specified'} · {item.intakeVerification}</p>
      </div>
      <div className="flex gap-2">
        <button onClick={onEdit} className="rounded-lg border px-3 py-1.5 text-[9px] font-semibold">Edit</button>
        <button onClick={onDelete} className="rounded-lg border border-[#ead9d2] px-3 py-1.5 text-[9px] font-semibold text-[#9b5945]">Delete</button>
      </div>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg bg-[#faf9f6] p-3">
        <div className="text-[10px] font-semibold">Language requirements</div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-slate-500">
          <Fact label="IELTS" value={item.ieltsRequirement} /><Fact label="IELTS waiver" value={item.ieltsWaiver} />
          <Fact label="DIU documents meet waiver condition" value={item.waiverProfileEligibility} />
          <Fact label="MOI accepted" value={item.moiAccepted} /><Fact label="DIU documents meet MOI condition" value={item.moiProfileEligibility} />
          <Fact label="MOI scope" value={item.moiScope || 'Unknown'} />
          <Fact label="TOEFL" value={item.toeflAccepted} /><Fact label="Other tests" value={item.otherEnglishTests || 'Unknown'} />
          <Fact label="Minimum IELTS" value={item.minimumIelts || 'Unknown'} /><Fact label="Alternative minimums" value={item.alternativeMinimumScores || 'Unknown'} />
          <Fact label="Validity" value={item.testValidity || 'Unknown'} /><Fact label="Test deadline" value={item.testDeadline || 'Unknown'} />
        </dl>
        {item.moiCondition && <p className="mt-2 text-[9px] text-slate-500">MOI condition: {item.moiCondition}</p>}
      </div>
      <div className="rounded-lg bg-[#faf9f6] p-3">
        <div className="text-[10px] font-semibold">Funding completeness</div>
        <dl className="mt-2 grid grid-cols-2 gap-x-3 gap-y-1 text-[9px] text-slate-500">{fundingRows.map(([label, component]) =>
          <Fact key={label} label={label} value={`${component.status}${component.detail ? ` · ${component.detail}` : ''}`} />)}
          <Fact label="Stipend sufficiency" value={item.stipendSufficiency} />
          <Fact label="Stipend amount" value={item.stipendAmount || 'Unknown'} />
        </dl>
        <div className="mt-2 text-[9px] text-slate-500">Funding conditions: {item.fundingConditions || 'Not recorded'}<br />Conditions that can terminate funding: {item.fundingTermination || 'Not recorded'}</div>
      </div>
    </div>
    <div className="mt-3 rounded-lg border border-[#eeede8] p-3">
      <div className="text-[10px] font-semibold">Claim-level official evidence</div>
      <p className="mt-1 text-[9px] text-slate-500">A source is attached to individual facts; checking a page is not verification. Confirm the exact program, applicant category, and Fall 2027 intake before marking a claim confirmed.</p>
      <div className="mt-2 grid gap-2 sm:grid-cols-2">{[...item.claimEvidence, ...item.languageEvidence, ...(item.applicationEvidence ?? [])].map(evidence =>
        <div key={`${evidence.fieldKey}-${evidence.id}`} className="rounded-lg bg-[#faf9f6] p-2 text-[9px]">
          <div className="font-semibold">{evidence.fieldKey} · {evidence.status} · {evidence.intake} · checked {evidence.checkedAt || 'unknown'}</div>
          <a href={safeHttpsUrl(evidence.url) ?? undefined} target="_blank" rel="noreferrer" className="mt-1 block break-all text-teal hover:underline">{evidence.url}</a>
          <blockquote className="mt-1 whitespace-pre-wrap text-slate-500">{evidence.quote}</blockquote>
        </div>)}
        {!item.claimEvidence.length && !item.languageEvidence.length && !(item.applicationEvidence ?? []).length && <p className="text-[9px] text-slate-400">No claim-level evidence recorded.</p>}
      </div>
    </div>
    <div className="mt-3 grid gap-3 sm:grid-cols-2">
      <div className="rounded-lg border border-[#eeede8] p-3 text-[9px] text-slate-500">
        <div className="font-semibold text-slate-700">Verification & deadlines</div>
        <p className="mt-1">Eligibility match: {item.eligibilityMatch} · Application deadline: {item.applicationDeadline || 'Not entered'} ({matchesFilter(item, 'deadline') ? 'verified' : 'unverified'}) · Intake: {item.intakeVerification}</p>
        <p className="mt-1">Official evidence: {item.sourceStatus} · Last verified: {item.lastVerified || 'Not recorded'}</p>
        <p className="mt-1">Conflicting sources: {item.evidenceConflict || 'None reported'}</p>
        {item.sourceUrl && <a href={safeHttpsUrl(item.sourceUrl) ?? undefined} target="_blank" rel="noreferrer" className="mt-2 block break-all text-teal hover:underline">{item.sourceUrl} <ExternalLink size={10} className="inline" /></a>}
      </div>
      <div className="rounded-lg border border-[#eeede8] p-3 text-[9px] text-slate-500">
        <div className="font-semibold text-slate-700">Official wording</div>
        <blockquote className="mt-1 whitespace-pre-wrap">{item.sourceQuote || 'No quotation recorded. Do not treat this record as verified.'}</blockquote>
        {item.needsConfirmation && <p className="mt-2">Admissions-office follow-up: {item.needsConfirmation}</p>}
      </div>
    </div>
    {item.notes && <p className="mt-2 text-[9px] text-slate-500">{item.notes}</p>}
  </article>
}

function Fact({ label, value }: { label: string; value: string }) {
  return <div><dt className="text-slate-400">{label}</dt><dd className="break-words font-medium text-slate-600">{value}</dd></div>
}

function OpportunityEditor({ initial, onSave, onCancel }: {
  initial: ScholarshipOpportunity; onSave: (item: ScholarshipOpportunity) => Promise<void>; onCancel: () => void
}) {
  const [form, setForm] = useState(initial)
  const [saving, setSaving] = useState(false)
  const change = <K extends keyof ScholarshipOpportunity>(key: K, value: ScholarshipOpportunity[K]) =>
    setForm(current => ({ ...current, [key]: value }))
  const component = (key: 'tuition' | 'livingStipend' | 'housing' | 'healthInsurance' | 'airfare' | 'mandatoryFees' | 'upfrontCash', value: FundingComponent) =>
    setForm(current => ({ ...current, [key]: value }))
  const evidenceKey = (group: 'funding' | 'language' | 'application') =>
    group === 'funding' ? 'claimEvidence' : group === 'language' ? 'languageEvidence' : 'applicationEvidence'
  const evidenceFor = (item: ScholarshipOpportunity, group: 'funding' | 'language' | 'application') =>
    item[evidenceKey(group)] ?? []
  const updateClaimEvidence = (group: 'funding' | 'language' | 'application', id: string, value: ClaimEvidence) =>
    setForm(current => ({ ...current, [evidenceKey(group)]: evidenceFor(current, group).map(item => item.id === id ? value : item) }))
  const addClaimEvidence = (group: 'funding' | 'language' | 'application') => {
    const evidence: ClaimEvidence = { id: crypto.randomUUID(), fieldKey: group === 'application' ? 'applicationDeadline' : '', url: '', quote: '', intake: 'Fall 2027', checkedAt: '', status: 'unknown' }
    setForm(current => ({ ...current, [evidenceKey(group)]: [...evidenceFor(current, group), evidence] }))
  }
  const deleteClaimEvidence = (group: 'funding' | 'language' | 'application', id: string) =>
    setForm(current => ({ ...current, [evidenceKey(group)]: evidenceFor(current, group).filter(item => item.id !== id) }))
  const submit = async (event: FormEvent) => {
    event.preventDefault()
    setSaving(true)
    try { await onSave(form) } finally { setSaving(false) }
  }
  return <form onSubmit={submit} className="surface space-y-4 rounded-xl border border-[#dfe7e1] bg-white p-4">
    <div className="flex items-center justify-between"><h3 className="font-display text-[12px] font-bold">{initial.name ? 'Edit opportunity record' : 'Add opportunity record'}</h3><button type="button" onClick={onCancel} aria-label="Cancel editing"><X size={15} /></button></div>
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Opportunity / program name" value={form.name} onChange={value => change('name', value)} required />
      <SelectField label="Record type" value={form.kind} options={['University program', 'Scholarship', 'RA/TA', 'Supervisor grant', 'University award']} onChange={value => change('kind', value as OpportunityKind)} />
      <TextField label="University" value={form.university} onChange={value => change('university', value)} required />
      <TextField label="Program / department" value={form.program} onChange={value => change('program', value)} />
      <SelectField label="Eligibility match for my profile" value={form.eligibilityMatch} options={['Strong', 'Possible', 'Unclear', 'Not assessed']} onChange={value => change('eligibilityMatch', value as EligibilityMatch)} />
      <SelectField label="Intake verification" value={form.intakeVerification} options={['Fall 2027 verified', 'Historical intake only', 'Not yet announced']} onChange={value => change('intakeVerification', value as IntakeVerification)} />
    </div>
    <div><h4 className="mb-2 text-[10px] font-semibold">Funding components · record the source-backed coverage and amount/condition</h4>
      <div className="grid gap-2 sm:grid-cols-2">{([
        ['tuition', 'Full tuition'], ['livingStipend', 'Living stipend'], ['housing', 'Housing / dormitory'],
        ['healthInsurance', 'Health insurance'], ['airfare', 'Airfare'], ['mandatoryFees', 'Other mandatory fees'],
        ['upfrontCash', 'Upfront cash required before first stipend'],
      ] as const).map(([key, label]) => <FundingEditor key={key} label={label} value={form[key]} onChange={value => component(key, value)} />)}</div>
      <p className="mt-2 text-[9px] text-slate-500">For upfront cash, “Confirmed” means no uncovered cash is needed before the first stipend (or that it is covered); enter any required amount and conditions in the detail field.</p>
    </div>
    <ClaimEvidenceEditor title="Funding and cost evidence" entries={form.claimEvidence} onAdd={() => addClaimEvidence('funding')}
      onChange={(id, value) => updateClaimEvidence('funding', id, value)} onDelete={id => deleteClaimEvidence('funding', id)}
      fields={['tuition', 'livingStipend', 'stipendSufficiency', 'housing', 'healthInsurance', 'airfare', 'mandatoryFees', 'upfrontCash', 'fundingConditions']} />
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Monthly stipend amount / currency" value={form.stipendAmount} onChange={value => change('stipendAmount', value)} />
      <SelectField label="Officially enough to contribute to living expenses?" value={form.stipendSufficiency} options={fundingStatuses} onChange={value => change('stipendSufficiency', value as FundingCoverageStatus)} />
      <TextField label="Funding conditions (admission, separate application, grades, employment)" value={form.fundingConditions} onChange={value => change('fundingConditions', value)} />
      <TextField label="Conditions that can terminate funding" value={form.fundingTermination} onChange={value => change('fundingTermination', value)} />
      <SelectField label="IELTS requirement" value={form.ieltsRequirement} options={requirementStatuses} onChange={value => change('ieltsRequirement', value as RequirementStatus)} />
      <SelectField label="IELTS waiver available" value={form.ieltsWaiver} options={acceptanceStatuses} onChange={value => change('ieltsWaiver', value as AcceptanceStatus)} />
      <SelectField label="Do I meet the IELTS-waiver condition?" value={form.waiverProfileEligibility} options={acceptanceStatuses} onChange={value => change('waiverProfileEligibility', value as AcceptanceStatus)} />
      <SelectField label="MOI accepted" value={form.moiAccepted} options={acceptanceStatuses} onChange={value => change('moiAccepted', value as AcceptanceStatus)} />
      <SelectField label="Do my DIU documents meet the MOI condition?" value={form.moiProfileEligibility} options={acceptanceStatuses} onChange={value => change('moiProfileEligibility', value as AcceptanceStatus)} />
      <TextField label="MOI accepted for admission, scholarship, or both" value={form.moiScope} onChange={value => change('moiScope', value)} />
      <TextField label="Exact MOI / waiver eligibility condition" value={form.moiCondition} onChange={value => change('moiCondition', value)} />
      <SelectField label="TOEFL accepted" value={form.toeflAccepted} options={acceptanceStatuses} onChange={value => change('toeflAccepted', value as AcceptanceStatus)} />
      <TextField label="Other accepted English tests" value={form.otherEnglishTests} onChange={value => change('otherEnglishTests', value)} />
      <TextField label="Minimum IELTS score" value={form.minimumIelts} onChange={value => change('minimumIelts', value)} />
      <TextField label="Minimum alternative test scores" value={form.alternativeMinimumScores} onChange={value => change('alternativeMinimumScores', value)} />
      <TextField label="Test validity rules" value={form.testValidity} onChange={value => change('testValidity', value)} />
      <TextField label="Language-test submission deadline" value={form.testDeadline} onChange={value => change('testDeadline', value)} />
      <TextField label="Application deadline (only enter after verification)" value={form.applicationDeadline} onChange={value => change('applicationDeadline', value)} />
    </div>
    <ClaimEvidenceEditor title="English-language requirement evidence" entries={form.languageEvidence} onAdd={() => addClaimEvidence('language')}
      onChange={(id, value) => updateClaimEvidence('language', id, value)} onDelete={id => deleteClaimEvidence('language', id)}
      fields={['ieltsRequirement', 'ieltsWaiver', 'moiAccepted', 'toeflAccepted', 'otherEnglishTests', 'minimumIelts', 'alternativeMinimumScores', 'testValidity', 'testDeadline']} />
    <ClaimEvidenceEditor title="Application-deadline evidence" entries={form.applicationEvidence ?? []} onAdd={() => addClaimEvidence('application')}
      onChange={(id, value) => updateClaimEvidence('application', id, value)} onDelete={id => deleteClaimEvidence('application', id)}
      fields={['applicationDeadline']} />
    <div className="grid gap-3 sm:grid-cols-2">
      <TextField label="Official evidence URL" value={form.sourceUrl} onChange={value => change('sourceUrl', value)} />
      <SelectField label="Source verification" value={form.sourceStatus} options={verificationStatuses} onChange={value => change('sourceStatus', value as Verification)} />
      <TextField label="Exact quotation / relevant official wording" value={form.sourceQuote} onChange={value => change('sourceQuote', value)} multiline />
      <TextField label="Last verified date (YYYY-MM-DD)" value={form.lastVerified} onChange={value => change('lastVerified', value)} />
      <TextField label="Conflicting source information" value={form.evidenceConflict} onChange={value => change('evidenceConflict', value)} multiline />
      <TextField label="Needs confirmation from admissions office" value={form.needsConfirmation} onChange={value => change('needsConfirmation', value)} multiline />
      <TextField label="Notes" value={form.notes} onChange={value => change('notes', value)} multiline />
    </div>
    <p className="rounded-lg bg-[#faf9f6] p-3 text-[9px] leading-relaxed text-slate-500">Funding tiers and status are calculated conservatively. “Verified full funding” requires every applicable cost component, official source wording, explicit confirmation for Fall 2027, and a confirmed source status. IELTS waiver and MOI acceptance remain separate fields; an MOI alone is not treated as a waiver.</p>
    <div className="flex justify-end gap-2"><button type="button" onClick={onCancel} className="rounded-lg border px-3 py-2 text-[10px]">Cancel</button><button disabled={saving} className="rounded-lg bg-ink px-3 py-2 text-[10px] font-semibold text-white disabled:opacity-50"><Save size={12} className="mr-1 inline" />{saving ? 'Saving…' : 'Save record'}</button></div>
  </form>
}

function FundingEditor({ label, value, onChange }: { label: string; value: FundingComponent; onChange: (value: FundingComponent) => void }) {
  return <label className="block rounded-lg bg-[#faf9f6] p-2 text-[9px] font-medium text-slate-600">
    {label}
    <select value={value.status} onChange={event => onChange({ ...value, status: event.target.value as FundingCoverageStatus })} className="input mt-1">
      {fundingStatuses.map(status => <option key={status}>{status}</option>)}
    </select>
    <input value={value.detail} onChange={event => onChange({ ...value, detail: event.target.value })} className="input mt-1" placeholder="Amount, period, condition, or proof" />
  </label>
}

function ClaimEvidenceEditor({ title, fields, entries, onAdd, onChange, onDelete }: {
  title: string; fields: string[]; entries: ClaimEvidence[]; onAdd: () => void
  onChange: (id: string, value: ClaimEvidence) => void; onDelete: (id: string) => void
}) {
  return <section className="rounded-lg border border-[#e7e5de] p-3">
    <div className="flex items-center justify-between gap-2"><h4 className="text-[10px] font-semibold">{title}</h4>
      <button type="button" onClick={onAdd} className="rounded border px-2 py-1 text-[9px] font-semibold"><Plus size={10} className="mr-1 inline" />Add evidence</button></div>
    <div className="mt-2 space-y-2">{entries.map(entry => <div key={entry.id} className="grid gap-2 rounded-lg bg-[#faf9f6] p-2 sm:grid-cols-2">
      <SelectField label="Claim field" value={entry.fieldKey} options={['', ...fields]} onChange={value => onChange(entry.id, { ...entry, fieldKey: value })} />
      <TextField label="Official URL (https)" value={entry.url} onChange={value => onChange(entry.id, { ...entry, url: value })} />
      <TextField label="Exact relevant quotation" value={entry.quote} onChange={value => onChange(entry.id, { ...entry, quote: value })} multiline />
      <div className="grid grid-cols-2 gap-2">
        <TextField label="Applicable intake" value={entry.intake} onChange={value => onChange(entry.id, { ...entry, intake: value })} />
        <TextField label="Checked date (YYYY-MM-DD)" value={entry.checkedAt} onChange={value => onChange(entry.id, { ...entry, checkedAt: value })} />
        <SelectField label="Human verification" value={entry.status} options={verificationStatuses} onChange={value => onChange(entry.id, { ...entry, status: value as Verification })} />
        <button type="button" onClick={() => onDelete(entry.id)} className="self-end rounded border border-[#ead9d2] px-2 py-1.5 text-[9px] text-[#9b5945]">Remove evidence</button>
      </div>
    </div>)}
    {!entries.length && <p className="mt-2 text-[9px] text-slate-400">No claim evidence yet.</p>}</div>
  </section>
}

function TextField({ label, value, onChange, required = false, multiline = false }: {
  label: string; value: string; onChange: (value: string) => void; required?: boolean; multiline?: boolean
}) {
  const control: ReactNode = multiline
    ? <textarea value={value} onChange={event => onChange(event.target.value)} required={required} rows={2} className="input mt-1 resize-y" />
    : <input value={value} onChange={event => onChange(event.target.value)} required={required} className="input mt-1" />
  return <label className="block text-[9px] font-medium text-slate-600">{label}{control}</label>
}

function SelectField<T extends string>({ label, value, options, onChange }: {
  label: string; value: T; options: readonly T[]; onChange: (value: string) => void
}) {
  return <label className="block text-[9px] font-medium text-slate-600">{label}
    <select value={value} onChange={event => onChange(event.target.value)} className="input mt-1">{options.map(option => <option key={option}>{option}</option>)}</select>
  </label>
}
