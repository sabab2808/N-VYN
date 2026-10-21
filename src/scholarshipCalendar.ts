export type CalendarEntry = { name: string; level?: string; dates: string[]; note?: string; url?: string }

// User-provided planning leads. Dates and expected deadlines have not been independently verified.
export const koreaMarch2027: CalendarEntry[] = [
  { name: 'Kyungsung University', level: "Bachelor’s & Master’s", dates: ['2nd Round: 28 September – 12 October 2026'] },
  { name: 'Sejong University', level: "Bachelor’s & Master’s", dates: ['2nd Round: 22 October – 13 November 2026'] },
  { name: 'Gachon University', dates: ["Master’s · 1st Round: 7–14 October 2026", "Master’s · 2nd Round: 11–18 November 2026", "Master’s · 3rd Round: 16–23 December 2026", "Bachelor’s · 1st Round: 12–23 October 2026", "Bachelor’s · 2nd Round: 23 November – 4 December 2026", "Bachelor’s · 3rd Round: 28 December 2026 – 4 January 2027"] },
  { name: 'Busan University of Foreign Studies (BUFS)', level: "Bachelor’s", dates: ['1st Round: 28 September – 8 October 2026', '2nd Round: 23 November – 4 December 2026'] },
  { name: 'Myongji University', level: "Master’s", dates: ['1st Round: 28 September – 9 October 2026', '2nd Round: 26 October – 6 November 2026'] },
  { name: 'Jeonbuk National University', level: "Master’s", dates: ['Application Period: 21 September – 2 October 2026', 'Final Deadline: 2 October 2026'] },
  { name: 'The Catholic University of Korea', level: "Master’s", dates: ['Application Opens: 13 October 2026', 'Application Deadline: To Be Announced'] },
  { name: 'Ajou University', level: "Master’s", dates: ['1st Round: 12–30 October 2026', '2nd Round: 2–20 November 2026', '3rd Round: 23 November – 18 December 2026'] },
  { name: 'Dong-eui University', level: "Master’s", dates: ['Application Deadline: 6 October 2026'] },
  { name: 'Hansung University', level: "Bachelor’s", dates: ['1st Round: 5–16 October 2026', '2nd Round: 23 November – 4 December 2026'] },
  { name: 'Baekseok University', level: "Master’s", dates: ['1st Round: 1–23 October 2026', '2nd Round: 23 November – 25 December 2026'] },
  { name: 'Eulji University', level: "Master’s", dates: ['Application Deadline: 8 October 2026'] },
  { name: 'Chungbuk National University', level: "Master’s", dates: ['1st Round: 12–30 October 2026', '2nd Round: 23 November – 11 December 2026'] },
  { name: 'Dong-A University', level: "Master’s · E-Visa", dates: ['1st Round: 30 September – 14 October 2026', '2nd Round: 9–23 December 2026'] },
  { name: 'Pyeongtaek University', level: "Master’s", dates: ['1st Round: 19 October – 4 November 2026', '2nd Round: 16 November – 2 December 2026', '3rd Round: 14–30 December 2026'] },
]

export const internationalScholarships: CalendarEntry[] = [
  { name: 'Erasmus Mundus Joint Masters Scholarship', dates: ['October 2026 – January 2027 (varies by program)'], url: 'https://erasmus-plus.ec.europa.eu/opportunities/individuals/students/erasmus-mundus-joint-masters' },
  { name: 'Commonwealth Shared Scholarship · UK', dates: ['December 2026 (expected)'], url: 'https://cscuk.fcdo.gov.uk/scholarships/commonwealth-shared-scholarships-applications/' },
  { name: 'Fulbright Foreign Student Program · USA', dates: ['Country-specific; check the 2027 intake'], url: 'https://foreign.fulbrightonline.org/' },
  { name: 'Eiffel Excellence Scholarship · France', dates: ['December 2026 (expected; university deadlines earlier)'], url: 'https://www.campusfrance.org/en/france-excellence-eiffel-scholarship-program' },
  { name: 'Gates Cambridge Scholarship · UK', dates: ['December 2026 – January 2027'], url: 'https://www.gatescambridge.org/' },
  { name: 'Oxford Clarendon Scholarship · UK', dates: ['December 2026 – January 2027'], url: 'https://www.ox.ac.uk/admissions/graduate/fees-and-funding/funding/clarendon' },
  { name: 'Cambridge Trust Scholarships · UK', dates: ['December 2026 – January 2027'], url: 'https://www.cambridgetrust.org/' },
  { name: 'ETH Zurich Excellence Scholarship (ESOP) · Switzerland', dates: ['November 2026 (expected)'], url: 'https://ethz.ch/students/en/studies/financial/scholarships.html' },
  { name: 'EPFL Excellence Fellowships · Switzerland', dates: ['December 2026 / March 2027 (expected)'], url: 'https://www.epfl.ch/education/master/' },
  { name: 'Maastricht University NL-High Potential Scholarship · Netherlands', dates: ['February 2027 (expected)'], url: 'https://www.maastrichtuniversity.nl/' },
  { name: 'Maastricht University NL Brightlands Talent Scholarship · Netherlands', dates: ['February 2027 (expected)'], url: 'https://lnkd.in/d4M88Q4w' },
  { name: 'Eric Bleumink Fellowship · University of Groningen, Netherlands', dates: ['December 2026 (expected nomination timeline)'], url: 'https://lnkd.in/dEk9VrW5' },
  { name: 'VLIR-UOS ICP Connect Scholarship · Belgium', dates: ['February–March 2027 (expected)'], url: 'https://www.vliruos.be' },
  { name: 'Master Mind Scholarship · Belgium', dates: ['March–April 2027 (expected)'], url: 'https://lnkd.in/dgBsesT2' },
  { name: 'Government of Ireland International Education Scholarship', dates: ['March 2027 (expected)'], url: 'https://hea.ie' },
]

export const more2027ScholarshipsUrl = 'https://scholarsavenue.com/scholarships-for-2027/'
