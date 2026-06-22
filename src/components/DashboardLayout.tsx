import { useState } from 'react';
import { Sidebar } from './Sidebar';
import { ChevronRight, LogOut, KeyRound } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';

interface DashboardLayoutProps {
  title: string;
  children: React.ReactNode;
  onViewChange?: (view: string) => void;
}

export function DashboardLayout({ title, children, onViewChange }: DashboardLayoutProps) {
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const { profile, signOut } = useAuth();
  
  // Default to "Facturas" view initially or parse from route
  const activeView = title.toLowerCase().includes('factura') ? 'invoices' : 'dashboard';

  const handleSignOut = async () => {
    try {
      await signOut();
    } catch (error) {
      console.error('Error al cerrar sesión:', error);
    }
  };

  const handleViewChange = (view: string) => {
    if (onViewChange) {
      onViewChange(view);
    } else {
      console.log("Navigating to view:", view);
    }
  };

  return (
    <div className="app">
      <Sidebar
        collapsed={sidebarCollapsed}
        onToggle={() => setSidebarCollapsed(prev => !prev)}
        activeView={activeView}
        onViewChange={handleViewChange}
      />

      <main className={`main ${sidebarCollapsed ? 'main--expanded' : ''}`}>
        {/* Top Bar */}
        <header className="topbar" style={{ flexShrink: 0 }}>
          {/* Background video */}
          <div className="topbar__video-bg">
            <video
              src="/Blue_drop_moving_left_right_202606091400.mp4"
              autoPlay
              loop
              muted
              playsInline
            />
          </div>
          
          <div className="topbar__left">
            <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
              <h1 className="topbar__title topbar__title--wave">
                {'Facturación'.split('').map((char, i) => (
                  <span key={`f-${i}`} className="topbar__wave-letter topbar__title-accent" style={{ animationDelay: `${i * 0.08}s` }}>{char === ' ' ? '\u00A0' : char}</span>
                ))}
                <span className="topbar__wave-letter" style={{ animationDelay: `${11 * 0.08}s` }}>&nbsp;</span>
                {'Sanatorio Argentino'.split('').map((char, i) => (
                  <span key={`s-${i}`} className="topbar__wave-letter" style={{ animationDelay: `${(12 + i) * 0.08}s` }}>{char === ' ' ? '\u00A0' : char}</span>
                ))}
              </h1>
              
              <span style={{ display: 'flex', alignItems: 'center', gap: '4px', fontSize: '0.8rem', color: 'var(--neutral-600)', fontWeight: 500 }}>
                <ChevronRight size={14} />
                <span style={{ color: 'var(--primary-700)', fontWeight: 600 }}>{title}</span>
              </span>
            </div>
            <span className="topbar__subtitle">Sistema de gestión integral</span>
          </div>

          <div className="topbar__right" style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
            <span className="topbar__date">
              {new Date().toLocaleDateString('es-AR', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' })}
            </span>
            {/* User Badge + Logout */}
            <div style={{
              display: 'flex', alignItems: 'center', gap: '8px',
              padding: '4px 4px 4px 12px',
              background: 'var(--neutral-50)',
              borderRadius: '20px',
              border: '1px solid var(--neutral-200)',
            }}>
              <span style={{
                fontSize: '0.78rem', fontWeight: 600,
                color: 'var(--neutral-600)',
              }}>
                {profile?.full_name || 'Usuario'}
              </span>
              <div style={{
                width: '28px', height: '28px', borderRadius: '50%',
                background: 'linear-gradient(135deg, #6366F1, #4F46E5)',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: '0.65rem', fontWeight: 800, color: '#fff',
              }}>
                {profile?.full_name ? profile.full_name.substring(0, 2).toUpperCase() : 'US'}
              </div>
              <button
                onClick={handleSignOut}
                title="Cerrar sesión"
                style={{
                  width: '28px', height: '28px', borderRadius: '50%',
                  background: 'none', border: '1px solid var(--neutral-200)',
                  display: 'flex', alignItems: 'center', justifyContent: 'center',
                  cursor: 'pointer', color: 'var(--neutral-600)',
                  transition: 'all 0.2s',
                }}
                onMouseOver={e => { e.currentTarget.style.background = '#FEE2E2'; e.currentTarget.style.color = '#DC2626'; e.currentTarget.style.borderColor = '#FCA5A5'; }}
                onMouseOut={e => { e.currentTarget.style.background = 'none'; e.currentTarget.style.color = 'var(--neutral-400)'; e.currentTarget.style.borderColor = 'var(--neutral-200)'; }}
              >
                <LogOut size={13} />
              </button>
            </div>
          </div>
        </header>

        {/* Main Content Area */}
        <div className="content view-transition-enter">
          {children}
        </div>
      </main>
    </div>
  );
}

