import type { FundingComponent, ScholarshipOpportunity, Task, University, Workspace } from './types'
import contextSeed from '../docs/project-context/Korea_Masters_Command_Center_Seed_Data.json'

const knownKoreanUniversities = new Set(['Seoul National University', 'KAIST', 'UNIST'])
const historicalNotes = new Map<string, { note: string; urls: string[] }>()
for (const item of contextSeed.historical_research_notes) {
  const prior = historicalNotes.get(item.university)
  const note = [item.status, item.note].filter(Boolean).join(': ')
  historicalNotes.set(item.university, {
    note: [prior?.note, note].filter(Boolean).join('\n'),
    urls: [...new Set([...(prior?.urls ?? []), ...(item.urls ?? (item.url ? [item.url] : []))])],
  })
}

const koreaCandidateUniversities: University[] = contextSeed.candidate_universities_unverified
  .filter(name => !knownKoreanUniversities.has(name))
  .map((name, index) => {
    const historical = historicalNotes.get(name)
    return {
      id: `30000000-0000-4000-8000-${String(index + 1).padStart(12, '0')}`,
      isExample: true,
      country: 'South Korea' as const,
      intake: 'Fall 2027',
      name,
      city: 'Not specified',
      program: 'Not confirmed',
      area: 'Not confirmed',
      category: 'Match' as const,
      rank: index + 4,
      stage: 'Researching' as const,
      coverage: 'Unknown',
      planningTier: 'Candidate · fit and funding unassessed',
      researchNotes: historical
        ? `Historical research lead — unverified for Fall 2027. ${historical.note}`
        : 'Candidate from the context pack. Exact CS Master’s program, Fall 2027 intake, costs, deadlines, and funding are unknown.',
      evidence: (historical?.urls ?? []).map(url => ({
        url, type: 'Historical research lead', intake: 'Fall 2027', status: 'historical' as const,
        note: 'Historical lead from the context pack; verify this exact program and intake against the current official page before relying on it.',
      })),
    }
  })

const roadmapTasks: Task[] = contextSeed.roadmap.flatMap((phase, phaseIndex) => phase.tasks.map((title, index) => ({
  id: `40000000-0000-4000-8000-${String(phaseIndex * 10 + index + 1).padStart(12, '0')}`,
  isExample: true,
  title,
  dueDate: '',
  priority: /verify|official|GKS|deadline|funding|recommendation/i.test(title) ? 'High' as const : 'Medium' as const,
  done: false,
  description: `Roadmap phase: ${phase.phase} (${phase.period}). Planning window only; no confirmed due date has been assigned.`,
})))

const official = (url: string, type: string, note: string) => ({
  url, type, intake: 'Fall 2027', status: 'unknown' as const, note,
})

const unknownFunding: FundingComponent = { status: 'Unknown', detail: '' }
const programLead = (id: string, university: string, url: string, sourceStatus: 'unverified' | 'unknown'): ScholarshipOpportunity => ({
  id, kind: 'University program', name: 'Graduate CSE/CS program — exact program to confirm',
  university, program: 'Not confirmed', tier: 'Unassessed', eligibilityMatch: 'Not assessed',
  intakeVerification: 'Not yet announced',
  tuition: { ...unknownFunding }, livingStipend: { ...unknownFunding }, stipendSufficiency: 'Unknown', stipendAmount: '',
  claimEvidence: [], applicationEvidence: [], languageEvidence: [],
  housing: { ...unknownFunding }, healthInsurance: { ...unknownFunding }, airfare: { ...unknownFunding },
  mandatoryFees: { ...unknownFunding }, upfrontCash: { ...unknownFunding },
  fundingConditions: '', fundingTermination: '',
  ieltsRequirement: 'Unknown', ieltsWaiver: 'Unverified', waiverProfileEligibility: 'Unverified',
  moiAccepted: 'Unverified', moiProfileEligibility: 'Unverified',
  moiScope: '', moiCondition: '', toeflAccepted: 'Unverified', otherEnglishTests: '',
  minimumIelts: '', alternativeMinimumScores: '', testValidity: '', testDeadline: '',
  applicationDeadline: '', sourceUrl: url, sourceQuote: '', sourceStatus, lastVerified: '2026-10-20',
  evidenceConflict: '', needsConfirmation: 'Confirm exact CSE/CS program, Fall 2027 intake, language rules, scholarship eligibility, funding package, fees, and deadlines with the official admissions office.',
  notes: 'Starter program lead only. The cited page has not been verified as evidence for Fall 2027 program or funding terms. No IELTS score or booking result is recorded here.',
})

const gksLead: ScholarshipOpportunity = {
  ...programLead('50000000-0000-4000-8000-000000000004', 'Korean Government', 'https://www.studyinkorea.go.kr/ko/main.do', 'unknown'),
  kind: 'Scholarship',
  name: 'Global Korea Scholarship (GKS) — graduate 2027 notice to verify',
  program: 'Graduate scholarship · application track and eligibility to confirm',
  needsConfirmation: 'Check the official 2027 graduate notice and confirm application track, eligibility, language evidence, benefits, deadlines, and required upfront costs. Keep embassy-track and university-track instructions separate.',
  notes: 'Research lead only. The official portal is not itself a Fall 2027 scholarship notice. The reviewed sources did not confirm GKS 2027 graduate terms; all language and funding fields remain unknown.',
}

const unistTuitionLead: ScholarshipOpportunity = {
  ...programLead('50000000-0000-4000-8000-000000000005', 'UNIST', 'https://www.unist.ac.kr/unist/admissions/scholarship-info-grad.do', 'unknown'),
  kind: 'University award',
  name: 'UNIST graduate tuition support · Fall 2027 applicability unverified',
  program: 'Graduate admissions scholarship overview · exact CSE program to confirm',
  tuition: { status: 'Conditional', detail: 'Official page states 100% entrance-fee and tuition support for all new students; intake and conditions need confirmation.' },
  sourceQuote: '모든 신입생에게 입학금과 등록금을 100% 지원합니다. (Official page wording: “100% support for admission fee and tuition for all new students.”)',
  claimEvidence: [{
    id: '50000000-0000-4000-8000-000000000006', fieldKey: 'tuition',
    url: 'https://www.unist.ac.kr/unist/admissions/scholarship-info-grad.do',
    quote: '모든 신입생에게 입학금과 등록금을 100% 지원합니다.',
    intake: 'General current page; not specific to Fall 2027', checkedAt: '2026-10-20', status: 'unknown',
  }],
  needsConfirmation: 'Ask UNIST admissions to confirm whether this tuition policy applies to Fall 2027 international CSE Master’s students and whether separate scholarship selection, academic conditions, or continued-enrollment rules apply. Confirm stipend, insurance, housing, airfare, mandatory fees, and upfront cash.',
  notes: 'Official graduate scholarship page was reachable and inspected on 20 October 2026. It states tuition/entrance-fee support, but does not provide Fall 2027 applicability or living-cost coverage in the retrieved wording. Do not treat this as full funding.',
}

export const initialWorkspace: Workspace = {
  profile: {
    name: 'Md. Sadman Al Islam Shabab',
    portfolioUrl: 'https://my-portfolio-amber-theta-80.vercel.app/',
    githubUrl: 'https://github.com/sabab2808',
    linkedinUrl: 'https://www.linkedin.com/in/crypto28/',
    contactEmail: 'sadmansabab2808@gmail.com',
    cvUrl: 'https://my-portfolio-amber-theta-80.vercel.app/assets/CV%20OF%20Md.%20Sadman%20Al%20Islam%20Shabab.pdf',
    skills: 'JavaScript, TypeScript, Python, SQL, React, Next.js, Node.js, Express.js, MongoDB, MySQL, PHP, C++, REST APIs, database design, UI/UX, GitHub',
    experience: 'Full Stack Developer — HostelMania (2025–present); Executive Member — Computer & Programming Club (2024–present); BdOI Host & Volunteer (2024); Hult Prize Head of Marketing (2024). Public GitHub projects: My-Portfolio and HostelMania2.0.',
    university: 'Daffodil International University', degree: 'BSc in Computer Science & Engineering',
    cgpa: '3.68 / 4.00', ssc: '5.00', hsc: '5.00', status: 'Final semester',
    ielts: '', ieltsBookingDate: '', ieltsResultDate: '', ieltsScore: '',
    upfrontBudget: '', passportExpiry: '',
    target: 'September 2027', needs: 'Tuition + living costs + essential expenses', timezone: 'Asia/Dhaka',
  },
  universities: [
    { id: '10000000-0000-4000-8000-000000000001', isExample: true, country: 'South Korea', intake: 'Fall 2027', name: 'Seoul National University', city: 'Seoul', program: 'Not confirmed', area: 'Not confirmed', category: 'Ambitious', rank: 1, stage: 'Researching', coverage: 'Not confirmed', evidence: [{ ...official('https://en.snu.ac.kr/academics/programs/graduate', 'Graduate programs', 'Official graduate-program listing checked; it is not Fall 2027 admissions guidance. No deadline or funding fact has been verified.'), status: 'unverified', checkedAt: '2026-10-20' }] },
    { id: '10000000-0000-4000-8000-000000000002', isExample: true, country: 'South Korea', intake: 'Fall 2027', name: 'KAIST', city: 'Daejeon', program: 'Not confirmed', area: 'Not confirmed', category: 'Match', rank: 2, stage: 'Researching', coverage: 'Not confirmed', evidence: [{ ...official('https://admission.kaist.ac.kr/intl-graduate/', 'International graduate admissions', 'Official KAIST admissions page checked; specific Fall 2027 intake details and applicant funding remain unconfirmed.'), status: 'unverified', checkedAt: '2026-10-20' }] },
    { id: '10000000-0000-4000-8000-000000000003', isExample: true, country: 'South Korea', intake: 'Fall 2027', name: 'UNIST', city: 'Ulsan', program: 'Not confirmed', area: 'Not confirmed', category: 'Funding-focused', rank: 3, stage: 'Researching', coverage: 'Tuition support stated on official page; 2027 applicability and living support unknown', evidence: [{ ...official('https://www.unist.ac.kr/unist/admissions/scholarship-info-grad.do', 'Graduate scholarship overview', 'Official page states in Korean: “모든 신입생에게 입학금과 등록금을 100% 지원합니다.” (100% support for admission fee and tuition for all new students). Page does not establish a Fall 2027 award, eligibility conditions, stipend, or other costs.'), status: 'unknown', note: 'Current official page confirms only its stated entrance-fee/tuition policy; the page’s intake and update date are not explicit, so Fall 2027 applicability, eligibility, living stipend, insurance, housing, airfare, and other fees remain unverified.' }] },
    { id: '10000000-0000-4000-8000-000000000004', isExample: true, country: 'Germany', intake: 'Winter Semester 2027/28', name: 'Technical University of Munich (TUM)', city: 'Munich', program: 'MSc Informatics · intake to verify', area: 'Software systems, machine learning, databases, and networks (verify current curriculum)', category: 'Ambitious', rank: 1, stage: 'Researching', coverage: 'Not confirmed', planningTier: 'Research lead · not an admissions assessment', researchNotes: 'The official program page is a starting point for Informatics research. Verify the Winter Semester 2027/28 application window, English-language eligibility, tuition/fees, and full living-cost funding; no Fall 2027 terms are confirmed.', evidence: [{ url: 'https://www.cit.tum.de/en/cit/studies/degree-programs/master-informatics/', type: 'Official Informatics program page', intake: 'Winter Semester 2027/28', status: 'unverified', checkedAt: '2026-10-20', note: 'Official program page reviewed. It does not establish Winter 2027/28 availability, applicant-specific eligibility, costs, or guaranteed funding.' }] },
    { id: '10000000-0000-4000-8000-000000000005', isExample: true, country: 'France', intake: 'Autumn 2027', name: 'Université Paris-Saclay', city: 'Paris-Saclay', program: 'Master’s in Computer Science · track to verify', area: 'AI, Big Data, HCI, software security, cybersecurity, and quantum computing', category: 'Funding-focused', rank: 1, stage: 'Researching', coverage: 'Scholarship leads; full funding not confirmed', planningTier: 'Research lead · not an admissions assessment', researchNotes: 'Official program page describes English-taught tracks and references IDEX, CMA SaclAI School, and DATAIA scholarships. Confirm the exact English-taught track, 2027 application process, scholarship eligibility, and whether any award covers living expenses; no 2027 award is guaranteed.', evidence: [{ url: 'https://www.universite-paris-saclay.fr/en/education/masters-degree/computer-science', type: 'Official Computer Science master page', intake: 'Autumn 2027', status: 'unverified', checkedAt: '2026-10-20', note: 'Official page reviewed; it describes current program and scholarship leads, not confirmed 2027 dates, eligibility, or full-cost coverage.' }] },
    { id: '10000000-0000-4000-8000-000000000006', isExample: true, country: 'France', intake: 'Autumn 2027', name: 'Université Grenoble Alpes · MOSIG', city: 'Grenoble', program: 'Master of Science in Informatics at Grenoble · intake to verify', area: 'Informatics and research lab areas in Grenoble (specialization to verify)', category: 'Match', rank: 2, stage: 'Researching', coverage: 'Not confirmed', planningTier: 'Research lead · not an admissions assessment', researchNotes: 'The official MOSIG page references the 2026/27 M1 site and provides a route to admission information. Verify 2027 intake, English-language track availability, current application instructions, fees, and scholarships.', evidence: [{ url: 'https://mosig.imag.fr/', type: 'Official MOSIG program page', intake: 'Autumn 2027', status: 'historical', checkedAt: '2026-10-20', note: 'Official page references 2026/27 M1 information; no Autumn 2027 admissions, English-language eligibility, or funding terms are confirmed.' }] },
    ...koreaCandidateUniversities,
  ],
  opportunities: [
    programLead('50000000-0000-4000-8000-000000000001', 'Seoul National University', 'https://en.snu.ac.kr/academics/programs/graduate', 'unverified'),
    programLead('50000000-0000-4000-8000-000000000002', 'KAIST', 'https://admission.kaist.ac.kr/intl-graduate/', 'unverified'),
    programLead('50000000-0000-4000-8000-000000000003', 'UNIST', 'https://admg-intl.unist.ac.kr/', 'unknown'),
    gksLead,
    unistTuitionLead,
  ],
  tasks: [
    { id: '20000000-0000-4000-8000-000000000001', isExample: true, title: 'Confirm IELTS test date and registration details', dueDate: '', priority: 'High', done: false },
    { id: '20000000-0000-4000-8000-000000000002', isExample: true, title: 'Create a shortlist of research labs', dueDate: '', priority: 'Medium', done: false },
    { id: '20000000-0000-4000-8000-000000000003', isExample: true, title: 'Request official transcript and grading scale', dueDate: '', priority: 'Medium', done: false },
    { id: '20000000-0000-4000-8000-000000000004', isExample: true, title: 'Verify TUM Winter Semester 2027/28 program, fees, and funding', dueDate: '', priority: 'High', done: false, description: 'Confirm the current English-language Informatics track, official application period, tuition/mandatory fees, and guaranteed living-cost support.' },
    { id: '20000000-0000-4000-8000-000000000005', isExample: true, title: 'Check Paris-Saclay and MOSIG 2027 English tracks and scholarships', dueDate: '', priority: 'High', done: false, description: 'Verify exact Autumn 2027 track availability, scholarship eligibility, application deadlines, and whether any award covers living expenses.' },
    ...roadmapTasks,
  ],
}
