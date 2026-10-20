export type Verification = 'unverified' | 'confirmed' | 'historical' | 'estimate' | 'unknown'
export type RequirementStatus = 'Required' | 'Not required' | 'Conditional' | 'Unknown'
export type AcceptanceStatus = 'Yes' | 'No' | 'Conditional' | 'Unverified'
export type FundingCoverageStatus = 'Confirmed' | 'Not covered' | 'Conditional' | 'Unknown' | 'Not applicable'
export type OpportunityTier = 'Tier 1' | 'Tier 2' | 'Tier 3' | 'Tier 4' | 'Tier 5' | 'Unassessed'
export type OpportunityKind = 'University program' | 'Scholarship' | 'RA/TA' | 'Supervisor grant' | 'University award'
export type IntakeVerification = 'Fall 2027 verified' | 'Historical intake only' | 'Not yet announced'
export type EligibilityMatch = 'Strong' | 'Possible' | 'Unclear' | 'Not assessed'
export type RequirementState = 'Required' | 'Optional' | 'Not required' | 'Unknown'
export type RecommendationState = 'Not identified' | 'To request' | 'Requested' | 'Submitted' | 'Declined' | 'Unknown'

export interface ClaimEvidence {
  id: string
  fieldKey: string
  url: string
  quote: string
  intake: string
  checkedAt: string
  status: Verification
}

export interface ProgramRequirement {
  id: string
  name: string
  status: RequirementState
  progress: 'Not started' | 'In progress' | 'Ready' | 'Not applicable'
  documentId?: string
  deadline: string
  notes: string
  evidence: ClaimEvidence[]
}

export interface RecommendationLetter {
  id: string
  recommender: string
  email: string
  status: RecommendationState
  requestedAt: string
  dueDate: string
  submittedAt: string
  notes: string
}

export interface ProgramApplicationDetails {
  applicationPortal: string
  supervisorConsent: AcceptanceStatus
  requirements: ProgramRequirement[]
  recommendations: RecommendationLetter[]
}
export type Category = 'Ambitious' | 'Match' | 'Funding-focused'
export type Country = 'South Korea' | 'Germany' | 'France'
export type Stage = 'Researching' | 'Supervisor contact' | 'Preparing' | 'Submitted' | 'Interview' | 'Admitted' | 'Waitlisted' | 'Rejected' | 'Offer accepted' | 'Visa' | 'Pre-departure'

export interface Evidence {
  url: string
  type: string
  checkedAt?: string
  publishedAt?: string
  intake: string
  status: Verification
  note: string
  needsReview?: boolean
}

export interface University {
  id: string
  isExample?: boolean
  country: Country
  intake: string
  name: string
  city: string
  program: string
  area: string
  category: Category
  rank: number
  stage: Stage
  deadline?: string
  deadlineNote?: string
  planningTier?: string
  researchNotes?: string
  tuition?: number
  stipend?: number
  coverage: string
  evidence: Evidence[]
  applicationPortal?: string
  requirements?: ProgramRequirement[]
  recommendations?: RecommendationLetter[]
  supervisorConsent?: AcceptanceStatus
  submittedAt?: string
  decisionAt?: string
  decision?: string
  applicationNotes?: string
  nextAction?: string
}

export interface Task {
  id: string
  isExample?: boolean
  title: string
  dueDate: string
  priority: 'High' | 'Medium' | 'Low'
  done: boolean
  description?: string
  university?: string
  reminderAt?: string
}

export interface FundingComponent {
  status: FundingCoverageStatus
  detail: string
}

export interface ScholarshipOpportunity {
  id: string
  kind: OpportunityKind
  name: string
  university: string
  program: string
  tier: OpportunityTier
  eligibilityMatch: EligibilityMatch
  intakeVerification: IntakeVerification
  tuition: FundingComponent
  livingStipend: FundingComponent
  stipendSufficiency: FundingCoverageStatus
  claimEvidence: ClaimEvidence[]
  stipendAmount: string
  applicationEvidence?: ClaimEvidence[]
  housing: FundingComponent
  healthInsurance: FundingComponent
  airfare: FundingComponent
  mandatoryFees: FundingComponent
  upfrontCash: FundingComponent
  fundingConditions: string
  fundingTermination: string
  ieltsRequirement: RequirementStatus
  languageEvidence: ClaimEvidence[]
  ieltsWaiver: AcceptanceStatus
  waiverProfileEligibility: AcceptanceStatus
  moiAccepted: AcceptanceStatus
  moiProfileEligibility: AcceptanceStatus
  moiScope: string
  moiCondition: string
  toeflAccepted: AcceptanceStatus
  otherEnglishTests: string
  minimumIelts: string
  alternativeMinimumScores: string
  testValidity: string
  testDeadline: string
  applicationDeadline: string
  sourceUrl: string
  sourceQuote: string
  sourceStatus: Verification
  lastVerified: string
  evidenceConflict: string
  needsConfirmation: string
  notes: string
}

export interface Profile {
  name: string
  portfolioUrl: string
  githubUrl: string
  linkedinUrl: string
  contactEmail: string
  cvUrl: string
  skills: string
  experience: string
  university: string
  degree: string
  cgpa: string
  ssc: string
  hsc: string
  status: string
  ielts: string
  ieltsBookingDate: string
  ieltsResultDate: string
  ieltsScore: string
  upfrontBudget: string
  passportExpiry: string
  target: string
  needs: string
  timezone: string
}

export interface Workspace {
  profile: Profile
  universities: University[]
  opportunities: ScholarshipOpportunity[]
  tasks: Task[]
}
