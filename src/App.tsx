
import { BrowserRouter as Router, Routes, Route } from 'react-router-dom';
import Index from './pages/Index';
import About from './pages/About';
import PracticePage from './pages/Practice';
import AuthPage from './pages/Auth';
import NotFound from './pages/NotFound';
import { Toaster as SonnerToaster } from "sonner";
import { SpeechProvider } from './context/SpeechContext';
import { AuthProvider } from './context/AuthContext';
import AuthGuard from './components/AuthGuard';
import ErrorBoundary from './components/ErrorBoundary';

function App() {
  return (
    <Router>
      <AuthProvider>
        <SpeechProvider>
          <ErrorBoundary>
            <Routes>
              <Route path="/auth" element={<AuthPage />} />
              <Route path="/" element={<AuthGuard><Index /></AuthGuard>} />
              <Route path="/about" element={<AuthGuard><About /></AuthGuard>} />
              <Route path="/practice" element={<AuthGuard><PracticePage /></AuthGuard>} />
              <Route path="*" element={<NotFound />} />
            </Routes>
          </ErrorBoundary>
          <SonnerToaster richColors closeButton expand />
        </SpeechProvider>
      </AuthProvider>
    </Router>
  );
}

export default App;
