'use client';

import { useState } from 'react';
import { AlertCircle, Edit, Layers, Plus, Trash2, Wrench } from 'lucide-react';
import Image from 'next/image';
import { Button } from '@/components/ui/button';
import { AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { formatPaise } from '@/lib/jobs';
import type { Service, Work, WorkGroup } from './types';

/** True when a stored `imageUrl` is an image the browser can render, not an `asset://` reference. */
function isRenderableImageUrl(value: string): boolean {
  return (
    value.startsWith('http://') ||
    value.startsWith('https://') ||
    value.startsWith('data:') ||
    value.startsWith('/')
  );
}

/** "₹199 / hinge · 1–20" or "₹199 / hour" — the price as the customer sees it. */
function pricingSummary(work: Work): string {
  const price = formatPaise(work.basePricePaise);
  if (work.pricingModel === 'PER_UNIT') {
    return `${price} / ${work.unitLabel ?? 'unit'} · ${work.minQuantity}–${work.maxQuantity}`;
  }
  if (work.pricingModel === 'PER_HOUR') return `${price} / hour`;
  return price;
}

function WorkRow({
  work,
  onEdit,
  onDelete,
}: {
  work: Work;
  onEdit: () => void;
  onDelete: () => void;
}) {
  return (
    <div className="flex flex-wrap items-center justify-between gap-3 border-b py-3 last:border-0">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        {work.icon ? (
          <Image
            src={work.icon}
            alt=""
            width={36}
            height={36}
            unoptimized
            className="h-9 w-9 rounded-md object-cover"
          />
        ) : (
          <span className="flex h-9 w-9 items-center justify-center rounded-md bg-muted text-muted-foreground">
            <Wrench className="h-4 w-4" aria-hidden="true" />
          </span>
        )}
        <div className="min-w-0">
          <p className="truncate font-medium">{work.name}</p>
          <p className="truncate text-xs text-muted-foreground">
            /{work.slug} · Order {work.sortOrder} · {work.isActive ? 'Active' : 'Inactive'}
          </p>
        </div>
      </div>
      <div className="min-w-28 text-left sm:text-right">
        <p className="text-xs text-muted-foreground">Price</p>
        <p className="font-medium tabular-nums">{pricingSummary(work)}</p>
      </div>
      <div className="flex shrink-0 gap-1">
        <Button size="icon" variant="ghost" aria-label={`Edit ${work.name}`} onClick={onEdit}>
          <Edit aria-hidden="true" />
        </Button>
        <Button size="icon" variant="ghost" aria-label={`Delete ${work.name}`} onClick={onDelete}>
          <Trash2 aria-hidden="true" />
        </Button>
      </div>
    </div>
  );
}

export function WorkGroupCard({
  group,
  onAddWork,
  onEditGroup,
  onDeleteGroup,
  onEditWork,
  onDeleteWork,
  value,
}: {
  group: WorkGroup;
  value: string;
  onAddWork: () => void;
  onEditGroup: () => void;
  onDeleteGroup: () => void;
  onEditWork: (work: Work) => void;
  onDeleteWork: (work: Work) => void;
}) {
  const [failedImageUrl, setFailedImageUrl] = useState<string | null>(null);
  const imageUrl = group.imageUrl;
  const showImage =
    imageUrl !== null && isRenderableImageUrl(imageUrl) && imageUrl !== failedImageUrl;

  return (
    <AccordionItem value={value} className="overflow-hidden bg-background">
      <div className="flex items-start gap-2 px-4 py-3">
        <div className="min-w-0 flex-1">
          <AccordionTrigger className="w-full px-0 py-1 hover:no-underline">
            <div className="flex min-w-0 items-start gap-3 text-left">
              {showImage ? (
                <Image
                  src={imageUrl}
                  alt={`${group.name} image`}
                  width={36}
                  height={36}
                  unoptimized
                  onError={() => setFailedImageUrl(imageUrl)}
                  className="mt-0.5 h-9 w-9 shrink-0 rounded-md object-cover"
                />
              ) : (
                <span className="mt-0.5 flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-primary/10 text-primary">
                  <Layers className="h-4 w-4" aria-hidden="true" />
                </span>
              )}
              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-2">
                  <span className="font-semibold">{group.name}</span>
                  <span
                    className={`rounded-full px-2 py-0.5 text-xs ${group.isActive ? 'bg-emerald-100 text-emerald-800' : 'bg-muted text-muted-foreground'}`}
                  >
                    {group.isActive ? 'Visible' : 'Hidden'}
                  </span>
                </div>
                <span className="block truncate text-xs font-normal text-muted-foreground">
                  /{group.slug} · Order {group.sortOrder} ·{' '}
                  {group.skills.filter((work) => work.isActive).length} active works
                </span>
              </div>
            </div>
          </AccordionTrigger>
        </div>
        <div className="flex shrink-0 gap-1">
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Add work to ${group.name}`}
            onClick={onAddWork}
          >
            <Plus aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Edit ${group.name}`}
            onClick={onEditGroup}
          >
            <Edit aria-hidden="true" />
          </Button>
          <Button
            size="icon"
            variant="ghost"
            aria-label={`Delete ${group.name}`}
            onClick={onDeleteGroup}
          >
            <Trash2 aria-hidden="true" />
          </Button>
        </div>
      </div>
      <AccordionContent className="border-t px-4 sm:pl-16">
        {group.skills.length > 0 ? (
          group.skills.map((work) => (
            <WorkRow
              key={work.id}
              work={work}
              onEdit={() => onEditWork(work)}
              onDelete={() => onDeleteWork(work)}
            />
          ))
        ) : (
          <p className="py-3 text-sm text-muted-foreground">No works in this group yet.</p>
        )}
      </AccordionContent>
    </AccordionItem>
  );
}

export function UngroupedWorksSection({
  works,
  onEditWork,
  onDeleteWork,
}: {
  works: Work[];
  onEditWork: (work: Work) => void;
  onDeleteWork: (work: Work) => void;
}) {
  if (works.length === 0) return null;

  return (
    <section className="mt-5 rounded-lg border border-dashed p-4">
      <div className="mb-1 flex items-center gap-2">
        <AlertCircle className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        <h2 className="font-semibold">Ungrouped works</h2>
      </div>
      <p className="mb-2 text-sm text-muted-foreground">
        These works stay available; edit one to assign it to a group.
      </p>
      {works.map((work) => (
        <WorkRow
          key={work.id}
          work={work}
          onEdit={() => onEditWork(work)}
          onDelete={() => onDeleteWork(work)}
        />
      ))}
    </section>
  );
}

export function confirmDeleteWork(work: Work): boolean {
  return window.confirm(`Delete “${work.name}”? If bookings use it, it will be archived instead.`);
}

export function confirmDeleteGroup(group: WorkGroup, service: Service): boolean {
  return window.confirm(
    `Delete “${group.name}”? Its works will remain in ${service.name} as ungrouped works.`,
  );
}
