'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Copy, X, Send, Edit, Trash2 } from 'lucide-react';
import { CAMPAIGN_DEEP_LINKS } from '@samona/config';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { api, errorMessage } from '@/lib/api';
import {
  RecipientPicker,
  findNotificationRecipients,
  type NotificationRecipient,
  type RecipientSurface,
} from './RecipientPicker';

const NOTIFICATION_TYPES = [
  'PROMOTIONAL_OFFERS',
  'BOOKING_REMINDERS',
  'PRO_ENGAGEMENT',
  'NEW_SERVICE_ANNOUNCEMENTS',
  'APPLICATION_UPDATES',
  'IMPORTANT_ANNOUNCEMENTS',
  'CUSTOM_NOTIFICATIONS',
];

/** The four recipient choices this screen offers for new campaigns. */
const AUDIENCES = [
  'ALL_PROFESSIONALS',
  'ALL_CUSTOMERS',
  'INDIVIDUAL_PRO',
  'INDIVIDUAL_CUSTOMER',
] as const;

const AUDIENCE_LABELS: Record<string, string> = {
  ALL_PROFESSIONALS: 'All Pros',
  ALL_CUSTOMERS: 'All Customers',
  INDIVIDUAL_PRO: 'Individual Pro',
  INDIVIDUAL_CUSTOMER: 'Individual Customer',
};

const PRO_ONLY_AUDIENCES = [
  'ALL_PROFESSIONALS',
  'VERIFIED_PROFESSIONALS',
  'ONLINE_PROFESSIONALS',
  'OFFLINE_PROFESSIONALS',
  'PROFESSIONALS_INCOMPLETE_PROFILES',
];
const CUSTOMER_ONLY_AUDIENCES = [
  'ALL_CUSTOMERS',
  'CUSTOMERS_NOT_BOOKED_RECENTLY',
  'CUSTOMERS_WITH_COMPLETED_BOOKINGS',
];

type CampaignForm = {
  name: string;
  title: string;
  body: string;
  imageUrl: string;
  type: string;
  audience: string;
  deepLink: string;
  sendNow: boolean;
  scheduledAt: string;
};

type AutomationRow = {
  id: string;
  name: string;
  type: string;
  enabled: boolean;
};

type CampaignRow = {
  id: string;
  name: string;
  title: string;
  audience: string;
  audienceFilters?: { recipientId?: string } | null;
  status: string;
  recipientCount: number;
  createdAt: string;
  sendNow?: boolean;
  scheduledAt?: string | null;
  deepLink?: string | null;
  imageUrl?: string | null;
  type?: string;
  body?: string;
};

const EMPTY_FORM: CampaignForm = {
  name: '',
  title: '',
  body: '',
  imageUrl: '',
  type: 'PROMOTIONAL_OFFERS',
  audience: 'ALL_PROFESSIONALS',
  deepLink: '',
  sendNow: false,
  scheduledAt: '',
};

function isIndividual(audience: string): audience is 'INDIVIDUAL_PRO' | 'INDIVIDUAL_CUSTOMER' {
  return audience === 'INDIVIDUAL_PRO' || audience === 'INDIVIDUAL_CUSTOMER';
}

function surfaceFor(audience: string): RecipientSurface | null {
  if (isIndividual(audience)) return audience === 'INDIVIDUAL_PRO' ? 'PRO' : 'CUSTOMER';
  if (PRO_ONLY_AUDIENCES.includes(audience)) return 'PRO';
  if (CUSTOMER_ONLY_AUDIENCES.includes(audience)) return 'CUSTOMER';
  return null;
}

/** One shared allowlist drives the admin choices and what the apps may open. */
function deepLinkOptions(audience: string) {
  const surface = surfaceFor(audience);
  if (surface) return CAMPAIGN_DEEP_LINKS[surface];
  return CAMPAIGN_DEEP_LINKS.PRO.filter((option) =>
    CAMPAIGN_DEEP_LINKS.CUSTOMER.some((customer) => customer.route === option.route),
  );
}

function audienceLabel(audience: string): string {
  return AUDIENCE_LABELS[audience] ?? audience.replace(/_/g, ' ');
}

export default function NotificationsPage() {
  const queryClient = useQueryClient();
  const [activeTab, setActiveTab] = useState('campaigns');
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form, setForm] = useState<CampaignForm>(EMPTY_FORM);
  const [recipient, setRecipient] = useState<NotificationRecipient | null>(null);
  const [formError, setFormError] = useState<string | null>(null);

  const { data: campaignsData } = useQuery({
    queryKey: ['notification-campaigns'],
    queryFn: async () => {
      const res = await api.get('/admin/notifications/campaigns');
      return res.data;
    },
  });
  const { data: automationsData } = useQuery({
    queryKey: ['notification-automations'],
    queryFn: async () => {
      const res = await api.get('/admin/notifications/automations');
      return res.data;
    },
  });
  const campaigns: CampaignRow[] = campaignsData?.data || [];
  const automations: AutomationRow[] = automationsData?.data || [];

  const estimate = useQuery({
    queryKey: ['notification-campaign-estimate', form.audience, recipient?.id ?? null],
    queryFn: async () => {
      const payload: { audience: string; audienceFilters?: { recipientId: string } } = {
        audience: form.audience,
      };
      if (isIndividual(form.audience)) {
        // The query is disabled until the picker has made exactly one choice.
        if (!recipient) return 0;
        payload.audienceFilters = { recipientId: recipient.id };
      }
      const res = await api.post('/admin/notifications/campaigns/estimate-recipients', payload);
      return Number(res.data.count) || 0;
    },
    enabled: !isIndividual(form.audience) || Boolean(recipient),
    refetchOnWindowFocus: false,
  });

  const invalidateCampaigns = () =>
    queryClient.invalidateQueries({ queryKey: ['notification-campaigns'] });

  const createMutation = useMutation({
    mutationFn: async (data: Record<string, unknown>) => {
      if (editingId) {
        const res = await api.patch(`/admin/notifications/campaigns/${editingId}`, data);
        return res.data;
      }
      const res = await api.post('/admin/notifications/campaigns', data);
      return res.data;
    },
    onSuccess: () => {
      void invalidateCampaigns();
      setDialogOpen(false);
      resetForm();
    },
    onError: (error) => setFormError(errorMessage(error, 'Unable to save the campaign.')),
  });
  const sendMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/admin/notifications/campaigns/${id}/send`, {});
      return res.data;
    },
    onSuccess: () => {
      void invalidateCampaigns();
    },
  });
  const cancelMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/admin/notifications/campaigns/${id}/cancel`);
      return res.data;
    },
    onSuccess: () => {
      void invalidateCampaigns();
    },
  });
  const duplicateMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.post(`/admin/notifications/campaigns/${id}/duplicate`);
      return res.data;
    },
    onSuccess: () => {
      void invalidateCampaigns();
    },
  });
  const deleteMutation = useMutation({
    mutationFn: async (id: string) => {
      const res = await api.delete(`/admin/notifications/campaigns/${id}`);
      return res.data;
    },
    onSuccess: () => {
      void invalidateCampaigns();
    },
  });

  const resetForm = () => {
    setForm(EMPTY_FORM);
    setRecipient(null);
    setFormError(null);
    setEditingId(null);
  };

  const openEdit = async (campaign: CampaignRow) => {
    setEditingId(campaign.id);
    setFormError(null);
    let scheduledAtLocal = '';
    if (campaign.scheduledAt) {
      const date = new Date(campaign.scheduledAt);
      const pad = (value: number) => String(value).padStart(2, '0');
      scheduledAtLocal = `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`;
    }
    setForm({
      name: campaign.name || '',
      title: campaign.title || '',
      body: campaign.body || '',
      imageUrl: campaign.imageUrl || '',
      type: campaign.type || 'PROMOTIONAL_OFFERS',
      audience: campaign.audience || 'ALL_PROFESSIONALS',
      deepLink: campaign.deepLink || '',
      sendNow: campaign.sendNow || false,
      scheduledAt: scheduledAtLocal,
    });

    const recipientId = campaign.audienceFilters?.recipientId;
    if (recipientId && isIndividual(campaign.audience)) {
      const surface: RecipientSurface = campaign.audience === 'INDIVIDUAL_PRO' ? 'PRO' : 'CUSTOMER';
      try {
        const found = await findNotificationRecipients({ surface, recipientId });
        setRecipient(found.find((row) => row.id === recipientId) ?? null);
      } catch {
        setRecipient(null);
        setFormError('The selected recipient is no longer available. Choose another recipient.');
      }
    } else {
      setRecipient(null);
    }
    setDialogOpen(true);
  };

  const changeAudience = (audience: string) => {
    const options = deepLinkOptions(audience);
    setForm((current) => ({
      ...current,
      audience,
      deepLink: options.some((option) => option.route === current.deepLink) ? current.deepLink : '',
    }));
    setRecipient(null);
    setFormError(null);
  };

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    setFormError(null);
    if (isIndividual(form.audience) && !recipient) {
      setFormError('Select exactly one recipient before sending.');
      return;
    }

    const payload: Record<string, unknown> = {
      ...form,
      imageUrl: form.imageUrl.trim() || undefined,
      deepLink: form.deepLink.trim() || undefined,
    };
    if (isIndividual(form.audience) && recipient) {
      // Only a profile id is sent; the server re-resolves surface and liveness.
      payload.audienceFilters = { recipientId: recipient.id };
    }
    if (!form.sendNow && form.scheduledAt.trim()) {
      const [datePart, timePart] = form.scheduledAt.split('T');
      const [year, month, day] = datePart.split('-').map(Number);
      const [hour, minute] = timePart.split(':').map(Number);
      payload.scheduledAt = new Date(year, month - 1, day, hour, minute).toISOString();
    } else {
      payload.scheduledAt = undefined;
    }
    createMutation.mutate(payload);
  };

  const getStatusColor = (status: string) => {
    const colors: Record<string, string> = {
      DRAFT: 'bg-gray-100 text-gray-800',
      SCHEDULED: 'bg-blue-100 text-blue-800',
      QUEUED: 'bg-yellow-100 text-yellow-800',
      SENDING: 'bg-orange-100 text-orange-800',
      COMPLETED: 'bg-green-100 text-green-800',
      PARTIALLY_FAILED: 'bg-yellow-100 text-yellow-800',
      FAILED: 'bg-red-100 text-red-800',
      CANCELLED: 'bg-gray-100 text-gray-800',
    };
    return colors[status] || 'bg-gray-100 text-gray-800';
  };

  const audienceOptions = AUDIENCES.includes(form.audience as (typeof AUDIENCES)[number])
    ? AUDIENCES
    : [form.audience, ...AUDIENCES];
  const linkOptions = deepLinkOptions(form.audience);

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold">Marketing & Notifications</h1>
          <p className="text-gray-500">Create, send, schedule, and monitor notifications</p>
        </div>
        <Button onClick={() => setDialogOpen(true)} className="bg-[#054DFF] hover:bg-[#054DFF]/90">
          <Plus className="mr-2 h-4 w-4" />
          Create Campaign
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="campaigns">Campaigns</TabsTrigger>
          <TabsTrigger value="automated">Automated Reminders</TabsTrigger>
          <TabsTrigger value="history">Notification History</TabsTrigger>
        </TabsList>

        <TabsContent value="campaigns" className="space-y-4">
          <div className="bg-white rounded-lg shadow overflow-hidden">
            <table className="w-full">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Campaign
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Recipient type
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Status
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Recipients
                  </th>
                  <th className="px-6 py-3 text-left text-xs font-medium text-gray-500 uppercase">
                    Created
                  </th>
                  <th className="px-6 py-3 text-right text-xs font-medium text-gray-500 uppercase">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-200">
                {campaigns.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="px-6 py-8 text-center text-gray-500">
                      No campaigns yet.
                    </td>
                  </tr>
                ) : (
                  campaigns.map((campaign) => (
                    <tr key={campaign.id} className="hover:bg-gray-50">
                      <td className="px-6 py-4">
                        <p className="text-sm font-medium text-gray-900">{campaign.name}</p>
                        <p className="text-xs text-gray-500 truncate max-w-xs">{campaign.title}</p>
                      </td>
                      <td className="px-6 py-4">
                        <p className="text-sm text-gray-900">{audienceLabel(campaign.audience)}</p>
                        {isIndividual(campaign.audience) &&
                        campaign.audienceFilters?.recipientId ? (
                          <p className="font-mono text-[11px] text-gray-500">
                            {campaign.audienceFilters.recipientId}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-6 py-4">
                        <span
                          className={`inline-flex px-2 py-1 text-xs font-semibold rounded-full ${getStatusColor(campaign.status)}`}
                        >
                          {campaign.status}
                        </span>
                      </td>
                      <td className="px-6 py-4 text-sm text-gray-900">{campaign.recipientCount}</td>
                      <td className="px-6 py-4 text-sm text-gray-500">
                        {new Date(campaign.createdAt).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-4 whitespace-nowrap text-right text-sm font-medium">
                        <div className="flex gap-2 justify-end">
                          {(campaign.status === 'DRAFT' || campaign.status === 'SCHEDULED') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => void openEdit(campaign)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                          )}
                          {campaign.status === 'DRAFT' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => sendMutation.mutate(campaign.id)}
                            >
                              <Send className="h-4 w-4" />
                            </Button>
                          )}
                          {(campaign.status === 'SCHEDULED' || campaign.status === 'QUEUED') && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => cancelMutation.mutate(campaign.id)}
                            >
                              <X className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() => duplicateMutation.mutate(campaign.id)}
                          >
                            <Copy className="h-4 w-4" />
                          </Button>
                          {campaign.status !== 'SENDING' && campaign.status !== 'QUEUED' && (
                            <Button
                              size="sm"
                              variant="ghost"
                              onClick={() => {
                                if (confirm('Are you sure you want to delete this campaign?')) {
                                  deleteMutation.mutate(campaign.id);
                                }
                              }}
                            >
                              <Trash2 className="h-4 w-4 text-red-600" />
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </TabsContent>

        <TabsContent value="automated" className="space-y-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Automation Rules</h3>
            <div className="space-y-4">
              {automations.length === 0 ? (
                <p className="text-gray-500">No automation rules configured yet.</p>
              ) : (
                automations.map((auto) => (
                  <div
                    key={auto.id}
                    className="border rounded-lg p-4 flex items-center justify-between"
                  >
                    <div>
                      <p className="font-medium">{auto.name}</p>
                      <p className="text-sm text-gray-500">{auto.type.replace(/_/g, ' ')}</p>
                    </div>
                    <span
                      className={`px-2 py-1 text-xs rounded-full ${auto.enabled ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}`}
                    >
                      {auto.enabled ? 'Enabled' : 'Disabled'}
                    </span>
                  </div>
                ))
              )}
            </div>
          </div>
        </TabsContent>

        <TabsContent value="history" className="space-y-4">
          <div className="bg-white rounded-lg shadow p-6">
            <h3 className="text-lg font-semibold mb-4">Notification History</h3>
            <p className="text-gray-500">Campaign history and analytics will appear here.</p>
          </div>
        </TabsContent>
      </Tabs>

      <Dialog
        open={dialogOpen}
        onOpenChange={(open) => {
          setDialogOpen(open);
          if (!open) resetForm();
        }}
      >
        <DialogContent className="sm:max-w-none !max-w-[95vw] w-[95vw] lg:!max-w-[1100px] lg:w-[1100px] max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>
              {editingId ? 'Edit Notification Campaign' : 'Create Notification Campaign'}
            </DialogTitle>
          </DialogHeader>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="name">Campaign Name</Label>
                <Input
                  id="name"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="type">Notification Type</Label>
                <select
                  id="type"
                  value={form.type}
                  onChange={(e) => setForm({ ...form, type: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  {NOTIFICATION_TYPES.map((type) => (
                    <option key={type} value={type}>
                      {type.replace(/_/g, ' ')}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="title">Notification Title</Label>
              <Input
                id="title"
                value={form.title}
                onChange={(e) => setForm({ ...form, title: e.target.value })}
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="body">Message Body</Label>
              <Textarea
                id="body"
                value={form.body}
                onChange={(e) => setForm({ ...form, body: e.target.value })}
                rows={3}
                required
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="audience">Recipient type</Label>
              <select
                id="audience"
                value={form.audience}
                onChange={(event) => changeAudience(event.target.value)}
                className="w-full px-3 py-2 border rounded-md"
              >
                {audienceOptions.map((audience) => (
                  <option key={audience} value={audience}>
                    {audienceLabel(audience)}
                  </option>
                ))}
              </select>
            </div>

            {isIndividual(form.audience) ? (
              <RecipientPicker
                surface={form.audience === 'INDIVIDUAL_PRO' ? 'PRO' : 'CUSTOMER'}
                selected={recipient}
                onSelect={(next) => {
                  setRecipient(next);
                  setFormError(null);
                }}
              />
            ) : null}

            <div className="p-3 bg-blue-50 rounded-lg">
              <p className="text-sm text-blue-800">
                Estimated recipients:{' '}
                <strong>
                  {isIndividual(form.audience) && !recipient ? '—' : (estimate.data ?? 0)}
                </strong>
              </p>
            </div>

            <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
              <div className="space-y-2">
                <Label htmlFor="imageUrl">Image URL (optional)</Label>
                <Input
                  id="imageUrl"
                  value={form.imageUrl}
                  onChange={(e) => setForm({ ...form, imageUrl: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="deepLink">Open in app (optional)</Label>
                <select
                  id="deepLink"
                  value={form.deepLink}
                  onChange={(e) => setForm({ ...form, deepLink: e.target.value })}
                  className="w-full px-3 py-2 border rounded-md"
                >
                  <option value="">No destination</option>
                  {linkOptions.map((option) => (
                    <option key={option.route} value={option.route}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="sendNow"
                checked={form.sendNow}
                onChange={(e) => setForm({ ...form, sendNow: e.target.checked })}
              />
              <Label htmlFor="sendNow">Send immediately</Label>
            </div>
            {!form.sendNow && (
              <div className="space-y-2">
                <Label htmlFor="scheduledAt">Schedule for later</Label>
                <Input
                  id="scheduledAt"
                  type="datetime-local"
                  value={form.scheduledAt}
                  onChange={(e) => setForm({ ...form, scheduledAt: e.target.value })}
                />
              </div>
            )}

            <div className="p-3 bg-gray-50 rounded-lg">
              <p className="text-xs font-medium mb-2">Push Notification Preview</p>
              <div className="bg-white p-3 rounded border shadow-sm max-w-xs">
                <div className="flex items-start gap-2">
                  <div className="w-8 h-8 bg-[#054DFF] rounded flex-shrink-0"></div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium truncate">
                      {form.title || 'Notification Title'}
                    </p>
                    <p className="text-xs text-gray-600 line-clamp-2">
                      {form.body || 'Notification message body'}
                    </p>
                    {isIndividual(form.audience) && recipient ? (
                      <p className="mt-1 truncate text-[11px] font-semibold text-[#054DFF]">
                        To: {recipient.name} · {recipient.id}
                      </p>
                    ) : null}
                  </div>
                </div>
              </div>
            </div>

            {formError ? (
              <p role="alert" className="text-sm text-red-600">
                {formError}
              </p>
            ) : null}

            <div className="flex gap-2 justify-end">
              <Button
                type="button"
                variant="outline"
                onClick={() => {
                  setDialogOpen(false);
                  resetForm();
                }}
              >
                Cancel
              </Button>
              <Button
                type="submit"
                className="bg-[#054DFF] hover:bg-[#054DFF]/90"
                disabled={createMutation.isPending || (isIndividual(form.audience) && !recipient)}
              >
                {editingId
                  ? 'Update'
                  : form.sendNow
                    ? 'Send Now'
                    : form.scheduledAt
                      ? 'Schedule'
                      : 'Save as Draft'}
              </Button>
            </div>
          </form>
        </DialogContent>
      </Dialog>
    </div>
  );
}
