'use client';

import { useState } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { BellRing, Send } from 'lucide-react';
import type { CampaignSurface } from '@samona/config';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { api, errorMessage } from '@/lib/api';
import { CampaignDeepLinkInput, isAllowedCampaignDeepLink } from './CampaignDeepLinkInput';
import { NOTIFICATION_TYPES } from './notification-types';

export interface IndividualNotificationTarget {
  surface: CampaignSurface;
  /** The profile id from the admin route, never an auth user id. */
  recipientId: string;
  recipientName: string;
  recipientDetail?: string | null;
}

type IndividualForm = {
  title: string;
  body: string;
  type: string;
  deepLink: string;
};

const EMPTY_FORM: IndividualForm = {
  title: '',
  body: '',
  type: 'CUSTOM_NOTIFICATIONS',
  deepLink: '',
};

const SURFACE_LABEL: Record<CampaignSurface, string> = {
  PRO: 'professional',
  CUSTOMER: 'customer',
};

const AUDIENCE_BY_SURFACE: Record<CampaignSurface, string> = {
  PRO: 'INDIVIDUAL_PRO',
  CUSTOMER: 'INDIVIDUAL_CUSTOMER',
};

function campaignName(surface: CampaignSurface, title: string): string {
  return `Individual ${SURFACE_LABEL[surface]}: ${title}`.slice(0, 100);
}

/**
 * An individual notice is an action on a recipient's profile, not a marketing
 * campaign. It still uses the campaign pipeline so push delivery, the inbox
 * row and read state stay in one place; no recipient can be chosen here.
 */
export function IndividualNotificationCard({
  surface,
  recipientId,
  recipientName,
  recipientDetail,
}: IndividualNotificationTarget) {
  const queryClient = useQueryClient();
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState<IndividualForm>(EMPTY_FORM);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const sendMutation = useMutation({
    mutationFn: async (values: IndividualForm) =>
      api.post('/admin/notifications/campaigns', {
        name: campaignName(surface, values.title),
        title: values.title,
        body: values.body,
        type: values.type,
        audience: AUDIENCE_BY_SURFACE[surface],
        // The server re-resolves the id against the audience's surface.
        audienceFilters: { recipientId },
        deepLink: values.deepLink || undefined,
        sendNow: true,
      }),
    onSuccess: () => {
      setOpen(false);
      setForm(EMPTY_FORM);
      setError(null);
      setSent(true);
      void queryClient.invalidateQueries({ queryKey: ['notification-campaigns'] });
      void queryClient.invalidateQueries({
        queryKey: ['admin-notification-history', surface, recipientId],
      });
    },
    onError: (mutationError) =>
      setError(errorMessage(mutationError, 'Unable to send the notification.')),
  });

  const close = () => {
    setOpen(false);
    setForm(EMPTY_FORM);
    setError(null);
  };

  const submit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.title.trim() || !form.body.trim()) {
      setError('Title and message are required.');
      return;
    }
    if (!isAllowedCampaignDeepLink(form.deepLink, [surface])) {
      setError('Choose an allowlisted deep link for this app.');
      return;
    }
    setError(null);
    sendMutation.mutate({
      ...form,
      title: form.title.trim(),
      body: form.body.trim(),
      deepLink: form.deepLink.trim(),
    });
  };

  return (
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <BellRing className="h-5 w-5 text-[#054DFF]" />
          Send notification
        </CardTitle>
        <CardDescription>
          Sends one system notice to this {SURFACE_LABEL[surface]}’s app inbox and registered
          devices.
        </CardDescription>
      </CardHeader>
      <CardContent>
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border bg-gray-50 p-3">
          <div className="min-w-0">
            <p className="text-sm font-medium text-gray-900">{recipientName}</p>
            <p className="truncate text-xs text-gray-500">
              {recipientDetail ? `${recipientDetail} · ` : ''}
              <span className="font-mono">{recipientId}</span>
            </p>
          </div>
          <Button
            type="button"
            onClick={() => {
              setSent(false);
              setOpen(true);
            }}
            className="bg-[#054DFF] hover:bg-[#054DFF]/90"
          >
            <Send className="mr-2 h-4 w-4" />
            Send notification
          </Button>
        </div>
        {sent ? (
          <p role="status" className="mt-2 text-sm text-green-700">
            Notification sent.
          </p>
        ) : null}

        <Dialog
          open={open}
          onOpenChange={(next) => {
            if (next) setOpen(true);
            else close();
          }}
        >
          <DialogContent className="sm:max-w-[560px] max-h-[90vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle>Send notification to {recipientName}</DialogTitle>
              <DialogDescription>
                This notice is visible only to the recipient shown below. It does not create a
                marketing campaign.
              </DialogDescription>
            </DialogHeader>
            <form onSubmit={submit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="individual-notification-title">Title</Label>
                <Input
                  id="individual-notification-title"
                  value={form.title}
                  maxLength={100}
                  onChange={(event) => setForm({ ...form, title: event.target.value })}
                  required
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="individual-notification-body">Message</Label>
                <Textarea
                  id="individual-notification-body"
                  value={form.body}
                  maxLength={500}
                  rows={4}
                  onChange={(event) => setForm({ ...form, body: event.target.value })}
                  required
                />
              </div>
              <div className="grid gap-4 sm:grid-cols-2">
                <div className="space-y-2">
                  <Label htmlFor="individual-notification-type">Type</Label>
                  <select
                    id="individual-notification-type"
                    value={form.type}
                    onChange={(event) => setForm({ ...form, type: event.target.value })}
                    className="w-full px-3 py-2 border rounded-md"
                  >
                    {NOTIFICATION_TYPES.map((type) => (
                      <option key={type} value={type}>
                        {type.replace(/_/g, ' ')}
                      </option>
                    ))}
                  </select>
                </div>
                <CampaignDeepLinkInput
                  id="individual-notification-deep-link"
                  value={form.deepLink}
                  onChange={(deepLink) => setForm({ ...form, deepLink })}
                  surfaces={[surface]}
                />
              </div>

              <div className="rounded-lg border bg-gray-50 p-3">
                <p className="text-xs font-medium">Push preview</p>
                <p className="mt-1 truncate text-sm font-medium">
                  {form.title.trim() || 'Notification title'}
                </p>
                <p className="line-clamp-2 text-xs text-gray-600">
                  {form.body.trim() || 'Notification message'}
                </p>
                <p className="mt-1 truncate font-mono text-[11px] text-gray-500">
                  To {recipientId}
                </p>
              </div>

              {error ? (
                <p role="alert" className="text-sm text-red-600">
                  {error}
                </p>
              ) : null}

              <div className="flex justify-end gap-2">
                <Button type="button" variant="outline" onClick={close}>
                  Cancel
                </Button>
                <Button
                  type="submit"
                  className="bg-[#054DFF] hover:bg-[#054DFF]/90"
                  disabled={sendMutation.isPending}
                >
                  {sendMutation.isPending ? 'Sending…' : 'Send now'}
                </Button>
              </div>
            </form>
          </DialogContent>
        </Dialog>
      </CardContent>
    </Card>
  );
}
