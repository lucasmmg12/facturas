import { useState } from 'react';
import { Home, Receipt, Settings, PanelLeftClose, PanelLeft, FilePlus } from 'lucide-react';

interface SidebarProps {
  collapsed: boolean;
  onToggle: () => void;
  activeView: string;
  onViewChange: (view: string) => void;
}

export function Sidebar({ collapsed, onToggle, activeView, onViewChange }: SidebarProps) {
  return (
    <aside className={`sidebar ${collapsed ? 'sidebar--collapsed' : ''}`}>
      {/* Animated video background */}
      <div className="sidebar__video-bg">
        <video
          src="/anima_la_imagen_202606091409.mp4"
          autoPlay
          loop
          muted
          playsInline
        />
      </div>
      <div className="sidebar__brand">
        <div className="sidebar__logo">
          <img src="/logosanatorio.png" alt="Sanatorio Argentino" className="sidebar__logo-img" style={{ width: collapsed ? 32 : 38, height: collapsed ? 32 : 38, borderRadius: '8px', objectFit: 'contain' }} />
          {!collapsed && (
            <div className="sidebar__brand-text animate-fade-in">
              <span className="sidebar__brand-name" style={{ display: 'flex' }}>
                {'Sanatorio'.split('').map((char, i) => (
                  <span key={i} style={{ display: 'inline-block', animation: 'title-wave 3s ease-in-out infinite', animationDelay: `${i * 0.08}s` }}>{char}</span>
                ))}
              </span>
              <span className="sidebar__brand-sub" style={{ display: 'flex' }}>
                {'Argentino'.split('').map((char, i) => (
                  <span key={i} style={{ display: 'inline-block', animation: 'title-wave 3s ease-in-out infinite', animationDelay: `${(i + 9) * 0.08}s` }}>{char}</span>
                ))}
              </span>
            </div>
          )}
        </div>
        <button
          className="sidebar__toggle"
          onClick={onToggle}
          aria-label={collapsed ? 'Expandir menú' : 'Colapsar menú'}
        >
          {collapsed ? <PanelLeft size={18} /> : <PanelLeftClose size={18} />}
        </button>
      </div>

      <nav className="sidebar__nav">
        {[
          { id: 'dashboard', label: 'Inicio', icon: Home },
          { id: 'invoices', label: 'Facturas', icon: Receipt },
          { id: 'new_invoice', label: 'Nueva Factura', icon: FilePlus },
          { id: 'settings', label: 'Configuración', icon: Settings },
        ].map(item => {
          const Icon = item.icon;
          const isActive = activeView === item.id;
          return (
            <button
              key={item.id}
              className={`sidebar__item ${isActive ? 'sidebar__item--active' : ''}`}
              onClick={() => onViewChange(item.id)}
              title={collapsed ? item.label : undefined}
            >
              <Icon size={20} className="sidebar__item-icon" />
              {!collapsed && <span className="sidebar__item-label">{item.label}</span>}
              {isActive && <div className="sidebar__item-indicator" />}
            </button>
          );
        })}
      </nav>

      <div className="sidebar__footer" style={{ padding: collapsed ? '12px 0' : '16px', display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '8px' }}>
        {/* ─── Simon IA Animated Avatar ─── */}
        <button
          title={collapsed ? 'Simon IA' : undefined}
          style={{
            background: 'none', border: 'none', cursor: 'pointer',
            padding: 0, position: 'relative',
            width: collapsed ? 44 : 64, height: collapsed ? 44 : 64,
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            transition: 'all 0.3s ease',
          }}
        >
          {/* Outer breathing glow */}
          <div style={{
            position: 'absolute', inset: -4,
            borderRadius: '50%',
            background: 'radial-gradient(circle, rgba(99,102,241,0.25) 0%, transparent 70%)',
            animation: 'beto-breathe 3s ease-in-out infinite',
          }} />
          {/* Orbiting ring 1 */}
          <div style={{
            position: 'absolute', inset: -3,
            borderRadius: '50%',
            border: '1.5px solid rgba(129,140,248,0.35)',
            animation: 'beto-orbit 8s linear infinite',
          }} />
          {/* Orbiting ring 2 (counter-rotate) */}
          <div style={{
            position: 'absolute', inset: -7,
            borderRadius: '50%',
            border: '1px dashed rgba(165,180,252,0.25)',
            animation: 'beto-orbit-reverse 12s linear infinite',
          }} />
          {/* Pulsing dot on ring */}
          <div style={{
            position: 'absolute',
            width: 6, height: 6, borderRadius: '50%',
            background: '#818CF8',
            boxShadow: '0 0 8px rgba(129,140,248,0.8)',
            top: -5, left: '50%', marginLeft: -3,
            animation: 'beto-orbit 8s linear infinite',
            transformOrigin: `3px ${(collapsed ? 44 : 64) / 2 + 5}px`,
          }} />
          {/* Avatar image with glassmorphism border */}
          <div style={{
            width: collapsed ? 36 : 52, height: collapsed ? 36 : 52,
            borderRadius: '50%', overflow: 'hidden',
            border: '2px solid rgba(255,255,255,0.3)',
            boxShadow: '0 0 20px rgba(99,102,241,0.4), 0 0 40px rgba(99,102,241,0.15), inset 0 0 10px rgba(255,255,255,0.1)',
            animation: 'beto-float 4s ease-in-out infinite',
            position: 'relative', zIndex: 2,
            transition: 'all 0.3s ease',
          }}>
            <video
              src="/the_avatar_is_greetings_202606091123.mp4"
              autoPlay
              loop
              muted
              playsInline
              style={{
                width: '100%', height: '100%', objectFit: 'cover',
                pointerEvents: 'none',
              }}
            />
          </div>
          {/* Online indicator */}
          <div style={{
            position: 'absolute',
            bottom: collapsed ? 0 : 2,
            right: collapsed ? 0 : 4,
            width: 10, height: 10,
            borderRadius: '50%',
            background: '#10B981',
            border: '2px solid #1E3A5F',
            zIndex: 3,
            animation: 'beto-pulse-dot 2s ease-in-out infinite',
          }} />
        </button>

        {!collapsed && (
          <div className="animate-fade-in" style={{ textAlign: 'center' }}>
            <p style={{
              margin: 0, fontSize: '0.72rem', fontWeight: 700,
              color: 'rgba(255,255,255,0.9)',
              letterSpacing: '0.5px',
            }}>SIMON <span style={{ fontWeight: 400, opacity: 0.7 }}>IA</span></p>
            <p style={{
              margin: '2px 0 0', fontSize: '0.6rem',
              color: 'rgba(255,255,255,0.45)',
            }}>Auditor Inteligente</p>
          </div>
        )}

        {!collapsed && (
          <div className="animate-fade-in" style={{
            borderTop: '1px solid rgba(255,255,255,0.08)',
            paddingTop: '8px', width: '100%', textAlign: 'center',
          }}>
            <p className="sidebar__footer-version" style={{ fontSize: '0.58rem', margin: 0, opacity: 0.4 }}>Facturas v1.0</p>
            <p className="sidebar__footer-by" style={{ fontSize: '0.52rem', margin: '1px 0 0', opacity: 0.3 }}>Grow Labs × Sanatorio Argentino</p>
          </div>
        )}
      </div>
    </aside>
  );
}
