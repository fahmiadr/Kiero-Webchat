import { create } from 'zustand';

/**
 * usePreChatFormValidation
 *
 * Zustand mini-store specifically for keeping `PreChatForm` input
 * typing and error states outside of the React UI render cycle.
 */
export const usePreChatFormValidation = create((set) => ({
  name: { error: null, isPending: false, isEmpty: true },
  email: { error: null, isPending: false, isEmpty: true },
  isSubmitting: false,
  setFieldState: (field, payload) =>
    set((state) => ({
      [field]: { ...state[field], ...payload },
    })),
  setSubmitting: (isSubmitting) => set({ isSubmitting }),
}));
