import { LogOut, User, LayoutGrid } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface DashboardLayoutProps {
  title: string;
  children: React.ReactNode;
}

export function DashboardLayout({ title, children }: DashboardLayoutProps) {
  const { profile, signOut } = useAuth();

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  return (
    <div className="min-h-screen relative bg-black text-white font-sans selection:bg-grow-neon/30">
      {/* Background Ambience */}
      <div className="fixed inset-0 pointer-events-none overflow-hidden">
        <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-grow-neon/5 blur-[120px] rounded-full animate-pulse" />
        <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-blue-500/5 blur-[120px] rounded-full animate-pulse" style={{ animationDelay: '2s' }} />
      </div>

      {/* Navigation Header */}
      <header className="sticky top-0 z-50 bg-black/40 backdrop-blur-xl border-b border-white/5">
        <div className="max-w-screen-2xl mx-auto px-6 h-20 flex items-center justify-between">
          <div className="flex items-center gap-6">
            <div className="relative group">
              <div className="absolute -inset-2 bg-grow-neon/20 blur-xl opacity-0 group-hover:opacity-100 transition-all duration-500 rounded-full" />
              <img
                src="/logogrow.png"
                alt="Grow Labs"
                className="h-10 w-auto relative grayscale group-hover:grayscale-0 transition-all duration-500"
              />
            </div>
            <div className="h-8 w-[1px] bg-white/10 hidden sm:block" />
            <h1 className="text-sm font-black uppercase tracking-[0.3em] text-white/50 hidden sm:block">
              {title}
            </h1>
          </div>

          <div className="flex items-center gap-4">
            <div className="flex items-center gap-3 bg-white/5 border border-white/10 rounded-full px-5 py-2 group hover:border-grow-neon/30 transition-all">
              <div className="w-8 h-8 rounded-full bg-grow-neon/10 flex items-center justify-center border border-grow-neon/20">
                <User className="h-4 w-4 text-grow-neon" />
              </div>
              <div className="flex flex-col">
                <span className="text-xs font-black text-white leading-none tracking-tight">{profile?.full_name}</span>
                <span className="text-[9px] font-bold text-grow-neon uppercase tracking-widest mt-0.5">{profile?.role}</span>
              </div>
            </div>

            <button
              onClick={handleSignOut}
              className="p-3 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 text-red-500 rounded-full transition-all group"
              title="Cerrar Sesión"
            >
              <LogOut className="h-4 w-4 group-hover:scale-110 transition-transform" />
            </button>
          </div>
        </div>
      </header>

      {/* Main Content Area */}
      <main className="relative z-10 max-w-screen-2xl mx-auto px-6 py-12">
        <div className="flex items-center gap-4 mb-12">
          <div className="p-3 bg-grow-neon/10 border border-grow-neon/20 rounded-2xl">
            <LayoutGrid className="w-6 h-6 text-grow-neon" />
          </div>
          <div>
            <h2 className="text-3xl font-black text-white tracking-tighter uppercase">{title.split('·')[0]}</h2>
            <p className="text-xs font-bold text-grow-muted uppercase tracking-[0.4em] mt-1">SISTEMA OPERATIVO INTELIGENTE</p>
          </div>
        </div>
        {children}
      </main>
    </div>
  );
}

