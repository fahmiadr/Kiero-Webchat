import { Slot } from '@radix-ui/react-slot';
import * as React from 'react';
import { Label } from '@/components/ui/label';
import { cn } from '@/utils/cn';

// --- Context-Free Form Components for TanStack Form ---
// Original Shadcn implementations rely heavily on react-hook-form context.
// These are adapted to be pure presentational components controlled via props.

const FormItem = React.forwardRef(({ className, ...props }, ref) => {
  return <div ref={ref} className={cn('space-y-2', className)} {...props} />;
});
FormItem.displayName = 'FormItem';

const FormLabel = React.forwardRef(({ className, error, ...props }, ref) => {
  return <Label ref={ref} className={cn(error && 'text-destructive', className)} {...props} />;
});
FormLabel.displayName = 'FormLabel';

const FormControl = React.forwardRef(({ ...props }, ref) => {
  return <Slot ref={ref} {...props} />;
});
FormControl.displayName = 'FormControl';

const FormDescription = React.forwardRef(({ className, ...props }, ref) => {
  return <p ref={ref} className={cn('text-muted-foreground text-sm', className)} {...props} />;
});
FormDescription.displayName = 'FormDescription';

const FormMessage = React.forwardRef(({ className, children, ...props }, ref) => {
  if (!children) {
    return null;
  }

  return (
    <p ref={ref} className={cn('font-medium text-red-500 text-xs', className)} {...props}>
      {children}
    </p>
  );
});
FormMessage.displayName = 'FormMessage';

export { FormItem, FormLabel, FormControl, FormMessage };
