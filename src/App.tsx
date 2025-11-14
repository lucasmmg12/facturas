import { AuthProvider } from './contexts/AuthContext';
import { AuthGuard } from './components/AuthGuard';
import { DashboardPage } from './pages/DashboardPage';

function App() {
  return (
        <DashboardPage />
      </AuthGuard>
    </AuthProvider>
  );
}

export default App;
