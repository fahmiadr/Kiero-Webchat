'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import * as React from 'react';
import { useShadowRoot } from '@/contexts/ShadowRootContext';
import { cn } from '@/utils/cn';

const TooltipProvider = TooltipPrimitive.Provider;

const Tooltip = TooltipPrimitive.Root;

const TooltipTrigger = TooltipPrimitive.Trigger;

const TooltipContent = React.forwardRef(({ className, sideOffset = 4, ...props }, ref) => {
  const shadowRoot = useShadowRoot();

  return (
    <TooltipPrimitive.Portal container={shadowRoot}>
      <TooltipPrimitive.Content
        ref={ref}
        sideOffset={sideOffset}
        className={cn(
          'fade-in-0 zoom-in-95 data-[state=closed]:fade-out-0 data-[state=closed]:zoom-out-95 data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 z-[9999] animate-in overflow-hidden rounded-md bg-slate-900 px-3 py-1.5 font-sans text-white text-xs shadow-md data-[state=closed]:animate-out',
          className,
        )}
        {...props}
      />
    </TooltipPrimitive.Portal>
  );
});
TooltipContent.displayName = TooltipPrimitive.Content.displayName;

export { Tooltip, TooltipTrigger, TooltipContent, TooltipProvider };
