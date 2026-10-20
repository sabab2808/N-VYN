export type Verification = 'unverified' | 'confirmed' | 'historical' | 'estimate' | 'unknown'
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
  target: string
  needs: string
  timezone: string
}

export interface Workspace {
  profile: Profile
  universities: University[]
  tasks: Task[]
}
