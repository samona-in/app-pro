'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';

export default function PopularSkillsPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingItem, setEditingItem] = useState<any>(null);
  const [form, setForm] = useState({ skillId: '', sortOrder: 0, isActive: true, isTopPick: false });

  const { data: popularData, isLoading } = useQuery({
    queryKey: ['admin-popular-skills'],
    queryFn: async () => {
      const res = await api.get('/admin/popular-skills');
      return res.data;
    },
  });

  const { data: servicesData } = useQuery({
    queryKey: ['admin-services'],
    queryFn: async () => {
      const res = await api.get('/admin/services');
      return res.data;
    },
  });

  const popularItems = popularData?.data || [];
  const services = servicesData?.data || [];

  const allSkills = services.flatMap((service: any) =>
    (service.skills || []).map((skill: any) => ({
      ...skill,
      serviceName: service.name,
    }))
  );

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/admin/popular-skills', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-popular-skills'] });
      setDialogOpen(false);
      setForm({ skillId: '', sortOrder: 0, isActive: true, isTopPick: false });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await api.patch(`/admin/popular-skills/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-popular-skills'] });
      setEditingItem(null);
      setDialogOpen(false);
      setForm({ skillId: '', sortOrder: 0, isActive: true, isTopPick: false });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/popular-skills/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-popular-skills'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingItem) {
      updateMutation.mutate({ id: editingItem.id, sortOrder: form.sortOrder, isActive: form.isActive, isTopPick: form.isTopPick });
    } else {
      createMutation.mutate(form);
    }
  };

  const openAdd = () => {
    setEditingItem(null);
    setForm({ skillId: '', sortOrder: popularItems.length, isActive: true, isTopPick: false });
    setDialogOpen(true);
  };

  const openEdit = (item: any) => {
    setEditingItem(item);
    setForm({ skillId: item.skillId, sortOrder: item.sortOrder, isActive: item.isActive, isTopPick: item.isTopPick || false });
    setDialogOpen(true);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Popular Skills</h1>
          <p className="text-gray-500">Manage "Popular right now" items on customer home screen</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Popular Skill
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingItem ? 'Edit Popular Skill' : 'Add Popular Skill'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            {!editingItem && (
              <div className="space-y-2">
                <Label htmlFor="skillId">Skill</Label>
                <select
                  id="skillId"
                  value={form.skillId}
                  onChange={(e) => setForm({ ...form, skillId: e.target.value })}
                  required
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background"
                >
                  <option value="">Select a skill</option>
                  {allSkills.map((skill: any) => (
                    <option key={skill.id} value={skill.id}>
                      {skill.serviceName} - {skill.name}
                    </option>
                  ))}
                </select>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input
                id="sortOrder"
                type="number"
                value={form.sortOrder}
                onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
              />
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isTopPick"
                checked={form.isTopPick}
                onChange={(e) => setForm({ ...form, isTopPick: e.target.checked })}
              />
              <Label htmlFor="isTopPick">Top Pick (show trending icon)</Label>
            </div>
            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isActive"
                checked={form.isActive}
                onChange={(e) => setForm({ ...form, isActive: e.target.checked })}
              />
              <Label htmlFor="isActive">Active</Label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setDialogOpen(false)}>
                Cancel
              </Button>
              <Button type="submit" disabled={createMutation.isPending || updateMutation.isPending}>
                {editingItem ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Order</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Skill</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Service</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Top Pick</th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">Status</th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {popularItems.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No popular skills yet. Add your first popular skill.
                </td>
              </tr>
            ) : (
              popularItems.map((item: any) => (
                <tr key={item.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">{item.sortOrder}</td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      {item.skill?.icon ? (
                        <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center overflow-hidden">
                          <img src={item.skill.icon} alt={item.skill.name} className="h-full w-full object-cover" />
                        </div>
                      ) : null}
                      <div>
                        <p className="text-sm font-medium text-gray-900">{item.skill?.name}</p>
                        <p className="text-xs text-gray-500">{item.skill?.slug}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{item.skill?.service?.name}</p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        item.isTopPick ? 'bg-yellow-100 text-yellow-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {item.isTopPick ? 'Yes' : 'No'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        item.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {item.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(item)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm('Remove this skill from popular list?')) deleteMutation.mutate(item.id);
                        }}
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
