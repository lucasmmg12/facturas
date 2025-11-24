import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';
import { DashboardPage } from './pages/DashboardPage';

function App() {
  return (
    <AuthProvider>
      <AuthGuard>
        <DashboardPage />
      </AuthGuard>
    </AuthProvider>
  );
}

export default App;
 