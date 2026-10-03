import {createClient} from '@supabase/supabase-js'
export const SUPA_URL = 'https://frtajvbdiwfbbhewxjfl.supabase.co'
export const SUPA_KEY = 'sb_publishable_bK6wCmbW43P5RZRVsfLs4Q_pOF4BJNA'
export const supabase = createClient(SUPA_URL, SUPA_KEY)
