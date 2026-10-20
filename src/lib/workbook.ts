import readXlsxFile, { type CellValue } from 'read-excel-file/browser'
import type { Category, Task, University } from '../types'

const MAX_WORKBOOK_BYTES = 10 * 1024 * 1024
const FALL_2027 = 'Fall 2027'

type WorkbookResult = { universities: University[]; tasks: Task[]; warnings: string[] }
type Cell = CellValue | Date | null

const normalizeHeader = (value: Cell) => String(value ?? '').trim().toLowerCase().replace(/[^a-z0-9]+/g, ' ')
const text = (value: Cell) => value instanceof Date ? value.toISOString().slice(0, 10) : String(value ?? '').trim()
const safeUrl = (value: Cell) => {
  try {
    const url = new URL(text(value))
    return url.protocol === 'https:' && !url.username && !url.password ? url.toString() : ''
  } catch {
    return ''
  }
}
const id = () => crypto.randomUUID()

export async function parseApplicantWorkbook(file: File): Promise<WorkbookResult> {
  if (!file.name.toLowerCase().endsWith('.xlsx') || file.size > MAX_WORKBOOK_BYTES || file.size === 0) {
    throw new Error('Choose a non-empty .xlsx workbook smaller than 10 MB.')
  }

  const sheets = await readXlsxFile(file)
  const shortlist = sheets.find(sheet => normalizeHeader(sheet.sheet) === 'ranked university list')
  if (!shortlist) throw new Error('The workbook does not contain a "Ranked university list" sheet.')

  const rows = shortlist.data
  const headerRow = rows.findIndex(row => row.some(value => normalizeHeader(value).includes('university')))
  if (headerRow < 0) throw new Error('The ranked-university sheet has no university column.')
  const headers = rows[headerRow].map(normalizeHeader)
  const column = (name: string) => headers.indexOf(normalizeHeader(name))
  const get = (row: Cell[], name: string) => {
    const index = column(name)
    return index < 0 ? '' : text(row[index] ?? null)
  }
  const universityColumn = column('University')
  const sourceColumn = column('Official admissions link')
  if (universityColumn < 0) throw new Error('The ranked-university sheet has no university-name column.')

  const universities: University[] = []
  for (const row of rows.slice(headerRow + 1) as Cell[][]) {
    const name = get(row, 'University')
    if (!name) continue
    const group = get(row, 'Colour-coded group')
    const category: Category = group.startsWith('A') ? 'Funding-focused' : group.startsWith('C') ? 'Ambitious' : 'Match'
    const source = sourceColumn < 0 ? '' : safeUrl(row[sourceColumn] ?? null)
    const planningTier = get(row, 'Planning tier (not probability)')
    const funding = get(row, 'Scholarship / funding coverage')
    const fundingAssessment = get(row, 'Full-funding judgement')
    const tuition = get(row, 'Tuition fee baseline (before scholarship)')
    const tuitionSource = get(row, 'Tuition source / confidence')
    const verification = get(row, 'Verification notes')
    const programFit = get(row, 'CS program fit to verify')
    const researchNotes = [
      programFit && `Program fit (requires verification): ${programFit}`,
      planningTier && `Workbook planning tier (not probability): ${planningTier}`,
      funding && `Workbook funding lead (unverified): ${funding}`,
      fundingAssessment && `Workbook funding assessment (unverified): ${fundingAssessment}`,
      tuition && `Workbook tuition lead (unverified): ${tuition}`,
      tuitionSource && `Workbook tuition source/confidence: ${tuitionSource}`,
      verification && `Workbook verification note: ${verification}`,
    ].filter(Boolean).join('\n')
    const sourceNote = [
      'Imported from the applicant workbook. Source URL and associated claims require manual review.',
      funding && `Funding lead (unverified): ${funding}`,
      verification && `Workbook note: ${verification}`,
    ].filter(Boolean).join(' ')
    universities.push({
      id: id(), country: 'South Korea', intake: FALL_2027, isExample: false, name,
      city: get(row, 'City') || 'Not specified',
      program: programFit || 'Computer Science program to verify',
      area: 'Not specified', category, rank: Number(get(row, 'Priority')) || universities.length + 1,
      stage: 'Researching', coverage: 'Not confirmed',
      planningTier,
      deadlineNote: get(row, 'Fall 2027 deadline status') || 'Not confirmed',
      researchNotes,
      evidence: source ? [{
        url: source, type: 'Workbook-listed admissions source', intake: FALL_2027,
        status: 'unverified', note: sourceNote,
      }] : [],
    })
  }
  if (!universities.length) throw new Error('No university rows were found in the workbook.')

  const requirements = sheets.find(sheet => normalizeHeader(sheet.sheet) === 'application requirements')
  const warnings = requirements?.data.flat().map(value => text(value)).filter(value => /cv lists\s+[\d.]+\s*\/\s*4\.00/i.test(value)) ?? []
  const timeline = sheets.find(sheet => normalizeHeader(sheet.sheet) === 'timeline')
  const tasks: Task[] = []
  if (timeline) {
    const timelineHeader = timeline.data.findIndex(row => row.some(value => normalizeHeader(value) === 'timing'))
    if (timelineHeader >= 0) {
      const timelineHeaders = timeline.data[timelineHeader].map(normalizeHeader)
      const at = (row: Cell[], title: string) => {
        const index = timelineHeaders.indexOf(normalizeHeader(title))
        return index < 0 ? '' : text(row[index] ?? null)
      }
      for (const row of timeline.data.slice(timelineHeader + 1) as Cell[][]) {
        const timing = at(row, 'Timing')
        const action = at(row, 'Task')
        if (!timing || !action) continue
        tasks.push({
          id: id(), title: `${timing}: ${action}`, description: [at(row, 'Action'), at(row, 'Important note')].filter(Boolean).join('\n'),
          dueDate: '', priority: /GKS|IELTS|written funding check/i.test(action) ? 'High' : 'Medium', done: false,
        })
      }
    }
  }

  return { universities, tasks, warnings: [...new Set(warnings)] }
}
