import { useState, type FormEvent } from 'react'
import { ExternalLink, Search } from 'lucide-react'
import { supabase } from './lib/supabase'
import type { Country } from './types'

type SearchResult = { title: string; url: string; description: string; age: string | null }
type SearchResponse = { results: SearchResult[]; searchedAt: string; cached: boolean; sourceScope: string }
const countries: Country[] = ['South Korea', 'Germany', 'France']

const defaultQueries: Record<Country, string> = {
  'South Korea': 'English-taught computer science master Fall 2027 international admissions scholarships graduate',
  Germany: 'English-taught computer science master Winter Semester 2027/28 international admission scholarships',
  France: 'English-taught computer science master autumn 2027 international admission scholarships',
}

export function ResearchSearchPage({ country: initialCountry, timezone }: { country: Country; timezone: string }) {
  const [country, setCountry] = useState<Country>(initialCountry)
  const [query, setQuery] = useState(defaultQueries[initialCountry])
  const [results, setResults] = useState<SearchResult[]>([])
  const [searchedAt, setSearchedAt] = useState('')
  const [cached, setCached] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [searched, setSearched] = useState(false)

  const search = async (event: FormEvent) => {
    event.preventDefault()
    if (!query.trim()) return
    if (!supabase) {
      setError('Live search needs a configured Supabase project, a signed-in account, the migration, and the search function deployed with a Brave API key.')
      setSearched(true)
      return
    }
    setBusy(true); setError('')
    try {
      const { data, error: functionError } = await supabase.functions.invoke<SearchResponse>('search-official-sources', {
        body: { query: query.trim(), country },
      })
      if (functionError) throw new Error(functionError.message)
      if (!data || !Array.isArray(data.results) || typeof data.searchedAt !== 'string') throw new Error('The search service returned an invalid response.')
      setResults(data.results); setSearchedAt(data.searchedAt); setCached(data.cached); setSearched(true)
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : 'Search could not be completed.')
      setSearched(true)
    } finally {
      setBusy(false)
    }
  }

  const changeCountry = (value: Country) => {
    setCountry(value)
    setQuery(defaultQueries[value])
    setResults([])
    setSearchedAt('')
    setSearched(false)
    setError('')
  }

  return <div className="space-y-4">
    <section className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
      <div className="font-display text-[13px] font-bold">Official-source research search</div>
      <p className="mt-1 max-w-3xl text-[10px] leading-relaxed text-slate-500">Searches official university, national-study, and scholarship domains only. Search result snippets are leads, not verified facts. Open the cited page and confirm the specific 2027 program and intake before relying on any deadline, funding, or contact detail.</p>
      <form onSubmit={search} className="mt-4 space-y-3">
        <div className="flex flex-wrap gap-2">
          {countries.map(item => <button key={item} type="button" aria-pressed={country === item} onClick={() => changeCountry(item)} className={`rounded-full border px-3 py-1.5 text-[10px] ${country === item ? 'border-teal bg-[#e8f1ec] font-semibold text-teal' : 'border-[#e5e3dc] text-slate-500'}`}>{item}{item === 'Germany' ? ' · Winter 2027/28' : item === 'France' ? ' · Autumn 2027' : ' · Fall 2027'}</button>)}
        </div>
        <label className="block text-[10px] font-medium text-slate-600">Research question
          <textarea required maxLength={240} value={query} onChange={event => setQuery(event.target.value)} rows={3} className="input mt-1.5 w-full resize-y" placeholder="e.g. English-taught MSc computer science labs and funding" />
        </label>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-[9px] text-slate-400">Only your query and country are sent to Brave through the secured server function. Do not include private identifiers.</p>
          <button disabled={busy || !query.trim()} className="rounded-lg bg-ink px-4 py-2 text-[10px] font-semibold text-white disabled:opacity-50"><Search size={13} className="mr-1 inline" />{busy ? 'Searching official sources…' : 'Search official sources'}</button>
        </div>
      </form>
    </section>
    {error && <section role="alert" className="surface rounded-xl border border-[#f0d9d2] bg-[#fff8f5] p-4 text-[10px] leading-relaxed text-[#9b5945]">{error}</section>}
    {searched && !error && <section className="surface rounded-xl border border-[#e7e5de] bg-white p-5">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#eeede8] pb-3"><div className="text-[11px] font-semibold">{results.length} official-domain results</div><div className="text-[9px] text-slate-500">Searched {new Intl.DateTimeFormat('en', { dateStyle: 'medium', timeStyle: 'short', timeZone: timezone }).format(new Date(searchedAt))}{cached ? ' · cached for 15 minutes' : ' · live search'}</div></div>
      {results.length ? <div className="divide-y divide-[#f0efe9]">{results.map(result => <article key={result.url} className="py-4 first:pt-3 last:pb-0"><div className="flex flex-wrap items-start justify-between gap-2"><div className="min-w-0 flex-1"><div className="text-[11px] font-semibold">{result.title}</div><div className="mt-1 text-[9px] text-slate-500">{new URL(result.url).hostname}{result.age ? ` · Search index age: ${result.age}` : ''}</div><p className="mt-2 text-[10px] leading-relaxed text-slate-600">{result.description || 'No search-result summary. Open the official page to review its content.'}</p></div><a href={result.url} target="_blank" rel="noreferrer" className="shrink-0 rounded-lg border border-[#e5e3dc] px-2.5 py-1.5 text-[9px] font-semibold text-teal hover:bg-[#f5f8f5]">Open source <ExternalLink size={10} className="ml-1 inline" /></a></div><p className="mt-2 text-[9px] text-slate-400">Search result only · not yet checked or verified for this intake.</p></article>)}</div> : <p className="py-7 text-center text-[10px] text-slate-500">No results matched the approved official-source domains for this query.</p>}
    </section>}
    <section className="surface rounded-xl border border-[#e7e5de] bg-[#faf9f6] p-4 text-[10px] leading-relaxed text-slate-600">
      <strong>Intake labels matter:</strong> South Korea is tracked as Fall 2027; Germany’s autumn intake is typically labeled Winter Semester 2027/28; France’s exact entry date depends on the program. No calendar deadline is inferred from a search result.
    </section>
  </div>
}
