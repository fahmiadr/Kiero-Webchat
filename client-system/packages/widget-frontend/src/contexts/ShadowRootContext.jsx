import { createContext, useContext } from 'react';

export const ShadowRootContext = createContext(null);

export const useShadowRoot = () => useContext(ShadowRootContext);
