import { AuthProvider, useAuth } from './contexts/AuthContext';
import { UploadPage } from './pages/UploadPage';
import { LoginPage } from './pages/LoginPage';
import { DashboardLayout } from './components/DashboardLayout';

const AppContent = () => {
  const { user, loading, profile } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="flex flex-col items-center gap-4">
          <div className="h-12 w-12 animate-spin rounded-full border-4 border-slate-700 border-t-white" />
          <p className="text-sm font-medium text-white opacity-80">
            Preparando tu espacio de trabajo...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return <LoginPage />;
  }

  if (!profile) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center">
        <div className="rounded-2xl bg-white/10 px-8 py-6 text-center text-white shadow-xl backdrop-blur">
          <p className="text-sm font-medium">Cargando tu perfil...</p>
        </div>
      </div>
    );
  }

  return (
    <DashboardLayout title="Cargar comprobantes">
      <UploadPage />
    </DashboardLayout>
  );
};

const App = () => (
  <AuthProvider>
    <AppContent />
  </AuthProvider>
);

export default App;
