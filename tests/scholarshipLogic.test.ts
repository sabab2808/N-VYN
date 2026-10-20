import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { ClaimEvidence, FundingComponent, ScholarshipOpportunity } from '../src/types'
import { fundingStatus, matchesScholarshipFilter, rankScholarshipOpportunities, tierFor } from '../src/lib/scholarshipLogic'
import { isValidBudgetBackup, isValidDocumentsBackup, isValidProfessorContactsBackup, isValidWorkspaceBackup } from '../src/lib/backupValidation'
import { safeHttpsUrl, safeMailto } from '../src/lib/safeUrl'
import { initialWorkspace } from '../src/data'

const confirmed: FundingComponent = { status: 'Confirmed', detail: 'Confirmed by official source' }
const notApplicable: FundingComponent = { status: 'Not applicable', detail: 'Not provided for this award' }

function evidence(fieldKey: string, status: ClaimEvidence['status'] = 'confirmed', intake = 'Fall 2027'): ClaimEvidence {
  return {
    id: fieldKey, fieldKey, url: 'https://university.example/admissions',
    quote: `Official wording for ${fieldKey}`, intake, checkedAt: '2026-10-20', status,
  }
}

function fundedOpportunity(): ScholarshipOpportunity {
  const claimEvidence = ['tuition', 'livingStipend', 'stipendSufficiency', 'housing', 'healthInsurance',
    'airfare', 'mandatoryFees', 'upfrontCash'].map(field => evidence(field))
  return {
    id: 'opportunity-1', kind: 'Scholarship', name: 'Graduate award', university: 'Example University',
    program: 'Computer Science', tier: 'Unassessed', eligibilityMatch: 'Strong',
    intakeVerification: 'Fall 2027 verified', tuition: confirmed, livingStipend: confirmed,
    stipendSufficiency: 'Confirmed', claimEvidence, stipendAmount: 'Monthly stipend',
    applicationEvidence: [], housing: notApplicable, healthInsurance: confirmed, airfare: notApplicable,
    mandatoryFees: confirmed, upfrontCash: confirmed, fundingConditions: '', fundingTermination: '',
    ieltsRequirement: 'Not required', languageEvidence: [evidence('ieltsRequirement')],
    ieltsWaiver: 'Unverified', waiverProfileEligibility: 'Unverified', moiAccepted: 'Unverified',
    moiProfileEligibility: 'Unverified', moiScope: '', moiCondition: '', toeflAccepted: 'Unverified',
    otherEnglishTests: '', minimumIelts: '', alternativeMinimumScores: '', testValidity: '', testDeadline: '',
    applicationDeadline: '', sourceUrl: 'https://university.example/admissions',
    sourceQuote: 'Official source quotation', sourceStatus: 'confirmed', lastVerified: '2026-10-20',
    evidenceConflict: '', needsConfirmation: '', notes: '',
  }
}

describe('scholarship funding and language ranking', () => {
  beforeEach(() => {
    vi.useFakeTimers()
    vi.setSystemTime(new Date('2026-10-20T12:00:00Z'))
  })
  afterEach(() => vi.useRealTimers())

  it('requires current Fall 2027 evidence for verified full funding and Tier 1', () => {
    const item = fundedOpportunity()
    expect(fundingStatus(item)).toBe('Verified full funding')
    expect(tierFor(item)).toBe('Tier 1')
    expect(matchesScholarshipFilter(item, 'ieltsFree')).toBe(true)
  })

  it('does not accept stale or non-Fall-2027 evidence as verified', () => {
    const stale = fundedOpportunity()
    stale.claimEvidence = stale.claimEvidence.map(item => ({ ...item, checkedAt: '2026-07-01' }))
    expect(fundingStatus(stale)).toBe('Likely full funding — conditions to confirm')
    expect(tierFor(stale)).not.toBe('Tier 1')

    const historical = fundedOpportunity()
    historical.claimEvidence = historical.claimEvidence.map(item => ({ ...item, intake: 'Fall 2026' }))
    expect(fundingStatus(historical)).toBe('Likely full funding — conditions to confirm')
  })

  it('does not treat an MOI record as a waiver unless the applicant condition is confirmed', () => {
    const item = fundedOpportunity()
    item.ieltsRequirement = 'Unknown'
    item.languageEvidence = [evidence('moiAccepted')]
    item.moiAccepted = 'Yes'
    item.moiProfileEligibility = 'Unverified'
    expect(tierFor(item)).not.toBe('Tier 2')

    item.moiProfileEligibility = 'Yes'
    expect(tierFor(item)).toBe('Tier 2')
  })

  it('requires separate current intake evidence for an application deadline', () => {
    const item = fundedOpportunity()
    item.applicationDeadline = '2027-03-01'
    expect(matchesScholarshipFilter(item, 'deadline')).toBe(false)
    item.applicationEvidence = [evidence('applicationDeadline')]
    expect(matchesScholarshipFilter(item, 'deadline')).toBe(true)
    item.applicationEvidence = [evidence('applicationDeadline', 'confirmed', 'Fall 2026')]
    expect(matchesScholarshipFilter(item, 'deadline')).toBe(false)
  })

  it('ranks IELTS-free verified full funding ahead of conditional MOI paths', () => {
    const ieltsFree = fundedOpportunity()
    const moiRoute = fundedOpportunity()
    moiRoute.id = 'opportunity-2'
    moiRoute.name = 'MOI route'
    moiRoute.ieltsRequirement = 'Unknown'
    moiRoute.languageEvidence = [evidence('moiAccepted')]
    moiRoute.moiAccepted = 'Yes'
    moiRoute.moiProfileEligibility = 'Yes'
    expect(rankScholarshipOpportunities([moiRoute, ieltsFree]).map(item => item.id))
      .toEqual(['opportunity-1', 'opportunity-2'])
  })
})

describe('backup validation', () => {
  it('accepts a complete workspace with valid funding and profile structures', () => {
    expect(isValidWorkspaceBackup(structuredClone(initialWorkspace))).toBe(true)
  })

  it('rejects malformed nested opportunity records instead of restoring them', () => {
    const workspace = JSON.parse(JSON.stringify(initialWorkspace)) as {
      opportunities: Array<Record<string, unknown>>
    }
    workspace.opportunities[0].tuition = null
    expect(isValidWorkspaceBackup(workspace)).toBe(false)
  })

  it('validates budget, document, and professor contact records', () => {
    expect(isValidBudgetBackup({
      currency: 'BDT', monthlyLiving: '', annualTuition: '', travel: '', fees: '', insurance: '', guaranteedMonthly: '',
    })).toBe(true)
    expect(isValidBudgetBackup({ currency: 'USD' })).toBe(false)
    expect(isValidDocumentsBackup([{ id: 'doc', name: 'Passport', type: 'Identity', issued: '', expiry: '',
      status: 'Available', translation: 'Not reviewed', notarization: 'Not reviewed', apostille: 'Not reviewed' }])).toBe(true)
    expect(isValidDocumentsBackup([{ id: 'doc' }])).toBe(false)
    expect(isValidProfessorContactsBackup([{ id: 'contact', professor: '', lab: '', email: '', contacted: '',
      followUp: '', fit: '', papers: '', notes: '', funding: '', nextAction: '' }])).toBe(true)
  })
})

describe('external link validation', () => {
  it('only enables secure web URLs and well-formed email links', () => {
    expect(safeHttpsUrl('https://example.edu/admissions')).toBe('https://example.edu/admissions')
    expect(safeHttpsUrl('javascript:alert(1)')).toBeNull()
    expect(safeHttpsUrl('http://example.edu')).toBeNull()
    expect(safeHttpsUrl('https://user:password@example.edu')).toBeNull()
    expect(safeMailto('admissions@example.edu')).toBe('mailto:admissions@example.edu')
    expect(safeMailto('attacker@example.edu%0d%0a')).toBeNull()
  })
})
