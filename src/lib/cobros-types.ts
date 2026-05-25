// cobros-types.ts
// Tipos compartidos para el módulo de Gestión de Cobros.

export type Moneda = 'ARS' | 'USD'
export type FormaPago = 'unico' | 'cuotas'
export type EstadoCobro = 'pendiente' | 'parcial' | 'cobrado' | 'cancelado'
export type ProbabilidadLitigio = 'alta' | 'media' | 'baja'
export type TipoCobro = 'directo' | 'litigio'

export interface Cobro {
  id: string
  partner_id: string

  // Clasificación
  tipo: TipoCobro
  concepto: string

  // Cliente (puede ser del sistema o texto libre)
  cliente_id: string | null
  cliente_nombre: string | null

  // Monto
  moneda: Moneda
  monto_total: number

  // Pago directo
  forma_pago: FormaPago | null
  num_cuotas: number | null
  monto_cuota: number | null
  con_interes: boolean
  tasa_interes: number | null   // % mensual
  cuotas_pagadas: number

  // Estado
  estado: EstadoCobro
  monto_cobrado: number
  fecha_vencimiento: string | null  // ISO date YYYY-MM-DD

  // Litigio
  parte_contraria: string | null
  monto_litigio: number | null
  porcentaje_acordado: number | null  // 0-100
  expectativa_cobro: number | null    // calculado: monto_litigio * porcentaje / 100
  probabilidad: ProbabilidadLitigio | null
  etapa_litigio: string | null
  fecha_estimada_resolucion: string | null

  // Área legal
  area: string | null

  // General
  notas: string | null
  created_at: string
  updated_at: string
}

// Payload para crear/actualizar (sin id, partner_id, timestamps)
export type CobroPayload = Omit<Cobro, 'id' | 'partner_id' | 'created_at' | 'updated_at'>

// Respuesta del endpoint de IA (puede ser parcial)
export type CobroParsed = Partial<CobroPayload>
