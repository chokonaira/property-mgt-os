'use client';

import { useMutation } from '@tanstack/react-query';
import {
  type CreatePropertyRequest,
  type PropertyDetail,
  PropertyDetailSchema,
} from '@buena/shared';
import { ApiError, apiFetch } from '@/lib/api-client';

export function useCreateProperty() {
  return useMutation<PropertyDetail, ApiError, CreatePropertyRequest>({
    mutationFn: (body) =>
      apiFetch('/properties', PropertyDetailSchema, {
        method: 'POST',
        body,
      }),
  });
}
