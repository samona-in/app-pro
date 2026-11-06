'use client';

import { useState, type FormEvent } from 'react';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import Image from 'next/image';
import { Edit, Layers, Plus, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { api, errorMessage } from '@/lib/api';
import {
  GroupEditorDialog,
  ServiceEditorDialog,
  WorkEditorDialog,
} from '@/components/services/catalogue-editors';
import {
  confirmDeleteGroup,
  confirmDeleteWork,
  UngroupedWorksSection,
  WorkGroupCard,
} from '@/components/services/work-group-section';
import {
  emptyGroupForm,
  emptyServiceForm,
  emptyWorkForm,
  nextSortOrder,
  type GroupForm,
  type Service,
  type ServiceForm,
  type Work,
  type WorkForm,
  type WorkGroup,
  type PricingModel,
} from '@/components/services/types';

type WorkPayload = {
  name: string;
  slug: string;
  icon: string;
  groupId: string;
  sortOrder: number;
  isActive: boolean;
  pricingModel: PricingModel;
  unitLabel?: string | null;
  minQuantity?: number;
  maxQuantity?: number;
  minDurationMinutes?: number;
  maxDurationMinutes?: number;
  durationStepMinutes?: number;
};
type NewWorkPayload = WorkPayload & { basePricePaise: number; serviceId: string };
type UpdatedWorkPayload = WorkPayload & { basePricePaise?: number; id: string };

export default function ServicesPage() {
  const queryClient = useQueryClient();
  const [serviceDialogOpen, setServiceDialogOpen] = useState(false);
  const [editingService, setEditingService] = useState<Service | null>(null);
  const [serviceForm, setServiceForm] = useState<ServiceForm>(emptyServiceForm);
  const [groupDialogOpen, setGroupDialogOpen] = useState(false);
  const [editingGroup, setEditingGroup] = useState<WorkGroup | null>(null);
  const [groupServiceId, setGroupServiceId] = useState('');
  const [groupForm, setGroupForm] = useState<GroupForm>(emptyGroupForm);
  const [workDialogOpen, setWorkDialogOpen] = useState(false);
  const [editingWork, setEditingWork] = useState<Work | null>(null);
  const [workServiceId, setWorkServiceId] = useState('');
  const [workForm, setWorkForm] = useState<WorkForm>(emptyWorkForm);

  const servicesQuery = useQuery({
    queryKey: ['admin-services'],
    queryFn: async () => {
      const response = await api.get<{ data: Service[] }>('/admin/services');
      return response.data.data;
    },
  });
  const services = servicesQuery.data ?? [];
  const refreshServices = () => queryClient.invalidateQueries({ queryKey: ['admin-services'] });

  const createServiceMutation = useMutation({
    mutationFn: async (form: ServiceForm) => (await api.post('/admin/services', form)).data,
    onSuccess: () => {
      void refreshServices();
      setServiceDialogOpen(false);
      setServiceForm(emptyServiceForm);
      toast.success('Service created.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not create the service.')),
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ id, ...form }: ServiceForm & { id: string }) =>
      (await api.patch(`/admin/services/${id}`, form)).data,
    onSuccess: () => {
      void refreshServices();
      setServiceDialogOpen(false);
      setEditingService(null);
      toast.success('Service saved.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the service.')),
  });

  const deleteServiceMutation = useMutation({
    mutationFn: async (id: string) => (await api.delete(`/admin/services/${id}`)).data,
    onSuccess: () => {
      void refreshServices();
      toast.success('Service deleted.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the service.')),
  });

  const createGroupMutation = useMutation({
    mutationFn: async ({ serviceId, ...form }: GroupForm & { serviceId: string }) =>
      (await api.post(`/admin/services/${serviceId}/groups`, form)).data,
    onSuccess: () => {
      void refreshServices();
      setGroupDialogOpen(false);
      setEditingGroup(null);
      toast.success('Work group created.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not create the work group.')),
  });

  const updateGroupMutation = useMutation({
    mutationFn: async ({ id, ...form }: GroupForm & { id: string }) =>
      (await api.patch(`/admin/service-work-groups/${id}`, form)).data,
    onSuccess: () => {
      void refreshServices();
      setGroupDialogOpen(false);
      setEditingGroup(null);
      toast.success('Work group saved.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the work group.')),
  });

  const deleteGroupMutation = useMutation({
    mutationFn: async (id: string) =>
      (
        await api.delete<{ success: boolean; ungroupedWorks: number }>(
          `/admin/service-work-groups/${id}`,
        )
      ).data,
    onSuccess: (result) => {
      void refreshServices();
      toast.success(
        result.ungroupedWorks === 0
          ? 'Work group deleted.'
          : `Work group deleted. ${result.ungroupedWorks} works remain in the service as ungrouped.`,
      );
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the work group.')),
  });

  const createWorkMutation = useMutation({
    mutationFn: async ({ serviceId, ...form }: NewWorkPayload) =>
      (
        await api.post(`/admin/services/${serviceId}/skills`, {
          ...form,
          groupId: form.groupId || null,
          icon: form.icon || null,
        })
      ).data,
    onSuccess: () => {
      void refreshServices();
      setWorkDialogOpen(false);
      setWorkForm(emptyWorkForm);
      toast.success('Work added.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not add the work.')),
  });

  const updateWorkMutation = useMutation({
    mutationFn: async ({ id, ...form }: UpdatedWorkPayload) =>
      (
        await api.patch(`/admin/skills/${id}`, {
          ...form,
          groupId: form.groupId || null,
          icon: form.icon || null,
        })
      ).data,
    onSuccess: () => {
      void refreshServices();
      setWorkDialogOpen(false);
      setEditingWork(null);
      toast.success('Work saved.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not save the work.')),
  });

  const deleteWorkMutation = useMutation({
    mutationFn: async (id: string) =>
      (await api.delete<{ success: boolean; archived: boolean }>(`/admin/skills/${id}`)).data,
    onSuccess: (result) => {
      void refreshServices();
      toast.success(result.archived ? 'Work archived to preserve past bookings.' : 'Work deleted.');
    },
    onError: (error) => toast.error(errorMessage(error, 'Could not delete the work.')),
  });

  function submitService(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = { ...serviceForm, icon: serviceForm.icon.trim() || '' };
    if (editingService) updateServiceMutation.mutate({ id: editingService.id, ...form });
    else createServiceMutation.mutate(form);
  }

  function openAddService() {
    setEditingService(null);
    setServiceForm(emptyServiceForm);
    setServiceDialogOpen(true);
  }

  function openEditService(service: Service) {
    setEditingService(service);
    setServiceForm({
      name: service.name,
      slug: service.slug,
      icon: service.icon ?? '',
      sortOrder: service.sortOrder,
      isActive: service.isActive,
    });
    setServiceDialogOpen(true);
  }

  function openAddGroup(service: Service) {
    setGroupServiceId(service.id);
    setEditingGroup(null);
    setGroupForm({
      ...emptyGroupForm,
      sortOrder: nextSortOrder(service.workGroups),
    });
    setGroupDialogOpen(true);
  }

  function openEditGroup(group: WorkGroup) {
    setGroupServiceId(group.serviceId);
    setEditingGroup(group);
    setGroupForm({
      name: group.name,
      slug: group.slug,
      imageUrl: group.imageUrl ?? '',
      sortOrder: group.sortOrder,
      isActive: group.isActive,
    });
    setGroupDialogOpen(true);
  }

  function submitGroup(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = { ...groupForm, imageUrl: groupForm.imageUrl.trim() };
    if (editingGroup) updateGroupMutation.mutate({ id: editingGroup.id, ...form });
    else createGroupMutation.mutate({ serviceId: groupServiceId, ...form });
  }

  function openAddWork(service: Service, group: WorkGroup) {
    setWorkServiceId(service.id);
    setEditingWork(null);
    setWorkForm({
      ...emptyWorkForm,
      groupId: group.id,
      sortOrder: nextSortOrder(group.skills),
    });
    setWorkDialogOpen(true);
  }

  function openEditWork(service: Service, work: Work) {
    setWorkServiceId(service.id);
    setEditingWork(work);
    setWorkForm({
      name: work.name,
      slug: work.slug,
      icon: work.icon ?? '',
      groupId: work.groupId ?? '',
      basePriceRupees: work.basePricePaise == null ? '' : String(work.basePricePaise / 100),
      pricingModel: work.pricingModel,
      unitLabel: work.unitLabel ?? '',
      minQuantity: String(work.minQuantity),
      maxQuantity: String(work.maxQuantity),
      minDurationHours:
        work.minDurationMinutes == null ? '1' : String(work.minDurationMinutes / 60),
      maxDurationHours:
        work.maxDurationMinutes == null ? '8' : String(work.maxDurationMinutes / 60),
      durationStepMinutes:
        work.durationStepMinutes == null ? '60' : String(work.durationStepMinutes),
      sortOrder: work.sortOrder,
      isActive: work.isActive,
    });
    setWorkDialogOpen(true);
  }

  function submitWork(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const {
      basePriceRupees,
      unitLabel,
      minQuantity,
      maxQuantity,
      minDurationHours,
      maxDurationHours,
      durationStepMinutes,
      pricingModel,
      ...workFields
    } = workForm;
    const basePricePaise = basePriceRupees.trim() ? Number(basePriceRupees) * 100 : undefined;
    if (
      basePricePaise !== undefined &&
      (!Number.isSafeInteger(basePricePaise) ||
        basePricePaise < 100 ||
        basePricePaise > 100_000_000)
    ) {
      toast.error('Enter a whole-rupee base price between ₹1 and ₹10,00,000.');
      return;
    }
    if (!editingWork && basePricePaise === undefined) {
      toast.error('Enter a base price for this work.');
      return;
    }

    let pricing: Pick<
      WorkPayload,
      | 'pricingModel'
      | 'unitLabel'
      | 'minQuantity'
      | 'maxQuantity'
      | 'minDurationMinutes'
      | 'maxDurationMinutes'
      | 'durationStepMinutes'
    >;
    if (pricingModel === 'PER_UNIT') {
      const min = Number(minQuantity);
      const max = Number(maxQuantity);
      if (!unitLabel.trim()) {
        toast.error('Name the unit customers are booking (e.g. hinge, fan).');
        return;
      }
      if (!Number.isInteger(min) || !Number.isInteger(max) || min < 1 || max < min) {
        toast.error('Enter a minimum and maximum quantity with the maximum at least the minimum.');
        return;
      }
      pricing = { pricingModel, unitLabel: unitLabel.trim(), minQuantity: min, maxQuantity: max };
    } else if (pricingModel === 'PER_HOUR') {
      const min = Math.round(Number(minDurationHours) * 60);
      const max = Math.round(Number(maxDurationHours) * 60);
      const step = Number(durationStepMinutes);
      if (
        !Number.isInteger(min) ||
        !Number.isInteger(max) ||
        !Number.isInteger(step) ||
        min < 15 ||
        max < min ||
        step < 5
      ) {
        toast.error('Enter valid minimum/maximum hours and a duration step in minutes.');
        return;
      }
      pricing = {
        pricingModel,
        minDurationMinutes: min,
        maxDurationMinutes: max,
        durationStepMinutes: step,
      };
    } else {
      pricing = { pricingModel: 'PER_BOOKING' };
    }

    const form: WorkPayload = {
      ...workFields,
      name: workFields.name.trim(),
      slug: workFields.slug.trim(),
      ...pricing,
    };
    if (editingWork) {
      updateWorkMutation.mutate({
        id: editingWork.id,
        ...form,
        ...(basePricePaise !== undefined && { basePricePaise }),
      });
    } else {
      if (basePricePaise === undefined) return;
      createWorkMutation.mutate({ serviceId: workServiceId, ...form, basePricePaise });
    }
  }

  if (servicesQuery.isPending) {
    return (
      <div className="py-12 text-center text-sm text-muted-foreground">
        Loading services and work groups…
      </div>
    );
  }

  if (servicesQuery.isError) {
    return (
      <div
        role="alert"
        className="flex items-center justify-between gap-4 rounded-lg border border-destructive/30 p-4 text-sm"
      >
        <span>{errorMessage(servicesQuery.error, 'Could not load services and work groups.')}</span>
        <Button variant="outline" onClick={() => void servicesQuery.refetch()}>
          Retry
        </Button>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="text-3xl font-bold">Services & Works</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Organize customer work types into service groups.
          </p>
        </div>
        <Button onClick={openAddService}>
          <Plus className="mr-2 h-4 w-4" aria-hidden="true" />
          Add service
        </Button>
      </div>

      <ServiceEditorDialog
        open={serviceDialogOpen}
        onOpenChange={setServiceDialogOpen}
        editing={Boolean(editingService)}
        form={serviceForm}
        setForm={setServiceForm}
        onSubmit={submitService}
        isSaving={createServiceMutation.isPending || updateServiceMutation.isPending}
      />
      <GroupEditorDialog
        open={groupDialogOpen}
        onOpenChange={setGroupDialogOpen}
        editing={Boolean(editingGroup)}
        form={groupForm}
        setForm={setGroupForm}
        onSubmit={submitGroup}
        isSaving={createGroupMutation.isPending || updateGroupMutation.isPending}
      />
      <WorkEditorDialog
        open={workDialogOpen}
        onOpenChange={setWorkDialogOpen}
        editing={Boolean(editingWork)}
        form={workForm}
        setForm={setWorkForm}
        onSubmit={submitWork}
        isSaving={createWorkMutation.isPending || updateWorkMutation.isPending}
        groups={services.find((service) => service.id === workServiceId)?.workGroups ?? []}
      />

      <Accordion className="w-full space-y-3">
        {services.map((service) => {
          const ungroupedWorks = service.skills.filter((work) => !work.groupId);
          const worksCount = service.skills.length;
          return (
            <AccordionItem key={service.id} value={service.id} className="overflow-hidden bg-card">
              <AccordionTrigger className="px-4 hover:no-underline sm:px-5">
                <div className="flex min-w-0 flex-1 items-center gap-3">
                  {service.icon ? (
                    <Image
                      src={service.icon}
                      alt=""
                      width={40}
                      height={40}
                      unoptimized
                      className="h-10 w-10 shrink-0 rounded-md object-cover"
                    />
                  ) : (
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-muted text-muted-foreground">
                      <Layers className="h-5 w-5" aria-hidden="true" />
                    </span>
                  )}
                  <div className="min-w-0 text-left">
                    <p className="truncate font-semibold">{service.name}</p>
                    <p className="truncate text-xs text-muted-foreground">
                      /{service.slug} · {service.workGroups.length} groups · {worksCount} works ·{' '}
                      {service.isActive ? 'Active' : 'Inactive'}
                    </p>
                  </div>
                </div>
              </AccordionTrigger>
              <AccordionContent className="px-4 sm:px-5">
                <div className="mb-5 flex flex-wrap gap-2 border-b pb-4">
                  <Button size="sm" variant="outline" onClick={() => openEditService(service)}>
                    <Edit className="mr-1 h-4 w-4" aria-hidden="true" />
                    Edit service
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => {
                      if (window.confirm(`Delete ${service.name}?`))
                        deleteServiceMutation.mutate(service.id);
                    }}
                  >
                    <Trash2 className="mr-1 h-4 w-4" aria-hidden="true" />
                    Delete service
                  </Button>
                  <Button size="sm" onClick={() => openAddGroup(service)}>
                    <Plus className="mr-1 h-4 w-4" aria-hidden="true" />
                    Add group
                  </Button>
                </div>

                {service.workGroups.length === 0 ? (
                  <div className="mb-5 rounded-lg border border-dashed p-5 text-center">
                    <p className="font-medium">No work groups yet</p>
                    <p className="mt-1 text-sm text-muted-foreground">
                      Create a group before adding customer-facing works.
                    </p>
                  </div>
                ) : (
                  <Accordion multiple className="space-y-3">
                    {service.workGroups.map((group) => (
                      <WorkGroupCard
                        key={group.id}
                        value={group.id}
                        group={group}
                        onAddWork={() => openAddWork(service, group)}
                        onEditGroup={() => openEditGroup(group)}
                        onDeleteGroup={() => {
                          if (confirmDeleteGroup(group, service)) {
                            deleteGroupMutation.mutate(group.id);
                          }
                        }}
                        onEditWork={(work) => openEditWork(service, work)}
                        onDeleteWork={(work) => {
                          if (confirmDeleteWork(work)) deleteWorkMutation.mutate(work.id);
                        }}
                      />
                    ))}
                  </Accordion>
                )}

                <UngroupedWorksSection
                  works={ungroupedWorks}
                  onEditWork={(work) => openEditWork(service, work)}
                  onDeleteWork={(work) => {
                    if (confirmDeleteWork(work)) deleteWorkMutation.mutate(work.id);
                  }}
                />
              </AccordionContent>
            </AccordionItem>
          );
        })}
      </Accordion>
    </div>
  );
}
