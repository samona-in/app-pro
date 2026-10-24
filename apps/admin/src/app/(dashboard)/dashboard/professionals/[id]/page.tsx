'use client';

'use client';

import { useState, useEffect, Suspense } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useParams, useRouter } from 'next/navigation';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { ArrowLeft, Check, X, FileText } from 'lucide-react';
import { api } from '@/lib/api';

function ProfessionalEditContent() {
  const params = useParams();
  const router = useRouter();
  const queryClient = useQueryClient();
  const id = params.id as string;

  const { data, isLoading } = useQuery({
    queryKey: ['admin-professional', id],
    queryFn: async () => {
      const res = await api.get(`/admin/professionals/${id}`);
      return res.data;
    },
  });

  const professional = data?.data;

  const [formData, setFormData] = useState({
    displayName: '',
    bio: '',
    experienceLevel: '',
    serviceRadiusKm: '',
    isVerified: false,
    isOnline: false,
    latitude: '',
    longitude: '',
    locationLabel: '',
  });

  useEffect(() => {
    if (professional) {
      setFormData({
        displayName: professional.displayName || '',
        bio: professional.bio || '',
        experienceLevel: professional.experienceLevel || '',
        serviceRadiusKm: professional.serviceRadiusKm?.toString() || '',
        isVerified: professional.isVerified || false,
        isOnline: professional.isOnline || false,
        latitude: professional.latitude?.toString() || '',
        longitude: professional.longitude?.toString() || '',
        locationLabel: professional.locationLabel || '',
      });
    }
  }, [professional]);

  const updateMutation = useMutation({
    mutationFn: async (updates: any) => {
      const res = await api.patch(`/admin/professionals/${id}`, updates);
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-professional', id] });
      queryClient.invalidateQueries({ queryKey: ['admin-professionals'] });
      alert('Professional updated successfully');
    },
  });

  const updateServiceMutation = useMutation({
    mutationFn: async ({ serviceId, status, rejectionReason }: any) => {
      const res = await api.patch(`/admin/professionals/${id}/services/${serviceId}`, {
        status,
        rejectionReason,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-professional', id] });
      alert('Service status updated');
    },
  });

  const updateDocumentMutation = useMutation({
    mutationFn: async ({ documentId, status, rejectionReason }: any) => {
      const res = await api.patch(`/admin/professionals/${id}/documents/${documentId}`, {
        status,
        rejectionReason,
      });
      return res.data;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['admin-professional', id] });
      alert('Document status updated');
    },
  });

  const handleDocumentAction = (documentId: string, status: string) => {
    if (status === 'REJECTED') {
      const reason = prompt('Enter rejection reason:');
      if (reason === null) return;
      if (!reason.trim()) {
        alert('Rejection reason is required');
        return;
      }
      updateDocumentMutation.mutate({ documentId, status, rejectionReason: reason });
    } else {
      updateDocumentMutation.mutate({ documentId, status });
    }
  };

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    updateMutation.mutate({
      displayName: formData.displayName,
      bio: formData.bio,
      experienceLevel: formData.experienceLevel,
      serviceRadiusKm: Number(formData.serviceRadiusKm),
      isVerified: formData.isVerified,
      isOnline: formData.isOnline,
      latitude: formData.latitude ? Number(formData.latitude) : null,
      longitude: formData.longitude ? Number(formData.longitude) : null,
      locationLabel: formData.locationLabel,
    });
  };

  const handleServiceAction = (serviceId: string, status: 'ACCEPTED' | 'REJECTED') => {
    if (status === 'REJECTED') {
      const reason = prompt('Enter rejection reason:');
      if (!reason) return;
      updateServiceMutation.mutate({ serviceId, status, rejectionReason: reason });
    } else {
      updateServiceMutation.mutate({ serviceId, status });
    }
  };

  if (isLoading) {
    return <div>Loading...</div>;
  }

  if (!professional) {
    return <div>Professional not found</div>;
  }

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-4">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-3xl font-bold">Edit Professional</h1>
          <p className="text-gray-500">{professional.profile?.phone}</p>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Card>
          <CardHeader>
            <CardTitle>Professional Details</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="mb-6 flex justify-center">
              {professional.selfiePhotoPath ? (
                <img
                  src={`${process.env.NEXT_PUBLIC_SELFIE_BUCKET_URL || 'https://samona-selfies.s3.amazonaws.com'}/${professional.selfiePhotoPath}`}
                  alt="Profile"
                  className="h-32 w-32 rounded-full object-cover border"
                />
              ) : (
                <div className="h-32 w-32 rounded-full bg-gray-200 flex items-center justify-center text-gray-500">
                  No Image
                </div>
              )}
            </div>
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="displayName">Display Name</Label>
                <Input
                  id="displayName"
                  value={formData.displayName}
                  onChange={(e) => setFormData({ ...formData, displayName: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="bio">Bio</Label>
                <Input
                  id="bio"
                  value={formData.bio}
                  onChange={(e) => setFormData({ ...formData, bio: e.target.value })}
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="experienceLevel">Experience Level</Label>
                <select
                  id="experienceLevel"
                  className="flex h-10 w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={formData.experienceLevel}
                  onChange={(e) => setFormData({ ...formData, experienceLevel: e.target.value })}
                >
                  <option value="">Select...</option>
                  <option value="UNDER_1_YEAR">Under 1 Year</option>
                  <option value="ONE_TO_THREE">1-3 Years</option>
                  <option value="THREE_TO_FIVE">3-5 Years</option>
                  <option value="FIVE_TO_TEN">5-10 Years</option>
                  <option value="TEN_PLUS">10+ Years</option>
                </select>
              </div>

              <div className="space-y-2">
                <Label htmlFor="serviceRadiusKm">Service Radius (km)</Label>
                <Input
                  id="serviceRadiusKm"
                  type="number"
                  value={formData.serviceRadiusKm}
                  onChange={(e) => setFormData({ ...formData, serviceRadiusKm: e.target.value })}
                />
              </div>

              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isVerified}
                    onChange={(e) => setFormData({ ...formData, isVerified: e.target.checked })}
                  />
                  <span className="text-sm">Verified</span>
                </label>
                <label className="flex items-center gap-2">
                  <input
                    type="checkbox"
                    checked={formData.isOnline}
                    onChange={(e) => setFormData({ ...formData, isOnline: e.target.checked })}
                  />
                  <span className="text-sm">Online</span>
                </label>
              </div>

              <div className="space-y-2">
                <Label htmlFor="locationLabel">Location Label</Label>
                <Input
                  id="locationLabel"
                  value={formData.locationLabel}
                  onChange={(e) => setFormData({ ...formData, locationLabel: e.target.value })}
                />
              </div>

              <div className="flex items-center justify-between">
                <Label>Coordinates</Label>
                {formData.latitude && formData.longitude && (
                  <a
                    href={`https://www.google.com/maps?q=${formData.latitude},${formData.longitude}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-600 hover:text-blue-800"
                    title="View on Google Maps"
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="18"
                      height="18"
                      viewBox="0 0 24 24"
                      fill="none"
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />
                      <polyline points="15 3 21 3 21 9" />
                      <line x1="10" y1="14" x2="21" y2="3" />
                    </svg>
                  </a>
                )}
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="latitude">Latitude</Label>
                  <Input
                    id="latitude"
                    type="number"
                    step="any"
                    value={formData.latitude}
                    onChange={(e) => setFormData({ ...formData, latitude: e.target.value })}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="longitude">Longitude</Label>
                  <Input
                    id="longitude"
                    type="number"
                    step="any"
                    value={formData.longitude}
                    onChange={(e) => setFormData({ ...formData, longitude: e.target.value })}
                  />
                </div>
              </div>

              <Button type="submit" disabled={updateMutation.isPending}>
                {updateMutation.isPending ? 'Saving...' : 'Save Changes'}
              </Button>
            </form>
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Requested Services</CardTitle>
          </CardHeader>
          <CardContent>
            {professional.services && professional.services.length > 0 ? (
              <div className="space-y-4">
                {professional.services.map((proService: any) => (
                  <div
                    key={proService.serviceId}
                    className="flex items-center justify-between border-b pb-4 last:border-0"
                  >
                    <div>
                      <p className="font-medium">{proService.service?.name}</p>
                      <p className="text-sm text-gray-500">Status: {proService.status}</p>
                      {proService.rejectionReason && (
                        <p className="text-xs text-red-600">
                          Reason: {proService.rejectionReason}
                        </p>
                      )}
                    </div>
                    <div className="flex gap-2">
                      {proService.status !== 'ACCEPTED' && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleServiceAction(proService.serviceId, 'ACCEPTED')}
                          disabled={updateServiceMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {proService.status !== 'REJECTED' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleServiceAction(proService.serviceId, 'REJECTED')}
                          disabled={updateServiceMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-gray-500">No services requested</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle>Documents & Certifications</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {professional.documents?.length === 0 ? (
                <p className="text-gray-500">No documents uploaded</p>
              ) : (
                professional.documents?.map((doc: any) => (
                  <div
                    key={doc.id}
                    className="flex items-center justify-between border-b pb-4 last:border-0"
                  >
                    <div className="flex items-start gap-3 flex-1">
                      <FileText className="h-5 w-5 text-gray-500 mt-0.5" />
                      <div className="flex-1">
                        <h3 className="font-medium">
                          <button
                            onClick={async () => {
                              try {
                                const res = await api.get(`/admin/professionals/${id}/documents/${doc.id}/content-url`);
                                window.open(res.data.url, '_blank');
                              } catch (error) {
                                alert('Failed to open document');
                              }
                            }}
                            className="text-blue-600 hover:underline text-left"
                          >
                            {doc.fileName}
                          </button>
                        </h3>
                        <p className="text-sm text-gray-500">
                          Type: {doc.type} | Status: {doc.status}
                        </p>
                        {doc.status === 'REJECTED' && doc.rejectionReason && (
                          <p className="text-sm text-red-600 mt-1">
                            Reason: {doc.rejectionReason}
                          </p>
                        )}
                        {doc.reviewedAt && (
                          <p className="text-xs text-gray-400 mt-1">
                            Reviewed: {new Date(doc.reviewedAt).toLocaleString()}
                          </p>
                        )}
                      </div>
                    </div>
                    <div className="flex gap-2">
                      {doc.status !== 'APPROVED' && (
                        <Button
                          size="sm"
                          variant="default"
                          onClick={() => handleDocumentAction(doc.id, 'APPROVED')}
                          disabled={updateDocumentMutation.isPending}
                        >
                          <Check className="h-4 w-4" />
                        </Button>
                      )}
                      {doc.status !== 'REJECTED' && (
                        <Button
                          size="sm"
                          variant="destructive"
                          onClick={() => handleDocumentAction(doc.id, 'REJECTED')}
                          disabled={updateDocumentMutation.isPending}
                        >
                          <X className="h-4 w-4" />
                        </Button>
                      )}
                    </div>
                  </div>
                ))
              )}
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function ProfessionalEditPage() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <ProfessionalEditContent />
    </Suspense>
  );
}
