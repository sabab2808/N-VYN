import type {
  EligibilityMatch, FundingComponent, IntakeVerification, OpportunityTier,
  ScholarshipOpportunity, Verification,
} from '../types'

export type ScholarshipFilterKey = 'fullFunding' | 'ieltsFree' | 'moi' | 'waiver' | 'ieltsRequired' |
  'alternativeTest' | 'livingStipend' | 'tuitionOnly' | 'supervisor' | 'fall2027' | 'deadline' | 'suitable'

export function freshVerifiedEvidence(evidence: ScholarshipOpportunity['claimEvidence']) {
  return evidence.some(item => {
    const checked = new Date(`${item.checkedAt}T00:00:00Z`).getTime()
    return item.status === 'confirmed' && item.intake === 'Fall 2027' && item.url.startsWith('https://') &&
      item.quote.trim().length > 0 && Number.isFinite(checked) && checked <= Date.now() &&
      Date.now() - checked <= 90 * 24 * 60 * 60 * 1000
  })
}

const languageEvidenceConfirmed = (item: ScholarshipOpportunity, fields: string[]) =>
  fields.some(field => freshVerifiedEvidence(item.languageEvidence.filter(evidence => evidence.fieldKey === field)))

const applicationDeadlineConfirmed = (opportunity: ScholarshipOpportunity) =>
  (opportunity.applicationEvidence ?? []).some(evidence => evidence.fieldKey === 'applicationDeadline' &&
    freshVerifiedEvidence([evidence]))

export function fundingStatus(opportunity: ScholarshipOpportunity) {
  const core = [opportunity.tuition, opportunity.livingStipend, opportunity.mandatoryFees, opportunity.upfrontCash]
  const complete = [opportunity.tuition, opportunity.livingStipend, opportunity.housing, opportunity.healthInsurance,
    opportunity.airfare, opportunity.mandatoryFees, opportunity.upfrontCash]
  const covered = (item: FundingComponent) => item.status === 'Confirmed'
  const completeOrNotApplicable = (item: FundingComponent) => item.status === 'Confirmed' || item.status === 'Not applicable'
  const fundingKeys = ['tuition', 'livingStipend', 'stipendSufficiency', 'housing', 'healthInsurance', 'airfare', 'mandatoryFees', 'upfrontCash']
  const evidenceComplete = opportunity.intakeVerification === 'Fall 2027 verified' &&
    fundingKeys.every(key => freshVerifiedEvidence(opportunity.claimEvidence.filter(item => item.fieldKey === key)))
  const sourceBundleComplete = opportunity.sourceStatus === 'confirmed' && opportunity.sourceUrl.startsWith('https://') &&
    opportunity.sourceQuote.trim() !== '' && freshVerifiedEvidence(opportunity.claimEvidence)
  if (complete.every(completeOrNotApplicable) && core.every(covered) &&
    opportunity.stipendSufficiency === 'Confirmed' && evidenceComplete && sourceBundleComplete)
    return 'Verified full funding'
  if (covered(opportunity.tuition) && covered(opportunity.livingStipend))
    return 'Likely full funding — conditions to confirm'
  if (covered(opportunity.tuition) && !covered(opportunity.livingStipend))
    return 'Tuition fully funded, living expenses not confirmed'
  if (complete.some(item => item.status === 'Not covered' || item.status === 'Conditional'))
    return opportunity.tuition.status === 'Not covered' && opportunity.livingStipend.status === 'Not covered' &&
      complete.every(item => item.status === 'Not covered' || item.status === 'Not applicable')
      ? 'Unfunded' : 'Partial funding'
  if (complete.some(covered)) return 'Partial funding'
  return 'Unknown'
}

export function tierFor(opportunity: ScholarshipOpportunity): OpportunityTier {
  const status = fundingStatus(opportunity)
  if (status === 'Verified full funding') {
    if (opportunity.ieltsRequirement === 'Not required' && languageEvidenceConfirmed(opportunity, ['ieltsRequirement'])) return 'Tier 1'
    if ((opportunity.ieltsWaiver === 'Yes' && opportunity.waiverProfileEligibility === 'Yes' &&
      languageEvidenceConfirmed(opportunity, ['ieltsWaiver'])) ||
      (opportunity.moiAccepted === 'Yes' && opportunity.moiProfileEligibility === 'Yes' &&
        languageEvidenceConfirmed(opportunity, ['moiAccepted']))) return 'Tier 2'
    if (opportunity.ieltsRequirement === 'Required' && languageEvidenceConfirmed(opportunity, ['ieltsRequirement'])) return 'Tier 3'
  }
  if (opportunity.kind === 'RA/TA' || opportunity.kind === 'Supervisor grant') return 'Tier 4'
  if (status === 'Partial funding' || status === 'Tuition fully funded, living expenses not confirmed' || status === 'Unfunded')
    return 'Tier 5'
  return 'Unassessed'
}

export function matchesScholarshipFilter(opportunity: ScholarshipOpportunity, key: ScholarshipFilterKey) {
  const status = fundingStatus(opportunity)
  switch (key) {
    case 'fullFunding': return status === 'Verified full funding'
    case 'ieltsFree': return opportunity.ieltsRequirement === 'Not required' && languageEvidenceConfirmed(opportunity, ['ieltsRequirement'])
    case 'moi': return opportunity.moiAccepted === 'Yes' && languageEvidenceConfirmed(opportunity, ['moiAccepted'])
    case 'waiver': return opportunity.ieltsWaiver === 'Yes' && languageEvidenceConfirmed(opportunity, ['ieltsWaiver'])
    case 'ieltsRequired': return opportunity.ieltsRequirement === 'Required' && languageEvidenceConfirmed(opportunity, ['ieltsRequirement'])
    case 'alternativeTest': return (opportunity.toeflAccepted === 'Yes' && languageEvidenceConfirmed(opportunity, ['toeflAccepted'])) ||
      (Boolean(opportunity.otherEnglishTests.trim()) && languageEvidenceConfirmed(opportunity, ['otherEnglishTests']))
    case 'livingStipend': return opportunity.livingStipend.status === 'Confirmed'
    case 'tuitionOnly': return status === 'Tuition fully funded, living expenses not confirmed'
    case 'supervisor': return opportunity.kind === 'RA/TA' || opportunity.kind === 'Supervisor grant'
    case 'fall2027': return opportunity.intakeVerification === 'Fall 2027 verified'
    case 'deadline': return Boolean(opportunity.applicationDeadline && opportunity.intakeVerification === 'Fall 2027 verified' &&
      applicationDeadlineConfirmed(opportunity))
    case 'suitable': return opportunity.eligibilityMatch === 'Strong'
  }
}

export function compareScholarshipOpportunities(a: ScholarshipOpportunity, b: ScholarshipOpportunity) {
  const order: OpportunityTier[] = ['Tier 1', 'Tier 2', 'Tier 3', 'Tier 4', 'Tier 5', 'Unassessed']
  const tierDifference = order.indexOf(tierFor(a)) - order.indexOf(tierFor(b))
  if (tierDifference) return tierDifference
  const matchOrder: EligibilityMatch[] = ['Strong', 'Possible', 'Unclear', 'Not assessed']
  const matchDifference = matchOrder.indexOf(a.eligibilityMatch) - matchOrder.indexOf(b.eligibilityMatch)
  if (matchDifference) return matchDifference
  const completeness = (item: ScholarshipOpportunity) => [
    item.tuition, item.livingStipend, item.housing, item.healthInsurance, item.airfare, item.mandatoryFees, item.upfrontCash,
  ].filter(component => component.status === 'Confirmed' || component.status === 'Not applicable').length +
    Number(item.stipendSufficiency === 'Confirmed' || item.stipendSufficiency === 'Not applicable')
  const fundingDifference = completeness(b) - completeness(a)
  if (fundingDifference) return fundingDifference
  const stipendDifference = Number(b.livingStipend.status === 'Confirmed') - Number(a.livingStipend.status === 'Confirmed')
  if (stipendDifference) return stipendDifference
  const evidenceRank: Record<Verification, number> = { confirmed: 4, unverified: 3, historical: 2, estimate: 1, unknown: 0 }
  const evidenceDifference = evidenceRank[b.sourceStatus] - evidenceRank[a.sourceStatus]
  if (evidenceDifference) return evidenceDifference
  const intakeOrder: IntakeVerification[] = ['Fall 2027 verified', 'Not yet announced', 'Historical intake only']
  const intakeDifference = intakeOrder.indexOf(a.intakeVerification) - intakeOrder.indexOf(b.intakeVerification)
  if (intakeDifference) return intakeDifference
  const verifiedDeadline = (item: ScholarshipOpportunity) => item.applicationDeadline &&
    item.intakeVerification === 'Fall 2027 verified' && applicationDeadlineConfirmed(item) ? item.applicationDeadline : ''
  const aDeadline = verifiedDeadline(a)
  const bDeadline = verifiedDeadline(b)
  if (Boolean(aDeadline) !== Boolean(bDeadline)) return aDeadline ? -1 : 1
  if (aDeadline && bDeadline && aDeadline !== bDeadline) return bDeadline.localeCompare(aDeadline)
  return a.name.localeCompare(b.name)
}

export function rankScholarshipOpportunities(items: ScholarshipOpportunity[]) {
  return [...items].sort(compareScholarshipOpportunities)
}
