'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2, Image as ImageIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { api } from '@/lib/api';

export default function BannersPage() {
  const queryClient = useQueryClient();
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingBanner, setEditingBanner] = useState<any>(null);
  const [form, setForm] = useState({
    key: '',
    heading: '',
    subtitle: '',
    ctaLabel: '',
    serviceSlug: '',
    image: '',
    imageDescription: '',
    sortOrder: 0,
    isActive: true,
  });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-banners'],
    queryFn: async () => {
      const res = await api.get('/admin/banners');
      return res.data;
    },
  });

  const banners = data?.data || [];

  const createMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/admin/banners', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
      setDialogOpen(false);
      setForm({
        key: '',
        heading: '',
        subtitle: '',
        ctaLabel: '',
        serviceSlug: '',
        image: '',
        imageDescription: '',
        sortOrder: 0,
        isActive: true,
      });
    },
  });

  const updateMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await api.patch(`/admin/banners/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
      setEditingBanner(null);
      setDialogOpen(false);
      setForm({
        key: '',
        heading: '',
        subtitle: '',
        ctaLabel: '',
        serviceSlug: '',
        image: '',
        imageDescription: '',
        sortOrder: 0,
        isActive: true,
      });
    },
  });

  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/banners/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-banners'] });
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    const submitData = {
      ...form,
      serviceSlug: form.serviceSlug === '' ? null : form.serviceSlug,
    };
    if (editingBanner) {
      updateMutation.mutate({ id: editingBanner.id, ...submitData });
    } else {
      createMutation.mutate(submitData);
    }
  };

  const openAdd = () => {
    setEditingBanner(null);
    setForm({
      key: '',
      heading: '',
      subtitle: '',
      ctaLabel: '',
      serviceSlug: '',
      image: '',
      imageDescription: '',
      sortOrder: 0,
      isActive: true,
    });
    setDialogOpen(true);
  };

  const openEdit = (banner: any) => {
    setEditingBanner(banner);
    setForm({
      key: banner.key,
      heading: banner.heading,
      subtitle: banner.subtitle,
      ctaLabel: banner.ctaLabel,
      serviceSlug: banner.serviceSlug || '',
      image: banner.image,
      imageDescription: banner.imageDescription,
      sortOrder: banner.sortOrder,
      isActive: banner.isActive,
    });
    setDialogOpen(true);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Banners</h1>
          <p className="text-gray-500">Manage customer app home screen banners</p>
        </div>
        <Button onClick={openAdd}>
          <Plus className="mr-2 h-4 w-4" />
          Add Banner
        </Button>
      </div>

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-2xl">
          <DialogHeader>
            <DialogTitle>{editingBanner ? 'Edit Banner' : 'Add Banner'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="key">Key (unique)</Label>
                <Input
                  id="key"
                  value={form.key}
                  onChange={(e) => setForm({ ...form, key: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="sortOrder">Sort Order</Label>
                <Input
                  id="sortOrder"
                  type="number"
                  value={form.sortOrder}
                  onChange={(e) => setForm({ ...form, sortOrder: Number(e.target.value) })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="heading">Heading</Label>
              <Input
                id="heading"
                value={form.heading}
                onChange={(e) => setForm({ ...form, heading: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="subtitle">Subtitle</Label>
              <Input
                id="subtitle"
                value={form.subtitle}
                onChange={(e) => setForm({ ...form, subtitle: e.target.value })}
                required
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ctaLabel">CTA Label</Label>
                <Input
                  id="ctaLabel"
                  value={form.ctaLabel}
                  onChange={(e) => setForm({ ...form, ctaLabel: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="serviceSlug">Service Slug (optional)</Label>
                <Input
                  id="serviceSlug"
                  value={form.serviceSlug}
                  onChange={(e) => setForm({ ...form, serviceSlug: e.target.value })}
                  placeholder="e.g., electrical (leave empty for search)"
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="image">Image URL/Path</Label>
              <Input
                id="image"
                value={form.image}
                onChange={(e) => setForm({ ...form, image: e.target.value })}
                placeholder="https://... or banner-1.png"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="imageDescription">Image Description (alt text)</Label>
              <Input
                id="imageDescription"
                value={form.imageDescription}
                onChange={(e) => setForm({ ...form, imageDescription: e.target.value })}
                required
              />
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
                {editingBanner ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <div className="bg-white rounded-lg shadow overflow-hidden">
        <table className="w-full">
          <thead className="bg-gray-50 border-b">
            <tr>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Order
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Banner
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Details
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                CTA / Service
              </th>
              <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase tracking-wider">
                Status
              </th>
              <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase tracking-wider">
                Actions
              </th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200">
            {banners.length === 0 ? (
              <tr>
                <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                  No banners yet. Add your first banner.
                </td>
              </tr>
            ) : (
              banners.map((banner: any) => (
                <tr key={banner.id} className="hover:bg-gray-50">
                  <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-900">
                    {banner.sortOrder}
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex items-center gap-3">
                      <div className="h-12 w-20 bg-gray-100 rounded flex items-center justify-center overflow-hidden">
                        {banner.image?.startsWith('http') ? (
                          <img src={banner.image} alt={banner.imageDescription} className="h-full w-full object-cover" />
                        ) : (
                          <ImageIcon className="h-6 w-6 text-gray-400" />
                        )}
                      </div>
                      <div>
                        <p className="text-sm font-medium text-gray-900">{banner.key}</p>
                        <p className="text-xs text-gray-500 truncate max-w-xs">{banner.image}</p>
                      </div>
                    </div>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm font-medium text-gray-900">{banner.heading}</p>
                    <p className="text-sm text-gray-500">{banner.subtitle}</p>
                  </td>
                  <td className="px-6 py-4">
                    <p className="text-sm text-gray-900">{banner.ctaLabel}</p>
                    <p className="text-xs text-gray-500">
                      {banner.serviceSlug ? `→ ${banner.serviceSlug}` : '→ Search'}
                    </p>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap">
                    <span
                      className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${
                        banner.isActive ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'
                      }`}
                    >
                      {banner.isActive ? 'Active' : 'Inactive'}
                    </span>
                  </td>
                  <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                    <div className="flex gap-2 justify-end">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(banner)}>
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => {
                          if (confirm('Delete this banner?')) deleteMutation.mutate(banner.id);
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
