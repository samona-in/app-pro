'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Edit, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { api } from '@/lib/api';

export default function ServicesPage() {
  const queryClient = useQueryClient();
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<any>(null);
  const [serviceForm, setServiceForm] = useState({ name: '', slug: '', icon: '', sortOrder: 0, isActive: true });
  
  const [skillDialogOpen, setSkillDialogOpen] = useState(false);
  const [editingSkill, setEditingSkill] = useState<any>(null);
  const [selectedServiceId, setSelectedServiceId] = useState<string>('');
  const [skillForm, setSkillForm] = useState({ name: '', slug: '', icon: '', sortOrder: 0, isActive: true });

  const { data, isLoading } = useQuery({
    queryKey: ['admin-services'],
    queryFn: async () => {
      const res = await api.get('/admin/services');
      return res.data;
    },
  });

  const services = data?.data || [];

  const createServiceMutation = useMutation({
    mutationFn: async (data: any) => {
      const res = await api.post('/admin/services', data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] });
      setServiceDialogOpen(false);
      setServiceForm({ name: '', slug: '', icon: '', sortOrder: 0, isActive: true });
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await api.patch(`/admin/services/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] });
      setEditingService(null);
      setServiceDialogOpen(false);
      setServiceForm({ name: '', slug: '', icon: '', sortOrder: 0, isActive: true });
    },
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/services/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] });
    },
  });

  const createSkillMutation = useMutation({
    mutationFn: async ({ serviceId, ...data }: any) => {
      const res = await api.post(`/admin/services/${serviceId}/skills`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] });
      setSkillDialogOpen(false);
      setSkillForm({ name: '', slug: '', icon: '', sortOrder: 0, isActive: true });
    },
  });

  const updateSkillMutation = useMutation({
    mutationFn: async ({ id, ...data }: any) => {
      const res = await api.patch(`/admin/skills/${id}`, data);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] });
      setEditingSkill(null);
      setSkillDialogOpen(false);
      setSkillForm({ name: '', slug: '', icon: '', sortOrder: 0, isActive: true });
    },
  });

  const deleteSkillMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/skills/${id}`);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-services'] });
    },
  });

  const handleServiceSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingService) {
      updateServiceMutation.mutate({ id: editingService.id, ...serviceForm });
    } else {
      createServiceMutation.mutate(serviceForm);
    }
  };

  const handleSkillSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (editingSkill) {
      updateSkillMutation.mutate({ id: editingSkill.id, ...skillForm });
    } else {
      createSkillMutation.mutate({ serviceId: selectedServiceId, ...skillForm });
    }
  };

  const openAddService = () => {
    setEditingService(null);
    setServiceForm({ name: '', slug: '', icon: '', sortOrder: 0, isActive: true });
    setServiceDialogOpen(true);
  };

  const openEditService = (service: any) => {
    setEditingService(service);
    setServiceForm({
      name: service.name,
      slug: service.slug,
      icon: service.icon || '',
      sortOrder: service.sortOrder,
      isActive: service.isActive,
    });
    setServiceDialogOpen(true);
  };

  const openAddSkill = (serviceId: string) => {
    setEditingSkill(null);
    setSkillForm({ name: '', slug: '', icon: '', sortOrder: 0, isActive: true });
    setSelectedServiceId(serviceId);
    setSkillDialogOpen(true);
  };

  const openEditSkill = (skill: any) => {
    setEditingSkill(skill);
    setSkillForm({
      name: skill.name,
      slug: skill.slug,
      icon: skill.icon || '',
      sortOrder: skill.sortOrder,
      isActive: skill.isActive,
    });
    setSkillDialogOpen(true);
  };

  if (isLoading) return <div>Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Services & Skills</h1>
          <p className="text-gray-500">Manage service categories and skills</p>
        </div>
        <Button onClick={openAddService}>
          <Plus className="mr-2 h-4 w-4" />
          Add Service
        </Button>
      </div>

      <Dialog open={serviceDialogOpen} onOpenChange={setServiceDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingService ? 'Edit Service' : 'Add Service'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleServiceSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="name">Name</Label>
              <Input id="name" value={serviceForm.name} onChange={(e) => setServiceForm({ ...serviceForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="slug">Slug</Label>
              <Input id="slug" value={serviceForm.slug} onChange={(e) => setServiceForm({ ...serviceForm, slug: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="icon">Image URL</Label>
              <Input id="icon" value={serviceForm.icon} onChange={(e) => setServiceForm({ ...serviceForm, icon: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="sortOrder">Sort Order</Label>
              <Input id="sortOrder" type="number" value={serviceForm.sortOrder} onChange={(e) => setServiceForm({ ...serviceForm, sortOrder: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="isActive" checked={serviceForm.isActive} onChange={(e) => setServiceForm({ ...serviceForm, isActive: e.target.checked })} />
              <Label htmlFor="isActive">Active</Label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setServiceDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createServiceMutation.isPending || updateServiceMutation.isPending}>
                {editingService ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={skillDialogOpen} onOpenChange={setSkillDialogOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>{editingSkill ? 'Edit Skill' : 'Add Skill'}</DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSkillSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="skillName">Name</Label>
              <Input id="skillName" value={skillForm.name} onChange={(e) => setSkillForm({ ...skillForm, name: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skillSlug">Slug</Label>
              <Input id="skillSlug" value={skillForm.slug} onChange={(e) => setSkillForm({ ...skillForm, slug: e.target.value })} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skillIcon">Image URL</Label>
              <Input id="skillIcon" value={skillForm.icon} onChange={(e) => setSkillForm({ ...skillForm, icon: e.target.value })} placeholder="https://..." />
            </div>
            <div className="space-y-2">
              <Label htmlFor="skillSortOrder">Sort Order</Label>
              <Input id="skillSortOrder" type="number" value={skillForm.sortOrder} onChange={(e) => setSkillForm({ ...skillForm, sortOrder: Number(e.target.value) })} />
            </div>
            <div className="flex items-center gap-2">
              <input type="checkbox" id="skillActive" checked={skillForm.isActive} onChange={(e) => setSkillForm({ ...skillForm, isActive: e.target.checked })} />
              <Label htmlFor="skillActive">Active</Label>
            </div>
            <div className="flex gap-2 justify-end">
              <Button type="button" variant="outline" onClick={() => setSkillDialogOpen(false)}>Cancel</Button>
              <Button type="submit" disabled={createSkillMutation.isPending || updateSkillMutation.isPending}>
                {editingSkill ? 'Update' : 'Create'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>

      <Accordion className="w-full space-y-2">
        {services.map((service: any) => (
          <AccordionItem key={service.id} value={service.id}>
            <AccordionTrigger className="px-4 hover:no-underline">
              <div className="flex items-center gap-3 flex-1">
                {service.icon && <img src={service.icon} alt={service.name} className="h-10 w-10 rounded object-cover" />}
                <div className="text-left">
                  <div className="font-semibold">{service.name}</div>
                  <div className="text-sm text-gray-500">/{service.slug} • Order: {service.sortOrder} • {service.isActive ? 'Active' : 'Inactive'} • {service.skills?.length || 0} skills</div>
                </div>
              </div>
            </AccordionTrigger>
            <AccordionContent className="px-4 pb-4">
              <div className="flex gap-2 mb-4">
                <Button size="sm" variant="outline" onClick={() => openEditService(service)}>
                  <Edit className="h-4 w-4 mr-1" />
                  Edit Service
                </Button>
                <Button size="sm" variant="outline" onClick={() => { if (confirm('Delete this service?')) deleteServiceMutation.mutate(service.id); }}>
                  <Trash2 className="h-4 w-4 mr-1" />
                  Delete
                </Button>
                <Button size="sm" onClick={() => openAddSkill(service.id)}>
                  <Plus className="h-4 w-4 mr-1" />
                  Add Skill
                </Button>
              </div>
              <div className="space-y-2">
                {service.skills?.length === 0 ? (
                  <p className="text-sm text-gray-500">No skills added yet</p>
                ) : (
                  service.skills?.map((skill: any) => (
                    <div key={skill.id} className="flex items-center justify-between p-3 border rounded bg-gray-50">
                      <div className="flex items-center gap-3">
                        {skill.icon && <img src={skill.icon} alt={skill.name} className="h-8 w-8 rounded object-cover" />}
                        <div>
                          <p className="font-medium">{skill.name}</p>
                          <p className="text-sm text-gray-500">/{skill.slug} • Order: {skill.sortOrder} • {skill.isActive ? 'Active' : 'Inactive'}</p>
                        </div>
                      </div>
                      <div className="flex gap-2">
                        <Button size="sm" variant="ghost" onClick={() => openEditSkill(skill)}>
                          <Edit className="h-4 w-4" />
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => { if (confirm('Delete this skill?')) deleteSkillMutation.mutate(skill.id); }}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
