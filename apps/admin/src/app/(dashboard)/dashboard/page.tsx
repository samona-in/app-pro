'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Users, Briefcase, Calendar, CheckCircle } from 'lucide-react';
import { api } from '@/lib/api';

export default function DashboardPage() {
  const { data, isLoading } = useQuery({
    queryKey: ['dashboard-overview'],
    queryFn: async () => {
      const res = await api.get('/admin/dashboard/overview');
      return res.data;
    },
  });

  const metrics = data?.metrics || {};

  const cards = [
    { title: 'Total Customers', value: metrics.totalCustomers || 0, icon: Users },
    { title: 'Total Professionals', value: metrics.totalProfessionals || 0, icon: Briefcase },
    { title: 'Active Bookings', value: metrics.activeJobs || 0, icon: Calendar },
    { title: 'Completed Bookings', value: metrics.completedJobs || 0, icon: CheckCircle },
  ];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-3xl font-bold">Dashboard Overview</h1>
        <p className="text-gray-500">Welcome to SAMONA Admin Dashboard</p>
      </div>

      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {cards.map((card) => {
          const Icon = card.icon;
          return (
            <Card key={card.title}>
              <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
                <CardTitle className="text-sm font-medium">{card.title}</CardTitle>
                <Icon className="h-4 w-4 text-muted-foreground" />
              </CardHeader>
              <CardContent>
                <div className="text-2xl font-bold">{card.value}</div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}
