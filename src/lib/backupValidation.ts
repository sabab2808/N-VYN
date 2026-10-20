import type {
  ClaimEvidence, FundingCoverageStatus, ScholarshipOpportunity, Task, University, Workspace,
} from '../types'

const fundingStatuses: FundingCoverageStatus[] = ['Confirmed', 'Not covered', 'Conditional', 'Unknown', 'Not applicable']
const verificationStatuses = ['confirmed', 'unverified', 'historical', 'estimate', 'unknown']
const requirementStatuses = ['Required', 'Not required', 'Conditional', 'Unknown']
const acceptanceStatuses = ['Yes', 'No', 'Conditional', 'Unverified']
const recommendationStatuses = ['Not identified', 'To request', 'Requested', 'Submitted', 'Declined', 'Unknown']
const applicationStages = ['Researching', 'Supervisor contact', 'Preparing', 'Submitted', 'Interview', 'Admitted',
  'Waitlisted', 'Rejected', 'Offer accepted', 'Visa', 'Pre-departure']
const countries = ['South Korea', 'Germany', 'France']
const categories = ['Ambitious', 'Match', 'Funding-focused']

const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === 'object' && value !== null && !Array.isArray(value)
const isText = (value: unknown): value is string => typeof value === 'string'
const isOneOf = (value: unknown, options: string[]) => isText(value) && options.includes(value)

function isEvidence(value: unknown): value is ClaimEvidence {
  return isRecord(value) && ['id', 'fieldKey', 'url', 'quote', 'intake', 'checkedAt'].every(key => isText(value[key])) &&
    isOneOf(value.status, verificationStatuses)
}

function isFundingComponent(value: unknown) {
  return isRecord(value) && isOneOf(value.status, fundingStatuses) && isText(value.detail)
}

function isUniversity(value: unknown): value is University {
  if (!isRecord(value)) return false
  const textFields = ['id', 'intake', 'name', 'city', 'program', 'area', 'coverage']
  if (!textFields.every(key => isText(value[key])) || !isOneOf(value.country, countries) ||
    !isOneOf(value.category, categories) || !isOneOf(value.stage, applicationStages) ||
    typeof value.rank !== 'number' || !Array.isArray(value.evidence) || !value.evidence.every(isRecord)) return false
  if (value.requirements !== undefined && (!Array.isArray(value.requirements) || !value.requirements.every(requirement =>
    isRecord(requirement) && ['id', 'name', 'deadline', 'notes'].every(key => isText(requirement[key])) &&
    isOneOf(requirement.status, ['Required', 'Optional', 'Not required', 'Unknown']) &&
    Array.isArray(requirement.evidence) && requirement.evidence.every(isEvidence)))) return false
  if (value.recommendations !== undefined && (!Array.isArray(value.recommendations) || !value.recommendations.every(letter =>
    isRecord(letter) && ['id', 'recommender', 'email', 'requestedAt', 'dueDate', 'submittedAt', 'notes'].every(key => isText(letter[key])) &&
    isOneOf(letter.status, recommendationStatuses)))) return false
  return true
}

function isTask(value: unknown): value is Task {
  return isRecord(value) && ['id', 'title', 'dueDate'].every(key => isText(value[key])) &&
    isOneOf(value.priority, ['High', 'Medium', 'Low']) && typeof value.done === 'boolean'
}

function isOpportunity(value: unknown): value is ScholarshipOpportunity {
  if (!isRecord(value)) return false
  const textFields = ['id', 'name', 'university', 'program', 'tier', 'eligibilityMatch', 'intakeVerification',
    'stipendAmount', 'fundingConditions', 'fundingTermination', 'ieltsRequirement', 'ieltsWaiver',
    'waiverProfileEligibility', 'moiAccepted', 'moiProfileEligibility', 'moiScope', 'moiCondition',
    'toeflAccepted', 'otherEnglishTests', 'minimumIelts', 'alternativeMinimumScores', 'testValidity',
    'testDeadline', 'applicationDeadline', 'sourceUrl', 'sourceQuote', 'sourceStatus', 'lastVerified',
    'evidenceConflict', 'needsConfirmation', 'notes']
  if (!isOneOf(value.kind, ['University program', 'Scholarship', 'RA/TA', 'Supervisor grant', 'University award']) ||
    !textFields.every(key => isText(value[key])) ||
    !['tuition', 'livingStipend', 'housing', 'healthInsurance', 'airfare', 'mandatoryFees', 'upfrontCash'].every(key => isFundingComponent(value[key])) ||
    !isOneOf(value.stipendSufficiency, fundingStatuses) || !isOneOf(value.ieltsRequirement, requirementStatuses) ||
    !isOneOf(value.ieltsWaiver, acceptanceStatuses) || !isOneOf(value.waiverProfileEligibility, acceptanceStatuses) ||
    !isOneOf(value.moiAccepted, acceptanceStatuses) || !isOneOf(value.moiProfileEligibility, acceptanceStatuses) ||
    !isOneOf(value.toeflAccepted, acceptanceStatuses) || !isOneOf(value.sourceStatus, verificationStatuses) ||
    !isOneOf(value.intakeVerification, ['Fall 2027 verified', 'Historical intake only', 'Not yet announced']) ||
    !isOneOf(value.eligibilityMatch, ['Strong', 'Possible', 'Unclear', 'Not assessed']) ||
    !Array.isArray(value.claimEvidence) || !value.claimEvidence.every(isEvidence) ||
    !Array.isArray(value.languageEvidence) || !value.languageEvidence.every(isEvidence) ||
    (value.applicationEvidence !== undefined && (!Array.isArray(value.applicationEvidence) || !value.applicationEvidence.every(isEvidence)))
  ) return false
  return true
}

export function isValidWorkspaceBackup(value: unknown): value is Workspace {
  if (!isRecord(value)) return false
  const profile = value.profile
  if (!isRecord(profile) || !Array.isArray(value.universities) ||
    !Array.isArray(value.opportunities) || !Array.isArray(value.tasks)) return false
  if (!Object.values(profile).every(isText) ||
    !['name', 'portfolioUrl', 'githubUrl', 'linkedinUrl', 'contactEmail', 'cvUrl', 'skills', 'experience',
      'university', 'degree', 'cgpa', 'ssc', 'hsc', 'status', 'ielts', 'ieltsBookingDate', 'ieltsResultDate',
      'ieltsScore', 'upfrontBudget', 'passportExpiry', 'target', 'needs', 'timezone']
      .every(key => isText(profile[key]))) return false
  return value.universities.every(isUniversity) && value.opportunities.every(isOpportunity) && value.tasks.every(isTask)
}

export function isValidBudgetBackup(value: unknown) {
  return isRecord(value) && isOneOf(value.currency, ['KRW', 'EUR', 'BDT']) &&
    ['monthlyLiving', 'annualTuition', 'travel', 'fees', 'insurance', 'guaranteedMonthly'].every(key => isText(value[key]))
}

export function isValidDocumentsBackup(value: unknown) {
  return Array.isArray(value) && value.every(document => isRecord(document) &&
    ['id', 'name', 'type', 'issued', 'expiry', 'status', 'translation', 'notarization', 'apostille']
      .every(key => isText(document[key])) &&
    (document.storagePath === undefined || document.storagePath === null || isText(document.storagePath)))
}

export function isValidProfessorContactsBackup(value: unknown) {
  return Array.isArray(value) && value.every(contact => isRecord(contact) &&
    ['id', 'professor', 'lab', 'email', 'contacted', 'followUp', 'fit', 'papers', 'notes', 'funding', 'nextAction']
      .every(key => isText(contact[key])))
}
