
import React from 'react';
import MainLayout from '@/layouts/MainLayout';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import Practice from '@/components/Practice';

const PracticePage: React.FC = () => {
  return (
    <MainLayout>
      <SiteHeader />
      <Practice />
      <SiteFooter />
    </MainLayout>
  );
};

export default PracticePage;
