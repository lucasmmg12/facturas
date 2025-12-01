import { createContext, useContext, useEffect, useState } from 'react';
import { supabase } from '../lib/supabase';
import type { User } from '@supabase/supabase-js';
import type { Database } from '../lib/database.types';
import type { UserRole } from '../lib/database.types';

type UserProfile = Database['public']['Tables']['users']['Row'];

interface AuthContextType {
  user: User | null;
  profile: UserProfile | null;
  loading: boolean;
  signIn: (email: string, password: string) => Promise<void>;
  signUp: (email: string, password: string, fullName: string, role: string) => Promise<void>;
  signOut: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType>({
  user: null,
  profile: null,
  loading: true,
  signIn: async () => {},
  signUp: async () => {},
  signOut: async () => {},
});

export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setLoading(false);
      }
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, session) => {
      setUser(session?.user ?? null);
      if (session?.user) {
        loadProfile(session.user.id);
      } else {
        setProfile(null);
        setLoading(false);
      }
    });

    return () => subscription.unsubscribe();
  }, []);

  const loadProfile = async (authUserId: string) => {
    try {
      const { data, error } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authUserId)
        .maybeSingle();

      if (error) throw error;
      setProfile(data);
    } catch (error) {
      console.error('Error loading profile:', error);
    } finally {
      setLoading(false);
    }
  };

  const signIn = async (email: string, password: string) => {
    try {
      const { data, error } = await supabase.auth.signInWithPassword({
        email,
        password,
      });

      if (error) {
        console.error('[Auth] Error al iniciar sesión:', error);
        throw error;
      }

      // Después de iniciar sesión, verificar que el perfil existe
      if (data.user) {
        // Esperar un momento para que se cargue el perfil
        await new Promise(resolve => setTimeout(resolve, 300));
        
        const { data: profile, error: profileError } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', data.user.id)
          .maybeSingle();

        if (profileError) {
          console.error('[Auth] Error al cargar perfil después de iniciar sesión:', profileError);
        }

        // Si no hay perfil, intentar crearlo (puede pasar si el trigger falló)
        if (!profile && data.user.email) {
          console.log('[Auth] No se encontró perfil, intentando crearlo...');
          const { error: createError } = await supabase
            .from('users')
            .insert({
              auth_user_id: data.user.id,
              email: data.user.email,
              full_name: data.user.user_metadata?.full_name || 'Usuario',
              role: (data.user.user_metadata?.role as UserRole) || 'REVISION',
            });

          if (createError) {
            console.error('[Auth] Error al crear perfil después de iniciar sesión:', createError);
            // No lanzar error aquí, solo loguear, porque el usuario ya está autenticado
          }
        }
      }
    } catch (error: any) {
      console.error('[Auth] Error completo en signIn:', error);
      throw error;
    }
  };

  const signUp = async (email: string, password: string, fullName: string, role: string) => {
    try {
      // 1. Registrar usuario en Supabase Auth
      const { data: authData, error: authError } = await supabase.auth.signUp({
        email,
        password,
        options: {
          data: {
            full_name: fullName,
            role: role,
          },
        },
      });

      if (authError) {
        console.error('[Auth] Error al registrar usuario:', authError);
        throw authError;
      }

      if (!authData.user) {
        throw new Error('No se pudo crear el usuario. Por favor, intenta nuevamente.');
      }

      // 2. Esperar un momento para que el trigger se ejecute (si está activo)
      await new Promise(resolve => setTimeout(resolve, 500));

      // 3. Verificar si el perfil ya fue creado por el trigger
      const { data: existingProfile, error: checkError } = await supabase
        .from('users')
        .select('*')
        .eq('auth_user_id', authData.user.id)
        .maybeSingle();

      if (existingProfile) {
        console.log('[Auth] Perfil ya existe (creado por trigger)');
        return; // El trigger ya creó el perfil, todo está bien
      }

      // 4. Si el perfil no existe, intentar crearlo manualmente
      // Nota: Esto solo funcionará si el usuario está autenticado (email confirmado)
      // Si el email requiere confirmación, el trigger debería crear el perfil
      const { data: profileData, error: profileError } = await supabase
        .from('users')
        .insert({
          auth_user_id: authData.user.id,
          email: email,
          full_name: fullName,
          role: role as UserRole,
        })
        .select()
        .single();

      if (profileError) {
        console.error('[Auth] Error al crear perfil:', profileError);
        
        // Si el error es de duplicado, verificar nuevamente
        if (profileError.code === '23505' || profileError.message.includes('duplicate')) {
          console.log('[Auth] Perfil duplicado, verificando nuevamente...');
          const { data: finalProfile } = await supabase
            .from('users')
            .select('*')
            .eq('auth_user_id', authData.user.id)
            .maybeSingle();
          
          if (finalProfile) {
            console.log('[Auth] Perfil encontrado después de verificación');
            return;
          }
        }
        
        // Si el error es de permisos (RLS), el trigger debería crear el perfil
        if (profileError.code === '42501' || profileError.message.includes('permission') || profileError.message.includes('policy')) {
          console.log('[Auth] Error de permisos al crear perfil manualmente. El trigger debería crear el perfil automáticamente.');
          // Esperar un poco más y verificar nuevamente
          await new Promise(resolve => setTimeout(resolve, 1000));
          const { data: triggerProfile } = await supabase
            .from('users')
            .select('*')
            .eq('auth_user_id', authData.user.id)
            .maybeSingle();
          
          if (triggerProfile) {
            console.log('[Auth] Perfil creado por trigger después de esperar');
            return;
          }
          
          throw new Error('El perfil no se pudo crear. Por favor, verifica tu email y luego intenta iniciar sesión. Si el problema persiste, contacta a soporte.');
        }
        
        throw new Error(`Error al crear el perfil: ${profileError.message}`);
      }

      if (!profileData) {
        throw new Error('No se pudo crear el perfil de usuario. Por favor, intenta nuevamente.');
      }

      console.log('[Auth] Usuario y perfil creados exitosamente');
    } catch (error: any) {
      console.error('[Auth] Error completo en signUp:', error);
      throw error;
    }
  };

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
  };

  return (
    <AuthContext.Provider value={{ user, profile, loading, signIn, signUp, signOut }}>
      {children}
    </AuthContext.Provider>
  );
}

export const useAuth = () => useContext(AuthContext);
