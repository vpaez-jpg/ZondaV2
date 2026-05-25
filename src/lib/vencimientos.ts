// lib/vencimientos.ts
// Tipos y utilidades para gestión de vencimientos procesales locales.
// Los eventos se persisten en localStorage para sobrevivir recargas de página.

export interface Vencimiento {
  id: string
  titulo: string
  fecha: string         // 'YYYY-MM-DD' — día de vencimiento
  nota: string          // descripción libre del vencimiento
  fechaRecordatorio: string  // 'YYYY-MM-DD' — N días hábiles antes
  diasHabiles: number   // días hábiles que se contaron
  createdAt: string
}

const STORAGE_KEY = 'zonda_vencimientos_v1'

export function leerVencimientos(): Vencimiento[] {
  if (typeof window === 'undefined') return []
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? (JSON.parse(raw) as Vencimiento[]) : []
  } catch {
    return []
  }
}

export function guardarVencimientos(lista: Vencimiento[]): void {
  if (typeof window === 'undefined') return
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(lista))
    // Emitir evento para que otros componentes en la misma pestaña se actualicen
    window.dispatchEvent(new Event('zonda_vencimientos_change'))
  } catch {
    // Silenciar errores de cuota
  }
}

export function agregarVencimiento(v: Vencimiento): void {
  const lista = leerVencimientos()
  guardarVencimientos([...lista, v])
}

export function eliminarVencimiento(id: string): void {
  const lista = leerVencimientos().filter(v => v.id !== id)
  guardarVencimientos(lista)
}
