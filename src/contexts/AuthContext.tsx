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
    const { error } = await supabase.auth.signInWithPassword({
      email,
      password,
    });

    if (error) throw error;
  };

  const signUp = async (email: string, password: string, fullName: string, role: string) => {
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

    // 2. Crear perfil en la tabla users manualmente
    // Esto es más confiable que depender solo del trigger
    const { data: profileData, error: profileError } = await supabase
      .from('users')
      .insert({
        auth_user_id: authData.user.id,
        email: email,
        full_name: fullName,
        role: role as UserRole, // Cast al tipo UserRole
      })
      .select()
      .single();

    if (profileError) {
      console.error('[Auth] Error al crear perfil:', profileError);
      
      // Si el error es que el usuario ya existe (por el trigger), intentar cargarlo
      if (profileError.code === '23505' || profileError.message.includes('duplicate')) {
        console.log('[Auth] El perfil ya existe (probablemente creado por trigger), cargando...');
        const { data: existingProfile, error: loadError } = await supabase
          .from('users')
          .select('*')
          .eq('auth_user_id', authData.user.id)
          .maybeSingle();

        if (loadError) {
          console.error('[Auth] Error al cargar perfil existente:', loadError);
          throw new Error('Error al crear el perfil de usuario. Por favor, contacta a soporte.');
        }

        if (existingProfile) {
          console.log('[Auth] Perfil cargado exitosamente');
          return; // El perfil ya existe, todo está bien
        }
      }
      
      throw new Error(`Error al crear el perfil: ${profileError.message}`);
    }

    if (!profileData) {
      throw new Error('No se pudo crear el perfil de usuario. Por favor, intenta nuevamente.');
    }

    console.log('[Auth] Usuario y perfil creados exitosamente');
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
