'use client';

import type { Dispatch, FormEvent, SetStateAction } from 'react';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import type { GroupForm, ServiceForm, WorkForm, WorkGroup } from './types';

type FormSetter<T> = Dispatch<SetStateAction<T>>;
type EditorBaseProps<T> = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  editing: boolean;
  form: T;
  setForm: FormSetter<T>;
  onSubmit: (event: FormEvent<HTMLFormElement>) => void;
  isSaving: boolean;
};

function NumberField({
  id,
  label,
  value,
  onChange,
}: {
  id: string;
  label: string;
  value: number;
  onChange: (value: number) => void;
}) {
  return (
    <div className="space-y-2">
      <Label htmlFor={id}>{label}</Label>
      <Input
        id={id}
        type="number"
        min={0}
        step={1}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
      />
    </div>
  );
}

function ActiveField({
  checked,
  onChange,
  children,
}: {
  checked: boolean;
  onChange: (checked: boolean) => void;
  children: string;
}) {
  return (
    <label className="flex items-center gap-2 text-sm">
      <input
        type="checkbox"
        checked={checked}
        onChange={(event) => onChange(event.target.checked)}
      />
      {children}
    </label>
  );
}

function EditorActions({
  onCancel,
  isSaving,
  saveLabel,
}: {
  onCancel: () => void;
  isSaving: boolean;
  saveLabel: string;
}) {
  return (
    <div className="flex justify-end gap-2">
      <Button type="button" variant="outline" onClick={onCancel}>
        Cancel
      </Button>
      <Button type="submit" disabled={isSaving}>
        {saveLabel}
      </Button>
    </div>
  );
}

export function ServiceEditorDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  onSubmit,
  isSaving,
}: EditorBaseProps<ServiceForm>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit service' : 'Add service'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="service-name">Name</Label>
            <Input
              id="service-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="service-slug">Slug</Label>
            <Input
              id="service-slug"
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="service-icon">Image URL</Label>
            <Input
              id="service-icon"
              value={form.icon}
              onChange={(event) => setForm({ ...form, icon: event.target.value })}
            />
          </div>
          <NumberField
            id="service-order"
            label="Display order"
            value={form.sortOrder}
            onChange={(sortOrder) => setForm({ ...form, sortOrder })}
          />
          <ActiveField
            checked={form.isActive}
            onChange={(isActive) => setForm({ ...form, isActive })}
          >
            Active
          </ActiveField>
          <EditorActions
            onCancel={() => onOpenChange(false)}
            isSaving={isSaving}
            saveLabel={editing ? 'Save service' : 'Create service'}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function GroupEditorDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  onSubmit,
  isSaving,
}: EditorBaseProps<GroupForm>) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit work group' : 'Create work group'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="group-name">Group name</Label>
            <Input
              id="group-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              maxLength={100}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-slug">Slug</Label>
            <Input
              id="group-slug"
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
              placeholder="switches-and-sockets"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="group-image">Image URL or asset reference</Label>
            <Input
              id="group-image"
              value={form.imageUrl}
              onChange={(event) => setForm({ ...form, imageUrl: event.target.value })}
              placeholder="asset://service-work-groups/fan"
            />
          </div>
          <NumberField
            id="group-order"
            label="Display order"
            value={form.sortOrder}
            onChange={(sortOrder) => setForm({ ...form, sortOrder })}
          />
          <ActiveField
            checked={form.isActive}
            onChange={(isActive) => setForm({ ...form, isActive })}
          >
            Visible to customers
          </ActiveField>
          <EditorActions
            onCancel={() => onOpenChange(false)}
            isSaving={isSaving}
            saveLabel={editing ? 'Save group' : 'Create group'}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}

export function WorkEditorDialog({
  open,
  onOpenChange,
  editing,
  form,
  setForm,
  onSubmit,
  isSaving,
  groups,
}: EditorBaseProps<WorkForm> & { groups: WorkGroup[] }) {
  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{editing ? 'Edit work' : 'Add work to group'}</DialogTitle>
        </DialogHeader>
        <form onSubmit={onSubmit} className="space-y-4">
          <div className="space-y-2">
            <Label htmlFor="work-name">Work name</Label>
            <Input
              id="work-name"
              value={form.name}
              onChange={(event) => setForm({ ...form, name: event.target.value })}
              required
              maxLength={150}
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="work-slug">Slug</Label>
            <Input
              id="work-slug"
              value={form.slug}
              onChange={(event) => setForm({ ...form, slug: event.target.value })}
              placeholder="fan-repair"
              pattern="[a-z0-9]+(-[a-z0-9]+)*"
              required
            />
          </div>
          <div className="space-y-2">
            <Label htmlFor="work-group">Group</Label>
            <select
              id="work-group"
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={form.groupId}
              onChange={(event) => setForm({ ...form, groupId: event.target.value })}
              required
            >
              <option value="" disabled>
                Select a group
              </option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                  {group.isActive ? '' : ' (inactive)'}
                </option>
              ))}
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="work-base-price">Base price (₹)</Label>
            <Input
              id="work-base-price"
              type="number"
              min={1}
              max={1_000_000}
              step={1}
              value={form.basePriceRupees}
              onChange={(event) => setForm({ ...form, basePriceRupees: event.target.value })}
              placeholder="e.g. 500"
              required={!editing}
            />
            <p className="text-xs text-muted-foreground">
              {form.pricingModel === 'PER_UNIT'
                ? 'Price charged for one unit (one hinge, one fan, one switch).'
                : form.pricingModel === 'PER_HOUR'
                  ? 'Price charged per hour of work.'
                  : 'Fixed price for the whole visit, regardless of scope.'}
            </p>
          </div>
          <div className="space-y-2">
            <Label htmlFor="work-pricing-model">Pricing model</Label>
            <select
              id="work-pricing-model"
              className="flex h-9 w-full rounded-lg border border-input bg-background px-3 text-sm"
              value={form.pricingModel}
              onChange={(event) =>
                setForm({ ...form, pricingModel: event.target.value as WorkForm['pricingModel'] })
              }
            >
              <option value="PER_BOOKING">Per booking (fixed price)</option>
              <option value="PER_UNIT">Per unit (price × quantity)</option>
              <option value="PER_HOUR">Per hour (price × duration)</option>
            </select>
          </div>
          {form.pricingModel === 'PER_UNIT' ? (
            <>
              <div className="space-y-2">
                <Label htmlFor="work-unit-label">Unit name</Label>
                <Input
                  id="work-unit-label"
                  value={form.unitLabel}
                  onChange={(event) => setForm({ ...form, unitLabel: event.target.value })}
                  placeholder="hinge"
                  maxLength={50}
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Shown to customers, e.g. “2 hinges”.
                </p>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="work-min-quantity">Minimum quantity</Label>
                  <Input
                    id="work-min-quantity"
                    type="number"
                    min={1}
                    max={1_000}
                    step={1}
                    value={form.minQuantity}
                    onChange={(event) => setForm({ ...form, minQuantity: event.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="work-max-quantity">Maximum quantity</Label>
                  <Input
                    id="work-max-quantity"
                    type="number"
                    min={1}
                    max={1_000}
                    step={1}
                    value={form.maxQuantity}
                    onChange={(event) => setForm({ ...form, maxQuantity: event.target.value })}
                    required
                  />
                </div>
              </div>
            </>
          ) : null}
          {form.pricingModel === 'PER_HOUR' ? (
            <>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="work-min-duration">Minimum hours</Label>
                  <Input
                    id="work-min-duration"
                    type="number"
                    min={0.25}
                    max={24}
                    step={0.25}
                    value={form.minDurationHours}
                    onChange={(event) => setForm({ ...form, minDurationHours: event.target.value })}
                    required
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="work-max-duration">Maximum hours</Label>
                  <Input
                    id="work-max-duration"
                    type="number"
                    min={0.25}
                    max={24}
                    step={0.25}
                    value={form.maxDurationHours}
                    onChange={(event) => setForm({ ...form, maxDurationHours: event.target.value })}
                    required
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="work-duration-step">Duration step (minutes)</Label>
                <Input
                  id="work-duration-step"
                  type="number"
                  min={5}
                  max={1_440}
                  step={5}
                  value={form.durationStepMinutes}
                  onChange={(event) =>
                    setForm({ ...form, durationStepMinutes: event.target.value })
                  }
                  required
                />
                <p className="text-xs text-muted-foreground">
                  Customers can pick in these increments, e.g. 30 for half-hours.
                </p>
              </div>
            </>
          ) : null}
          <div className="space-y-2">
            <Label htmlFor="work-icon">Work image URL (optional)</Label>
            <Input
              id="work-icon"
              value={form.icon}
              onChange={(event) => setForm({ ...form, icon: event.target.value })}
              placeholder="https://…"
            />
          </div>
          <NumberField
            id="work-order"
            label="Display order"
            value={form.sortOrder}
            onChange={(sortOrder) => setForm({ ...form, sortOrder })}
          />
          <ActiveField
            checked={form.isActive}
            onChange={(isActive) => setForm({ ...form, isActive })}
          >
            Available to customers
          </ActiveField>
          <EditorActions
            onCancel={() => onOpenChange(false)}
            isSaving={isSaving}
            saveLabel={editing ? 'Save work' : 'Add work'}
          />
        </form>
      </DialogContent>
    </Dialog>
  );
}
