import { SupabaseRepository, supabase } from './supabase'
import { LocalRepository } from './local'
import type { Repository } from './types'

export type { Repository }

/** Выбор хранилища: Supabase (если настроен и есть сессия) или локальная IndexedDB. */
export function createRepository(userId: string | null): Repository {
  if (supabase && userId) return new SupabaseRepository(supabase, userId)
  return new LocalRepository()
}
