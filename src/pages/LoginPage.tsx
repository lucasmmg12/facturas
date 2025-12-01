// Esta página maneja el inicio de sesión y registro de usuarios.
// Diseño futurista con colores de Grow Labs (verde y blanco)

import { useState } from 'react';
import { useAuth } from '../contexts/AuthContext';
import { Sparkles, Lock, Mail } from 'lucide-react';

export function LoginPage() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  const { signIn } = useAuth();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setLoading(true);

    try {
      await signIn(email, password);
    } catch (err: any) {
      console.error('Error en autenticación:', err);
      
      // Mensajes de error más amigables
      let errorMessage = 'Ocurrió un error';
      
      if (err.message) {
        errorMessage = err.message;
      } else if (err.error?.message) {
        errorMessage = err.error.message;
      }
      
      // Traducir errores comunes de Supabase
      if (errorMessage.includes('User already registered') || errorMessage.includes('already registered')) {
        errorMessage = 'Este email ya está registrado. Por favor, inicia sesión.';
      } else if (errorMessage.includes('Invalid login credentials') || errorMessage.includes('Invalid credentials')) {
        errorMessage = 'Email o contraseña incorrectos. Verifica tus credenciales.';
      } else if (errorMessage.includes('Email rate limit exceeded') || errorMessage.includes('rate limit')) {
        errorMessage = 'Demasiados intentos. Por favor, espera unos minutos antes de intentar nuevamente.';
      } else if (errorMessage.includes('Password should be at least') || errorMessage.includes('password')) {
        errorMessage = 'La contraseña debe tener al menos 6 caracteres';
      } else if (errorMessage.includes('duplicate key') || errorMessage.includes('duplicate')) {
        errorMessage = 'Este email ya está registrado. Por favor, inicia sesión.';
      } else if (errorMessage.includes('Email not confirmed') || errorMessage.includes('email confirmation')) {
        errorMessage = 'Por favor, verifica tu email antes de iniciar sesión. Revisa tu bandeja de entrada.';
      } else if (errorMessage.includes('permission') || errorMessage.includes('policy') || errorMessage.includes('RLS')) {
        errorMessage = 'Error de permisos. El perfil se creará automáticamente. Por favor, intenta iniciar sesión.';
      } else if (errorMessage.includes('network') || errorMessage.includes('fetch')) {
        errorMessage = 'Error de conexión. Por favor, verifica tu conexión a internet e intenta nuevamente.';
      }
      
      setError(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div 
      className="min-h-screen relative flex items-center justify-center p-4 overflow-hidden"
      style={{
        backgroundImage: 'url(/fondogrow.png)',
        backgroundSize: 'cover',
        backgroundPosition: 'center',
        backgroundRepeat: 'no-repeat',
      }}
    >
      {/* Overlay oscuro para mejorar contraste */}
      <div className="absolute inset-0 bg-black/60 backdrop-blur-sm"></div>
      
      {/* Efectos de luz verde */}
      <div className="absolute top-20 left-20 w-96 h-96 bg-green-500/20 rounded-full blur-3xl animate-pulse"></div>
      <div className="absolute bottom-20 right-20 w-96 h-96 bg-green-400/20 rounded-full blur-3xl animate-pulse delay-1000"></div>

      <div className="max-w-md w-full relative z-10">
        {/* Logo y título */}
        <div className="text-center mb-8">
          <div className="flex justify-center mb-6">
            <img 
              src="/logogrow.png" 
              alt="Grow Labs" 
              className="h-24 w-auto drop-shadow-2xl"
              style={{
                filter: 'drop-shadow(0 0 20px rgba(34, 197, 94, 0.5))'
              }}
            />
          </div>
          <h1 className="text-4xl font-bold text-white mb-2 tracking-tight">
            <span className="bg-gradient-to-r from-green-400 to-emerald-300 bg-clip-text text-transparent">
              Grow Labs
            </span>
          </h1>
          <p className="text-gray-300 text-lg flex items-center justify-center gap-2">
            <Sparkles className="h-4 w-4 text-green-400" />
            Sistema de Gestión Inteligente
          </p>
        </div>

        {/* Card principal con efecto glassmorphism */}
        <div 
          className="relative rounded-2xl shadow-2xl overflow-hidden"
          style={{
            background: 'rgba(255, 255, 255, 0.1)',
            backdropFilter: 'blur(20px)',
            border: '1px solid rgba(255, 255, 255, 0.2)',
            boxShadow: '0 8px 32px 0 rgba(34, 197, 94, 0.3)',
          }}
        >
          {/* Borde brillante animado */}
          <div 
            className="absolute inset-0 rounded-2xl"
            style={{
              background: 'linear-gradient(45deg, transparent, rgba(34, 197, 94, 0.3), transparent)',
              animation: 'borderGlow 3s ease-in-out infinite',
            }}
          ></div>

          <div className="relative p-8">

            {/* Error message */}
            {error && (
              <div 
                className="mb-4 p-4 rounded-lg text-red-200 text-sm border border-red-400/50"
                style={{
                  background: 'rgba(239, 68, 68, 0.2)',
                  backdropFilter: 'blur(10px)',
                }}
              >
                {error}
              </div>
            )}

            {/* Formulario */}
            <form onSubmit={handleSubmit} className="space-y-5">
              <div>
                <label className="block text-sm font-semibold text-green-300 mb-2 flex items-center gap-2">
                  <Mail className="h-4 w-4" />
                  Email
                </label>
                <input
                  type="email"
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  required
                  className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-400 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-400"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                  }}
                  placeholder="tu@email.com"
                />
              </div>

              <div>
                <label className="block text-sm font-semibold text-green-300 mb-2 flex items-center gap-2">
                  <Lock className="h-4 w-4" />
                  Contraseña
                </label>
                <input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  required
                  minLength={6}
                  className="w-full px-4 py-3 rounded-lg text-white placeholder-gray-400 transition-all duration-300 focus:outline-none focus:ring-2 focus:ring-green-400"
                  style={{
                    background: 'rgba(0, 0, 0, 0.3)',
                    border: '1px solid rgba(34, 197, 94, 0.3)',
                  }}
                  placeholder="••••••••"
                />
              </div>

              <button
                type="submit"
                disabled={loading}
                className="w-full py-4 bg-gradient-to-r from-green-500 to-emerald-500 text-white rounded-lg font-bold text-lg transition-all duration-300 hover:shadow-xl hover:shadow-green-500/50 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100 relative overflow-hidden group"
              >
                {/* Efecto de brillo en hover */}
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent transform -translate-x-full group-hover:translate-x-full transition-transform duration-1000"></div>
                <span className="relative flex items-center justify-center gap-2">
                  {loading ? (
                    <>
                      <div className="animate-spin rounded-full h-5 w-5 border-2 border-white border-t-transparent"></div>
                      Procesando...
                    </>
                  ) : (
                    <>
                      <Sparkles className="h-5 w-5" />
                      Iniciar Sesión
                    </>
                  )}
                </span>
              </button>
            </form>

            {/* Footer text */}
            <div className="mt-6 text-center">
              <p className="text-gray-400 text-sm">
                Powered by{' '}
                <span className="text-green-400 font-semibold">Grow Labs</span>
              </p>
            </div>
          </div>
        </div>

        {/* Decoración inferior */}
        <div className="mt-8 flex justify-center gap-2">
          <div className="w-2 h-2 rounded-full bg-green-500 animate-pulse"></div>
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse delay-150"></div>
          <div className="w-2 h-2 rounded-full bg-green-300 animate-pulse delay-300"></div>
        </div>
      </div>

      <style>{`
        @keyframes borderGlow {
          0%, 100% {
            opacity: 0.3;
          }
          50% {
            opacity: 0.8;
          }
        }
        
        .delay-150 {
          animation-delay: 150ms;
        }
        
        .delay-300 {
          animation-delay: 300ms;
        }
        
        .delay-1000 {
          animation-delay: 1000ms;
        }
      `}</style>
    </div>
  );
}
