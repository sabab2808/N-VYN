import { createClient } from 'npm:@supabase/supabase-js@2'

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
}
const bucket = 'private-documents'
const pageSize = 1000
const removalBatchSize = 100

Deno.serve(async request => {
  if (request.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders })
  if (request.method !== 'POST') return json({ error: 'Method not allowed' }, 405)

  const authorization = request.headers.get('Authorization')
  const supabaseUrl = Deno.env.get('SUPABASE_URL')
  const anonKey = Deno.env.get('SUPABASE_ANON_KEY')
  const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')
  if (!authorization) return json({ error: 'Authentication required' }, 401)
  if (!supabaseUrl || !anonKey || !serviceKey) return json({ error: 'Server configuration is incomplete' }, 500)

  const userClient = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authorization } },
    auth: { persistSession: false },
  })
  const { data: authData, error: authError } = await userClient.auth.getUser()
  if (authError || !authData.user) return json({ error: 'Authentication required' }, 401)

  const admin = createClient(supabaseUrl, serviceKey, { auth: { persistSession: false } })
  const { data: paths, error: listError } = await listUserFiles(admin, authData.user.id)
  if (listError) return json({ error: 'Could not list private documents; account was not deleted.', detail: listError }, 500)

  for (let index = 0; index < paths.length; index += removalBatchSize) {
    const { error } = await admin.storage.from(bucket).remove(paths.slice(index, index + removalBatchSize))
    if (error) return json({ error: 'Could not remove private documents; account was not deleted.', detail: error.message }, 500)
  }

  const { error: deleteError } = await admin.auth.admin.deleteUser(authData.user.id)
  if (deleteError) return json({ error: 'Private documents were removed, but account deletion failed.', detail: deleteError.message }, 500)
  return json({ deleted: true }, 200)
})

async function listUserFiles(client: ReturnType<typeof createClient>, userId: string) {
  const files: string[] = []
  const pending = [userId]

  while (pending.length) {
    const folder = pending.pop()!
    let offset = 0
    while (true) {
      const { data, error } = await client.storage.from(bucket).list(folder, { limit: pageSize, offset })
      if (error) return { paths: files, error: error.message }
      for (const entry of data ?? []) {
        if (!entry.name || entry.name === '.' || entry.name === '..') continue
        const path = `${folder}/${entry.name}`
        if (entry.id) files.push(path)
        else pending.push(path)
      }
      if (!data || data.length < pageSize) break
      offset += data.length
    }
  }

  return { paths: files, error: null }
}

function json(body: Record<string, unknown>, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  })
}
