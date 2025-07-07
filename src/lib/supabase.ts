import { createClient } from '@supabase/supabase-js'

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!
const supabaseAnonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!

export const supabase = createClient(supabaseUrl, supabaseAnonKey)

// Database types
export interface Game {
  id: string
  rawg_id: number
  title: string
  release_date: string | null
  genres: string[]
  platforms: string[]
  short_description: string | null
  price_usd: number | null
  critic_score: number | null
  steam_appid: number | null
  updated_at: string
}

export interface StoreLink {
  game_id: string
  store: string
  url: string
}

export interface GameVector {
  game_id: string
  embedding: number[]
}

export interface SyncCheckpoint {
  source: string
  last_run: string | null
}

export interface ClickLog {
  id: string
  game_id: string
  store: string
  clicked_at: string
}