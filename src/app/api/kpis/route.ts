import { ok, handleError } from '@/lib/api-response'
import { createSupabaseServer } from '@/lib/supabase/server'

export async function GET() {
  try {
    const db = createSupabaseServer()
    const [{ data: byDay, error: e1 }, { data: byStatus, error: e2 }, { data: conversion, error: e3 }] =
      await Promise.all([
        db.from('v_kpi_daily').select('*').limit(30),
        db.from('v_kpi_status').select('*'),
        db.from('v_kpi_conversion').select('*').maybeSingle(),
      ])

    if (e1) throw new Error(e1.message)
    if (e2) throw new Error(e2.message)
    if (e3) throw new Error(e3.message)

    return ok({ byDay, byStatus, conversion })
  } catch (e) {
    return handleError(e)
  }
}
