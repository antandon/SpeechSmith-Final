import React, { useState } from 'react';
import MainLayout from '@/layouts/MainLayout';
import SiteHeader from '@/components/SiteHeader';
import SiteFooter from '@/components/SiteFooter';
import RecordSpeech from '@/components/RecordSpeech';
import SpeechConfiguration from '@/components/SpeechConfiguration';
import PracticeHistory from '@/components/PracticeHistory';
import AnalysisReport from '@/components/AnalysisReport';

// Record on top, past analyses listed below; each analysis's full verdict
// opens in a report rather than being stacked on the page.
const Index: React.FC = () => {
  const [reportOpen, setReportOpen] = useState(false);

  return (
    <MainLayout>
      <SiteHeader />
      
      <div className="min-h-screen bg-background">
        <div className="pt-8 pb-8">
          <div className="container mx-auto max-w-6xl px-4 text-center">
            <h1 className="text-3xl md:text-4xl font-semibold text-slate-900 mb-3">
              AI Powered English <span className="text-secondary">Communication Coach</span>
            </h1>
            <p className="text-base text-slate-500 max-w-xl mx-auto">
              Transform your speaking skills with advanced AI feedback, pronunciation analysis, and personalized insights
            </p>
          </div>
        </div>

        <div className="container mx-auto max-w-6xl px-4 pb-12">

          <div className="grid gap-6 mb-10 lg:grid-cols-5">
            <div className="lg:order-2 lg:col-span-2">
              <SpeechConfiguration />
            </div>
            <div className="lg:order-1 lg:col-span-3">
              <RecordSpeech onAnalysisComplete={() => setReportOpen(true)} />
            </div>
          </div>

          <PracticeHistory onViewReport={() => setReportOpen(true)} />
        </div>
      </div>

      <AnalysisReport open={reportOpen} onOpenChange={setReportOpen} />

      <SiteFooter />
    </MainLayout>
  );
};

export default Index;
