'use client';

import { useQuery } from '@tanstack/react-query';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Briefcase, MoreVertical } from 'lucide-react';
import { useRouter } from 'next/navigation';
import { api } from '@/lib/api';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';

export default function ProfessionalsPage() {
  const router = useRouter();
  const { data, isLoading } = useQuery({
    queryKey: ['admin-professionals'],
    queryFn: async () => {
      const res = await api.get('/admin/professionals');
      return res.data;
    },
  });

  const professionals = data?.data || [];

  if (isLoading) {
    return <div>Loading...</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Professionals</h1>
          <p className="text-gray-500">Manage professional accounts</p>
        </div>
        <div className="flex items-center gap-2 text-sm text-gray-600">
          <Briefcase className="h-4 w-4" />
          <span>
            {professionals.length} professional{professionals.length !== 1 ? 's' : ''}
          </span>
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>All Professionals</CardTitle>
        </CardHeader>
        <CardContent>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Phone</TableHead>
                <TableHead>Status</TableHead>
                <TableHead>Online</TableHead>
                <TableHead>Verified</TableHead>
                <TableHead>Joined</TableHead>
                <TableHead className="w-[50px]"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {professionals.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={7} className="text-center text-gray-500">
                    No professionals found
                  </TableCell>
                </TableRow>
              ) : (
                professionals.map((professional: any) => (
                  <TableRow key={professional.id}>
                    <TableCell className="font-medium">
                      {professional.displayName || professional.profile?.fullName || '-'}
                    </TableCell>
                    <TableCell>{professional.profile?.phone || '-'}</TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          professional.profile?.isActive
                            ? 'bg-green-100 text-green-800'
                            : 'bg-red-100 text-red-800'
                        }`}
                      >
                        {professional.profile?.isActive ? 'Active' : 'Inactive'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          professional.isOnline
                            ? 'bg-emerald-100 text-emerald-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {professional.isOnline ? 'Online' : 'Offline'}
                      </span>
                    </TableCell>
                    <TableCell>
                      <span
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          professional.isVerified
                            ? 'bg-blue-100 text-blue-800'
                            : 'bg-gray-100 text-gray-800'
                        }`}
                      >
                        {professional.isVerified ? 'Verified' : 'Not verified'}
                      </span>
                    </TableCell>
                    <TableCell>
                      {professional.createdAt
                        ? new Date(professional.createdAt).toLocaleDateString()
                        : '-'}
                    </TableCell>
                    <TableCell>
                      <DropdownMenu>
                        <DropdownMenuTrigger
                          render={
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreVertical className="h-4 w-4" />
                            </Button>
                          }
                        />
                        <DropdownMenuContent align="end">
                          <DropdownMenuItem onClick={() => router.push(`/dashboard/professionals/${professional.id}`)}>
                            Edit
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
}
