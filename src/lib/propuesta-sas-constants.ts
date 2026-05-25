/**
 * Constantes y tipos de la propuesta SAS.
 * Este archivo NO importa módulos de Node.js y es seguro para usar en Client Components.
 */

// ── Costos fijos según plantilla de propuesta ──────────────────
export const TASA_CONSTITUCION_SAS   = 330_000   // código #840
export const TASA_RESERVA_DEN_SAS    =  27_000   // código #833
export const CAJA_FORENSE_SAS        =  31_000
export const GASTOS_CONSTITUCION_SAS = TASA_CONSTITUCION_SAS + TASA_RESERVA_DEN_SAS + CAJA_FORENSE_SAS // 388 000

export const LIBROS_SOCIETARIOS_SAS  = 100_000   // aprox.
export const TASA_RUBRICA_SAS        =  95_000   // 5 × $19.000 código #832
export const GASTOS_RUBRICA_SAS      = LIBROS_SOCIETARIOS_SAS + TASA_RUBRICA_SAS // 195 000

export const HONORARIOS_RECOMENDADOS_SAS = 800_000
export const CORTE_ZONDA_SAS             = 100_000

// ── Interfaces ─────────────────────────────────────────────────
export interface DatosPropuestaSAS {
  honorarios: number
  corte_zonda: number
  gastos_constitucion: number
  gastos_rubrica: number
  total_propuesta: number   // honorarios + gastos_constitucion (rúbrica se paga al final)
}

// ── Helpers ────────────────────────────────────────────────────
export function arsSAS(n: number): string {
  return '$' + Math.round(n).toLocaleString('es-AR')
}
