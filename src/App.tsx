import React from 'react';
import { AuthProvider } from './contexts/AuthContext';
import { UploadPage } from './pages/UploadPage';

const App: React.FC = () => {
  return (
    <AuthProvider>
      <div className="min-h-screen bg-gray-50">
        <UploadPage />
      </div>
    </AuthProvider>
  );
};

export default App;
