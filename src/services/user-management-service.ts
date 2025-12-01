import { supabase } from '../lib/supabase';
import type { UserRole } from '../lib/database.types';

export interface CreateUserData {
  email: string;
  password: string;
  full_name: string;
  role: UserRole;
}

export interface UserProfile {
  id: string;
  auth_user_id: string | null;
  email: string;
  full_name: string;
  role: UserRole;
  active: boolean;
  created_at: string;
}

/**
 * Crear un nuevo usuario (solo para usuarios con rol REVISION)
 */
export async function createUser(userData: CreateUserData): Promise<UserProfile> {
  // 1. Crear usuario en Supabase Auth usando signUp normal
  // Nota: Si tienes acceso a service_role, puedes usar admin.createUser
  const { data: authData, error: authError } = await supabase.auth.signUp({
    email: userData.email,
    password: userData.password,
    options: {
      data: {
        full_name: userData.full_name,
        role: userData.role,
      },
      email_redirect_to: undefined, // No enviar email de confirmación
    },
  });

  if (authError) {
    console.error('[User Management] Error al crear usuario en Auth:', authError);
    throw new Error(`Error al crear usuario: ${authError.message}`);
  }

  if (!authData.user) {
    throw new Error('No se pudo crear el usuario en Auth');
  }

  // 2. Esperar un momento para que el trigger se ejecute (si está activo)
  await new Promise(resolve => setTimeout(resolve, 1000));

  // 3. Verificar si el perfil fue creado por el trigger
  const { data: existingProfile, error: checkError } = await supabase
    .from('users')
    .select('*')
    .eq('auth_user_id', authData.user.id)
    .maybeSingle();

  if (existingProfile) {
    // Si el trigger creó el perfil, actualizar el rol si es necesario
    if (existingProfile.role !== userData.role) {
      const { data: updatedProfile, error: updateError } = await supabase
        .from('users')
        .update({ role: userData.role })
        .eq('id', existingProfile.id)
        .select()
        .single();

      if (updateError) {
        console.error('[User Management] Error al actualizar rol:', updateError);
      } else {
        return updatedProfile;
      }
    }
    return existingProfile;
  }

  // 4. Si el trigger no funcionó, crear el perfil manualmente
  // (Esto solo funcionará si el usuario actual tiene rol REVISION)
  const { data: profileData, error: profileError } = await supabase
    .from('users')
    .insert({
      auth_user_id: authData.user.id,
      email: userData.email,
      full_name: userData.full_name,
      role: userData.role,
    })
    .select()
    .single();

  if (profileError) {
    console.error('[User Management] Error al crear perfil:', profileError);
    throw new Error(`Error al crear perfil: ${profileError.message}`);
  }

  if (!profileData) {
    throw new Error('No se pudo crear el perfil del usuario');
  }

  return profileData;
}

/**
 * Listar todos los usuarios (solo para usuarios con rol REVISION)
 */
export async function listUsers(): Promise<UserProfile[]> {
  const { data, error } = await supabase
    .from('users')
    .select('*')
    .order('created_at', { ascending: false });

  if (error) {
    console.error('[User Management] Error al listar usuarios:', error);
    throw error;
  }

  return data || [];
}

/**
 * Actualizar usuario (solo para usuarios con rol REVISION)
 */
export async function updateUser(
  userId: string,
  updates: Partial<Pick<UserProfile, 'full_name' | 'role' | 'active'>>
): Promise<UserProfile> {
  const { data, error } = await supabase
    .from('users')
    .update(updates)
    .eq('id', userId)
    .select()
    .single();

  if (error) {
    console.error('[User Management] Error al actualizar usuario:', error);
    throw error;
  }

  if (!data) {
    throw new Error('No se pudo actualizar el usuario');
  }

  return data;
}

