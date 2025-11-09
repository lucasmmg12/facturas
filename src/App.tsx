import { AuthProvider } from './contexts/AuthContext';
import { UploadPage } from './pages/UploadPage';

function App() {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50">
        <UploadPage />
      </div>
    </AuthProvider>
  );
}

export default App;
