export type Rol = 'zonda' | 'partner' | 'cliente';

export interface Perfil {
  id: string;
  rol: Rol;
  nombre: string;
  primer_login: boolean;
  abogado_id?: string | null;
  created_at: string;
}

export interface Tramite {
  id: string;
  cliente_id: string;
  abogado_id: string;
  tipo: string;
  estado: string;
  fecha_creacion: string;
}