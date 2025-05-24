import React from 'react';
import { useRouter } from 'next/router';
import { useEffect } from 'react';

const DashboardPage: React.FC = () => {
  const router = useRouter();

  useEffect(() => {
    // Redirect to the main dashboard at root
    router.replace('/');
  }, [router]);

  return (
    <div className="flex items-center justify-center h-64">
      <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-indigo-600"></div>
    </div>
  );
};

export default DashboardPage;
