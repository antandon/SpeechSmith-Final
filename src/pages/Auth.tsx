
import React from 'react';
import { Navigate } from 'react-router-dom';
import MainLayout from '@/layouts/MainLayout';
import Login from '@/components/Login';
import { useAuth } from '@/context/AuthContext';

const AuthPage: React.FC = () => {
  const { user, loading } = useAuth();

  if (!loading && user) {
    return <Navigate to="/" replace />;
  }

  return (
    <MainLayout>
      <Login />
    </MainLayout>
  );
};

export default AuthPage;
