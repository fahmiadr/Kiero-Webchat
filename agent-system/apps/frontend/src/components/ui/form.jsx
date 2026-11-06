"use client";
import * as React from "react"
import { Slot } from "@radix-ui/react-slot"
import { Controller, FormProvider, useFormContext, useFormState } from "react-hook-form";

import { cn } from "@/lib/utils"
import { Label } from "@/components/ui/label"

const Form = FormProvider

const FormFieldContext = React.createContext(null)

const FormField = (
  {
    ...props
  }
) => {
  return (
    <FormFieldContext.Provider value={{ name: props.name }}>
      <Controller {...props} />
    </FormFieldContext.Provider>
  );
}

/**
 * A lightweight wrapper that provides FormFieldContext without tying into Controller.
 * Useful for uncontrolled inputs where you register manually (`{...form.register("name")}`)
 * to prevent the entire FormItem from re-rendering on every keystroke.
 */
const FormFieldUncontrolled = ({ name, children }) => {
  const value = React.useMemo(() => ({ name }), [name])
  return (
    <FormFieldContext.Provider value={value}>
      {children}
    </FormFieldContext.Provider>
  );
}

const useFormFieldInfo = () => {
  const fieldContext = React.useContext(FormFieldContext)
  const itemContext = React.useContext(FormItemContext)

  if (!fieldContext) {
    throw new Error("useFormField should be used within <FormField>")
  }

  if (!itemContext) {
    throw new Error("useFormField should be used within <FormItem>")
  }

  const { id } = itemContext

  return {
    id,
    name: fieldContext.name,
    formItemId: `${id}-form-item`,
    formDescriptionId: `${id}-form-item-description`,
    formMessageId: `${id}-form-item-message`,
  }
}

const useFormField = () => {
  const info = useFormFieldInfo()
  const { getFieldState } = useFormContext()

  // High-performance optimization: 
  // Subscribe to state ONLY for the specific field, not the whole form.
  const formState = useFormState({ name: info.name })
  const fieldState = getFieldState(info.name, formState)

  return {
    ...info,
    ...fieldState,
  }
}

const FormItemContext = React.createContext(null)

const FormItem = React.forwardRef(({ className, ...props }, ref) => {
  const id = React.useId()
  const value = React.useMemo(() => ({ id }), [id])

  return (
    <FormItemContext.Provider value={value}>
      <div ref={ref} className={cn("space-y-2", className)} {...props} />
    </FormItemContext.Provider>
  );
})
FormItem.displayName = "FormItem"

const FormLabel = React.forwardRef(({ className, ...props }, ref) => {
  const { formItemId } = useFormFieldInfo()

  return (
    <Label
      ref={ref}
      className={cn(className)}
      htmlFor={formItemId}
      {...props} />
  );
})
FormLabel.displayName = "FormLabel"

const FormControl = React.forwardRef(({ ...props }, ref) => {
  const info = useFormFieldInfo()
  const { control } = useFormContext()
  const { errors } = useFormState({ control, name: info.name })

  const getFieldError = React.useCallback((errs, name) => {
    if (!errs || !name) return undefined;
    return name.split('.').reduce((acc, part) => acc?.[part], errs);
  }, []);

  const error = getFieldError(errors, info.name);

  return (
    <Slot
      ref={ref}
      id={info.formItemId}
      aria-describedby={
        !error
          ? `${info.formDescriptionId}`
          : `${info.formDescriptionId} ${info.formMessageId}`
      }
      aria-invalid={!!error}
      {...props}
    />
  );
})
FormControl.displayName = "FormControl"

const FormDescription = React.forwardRef(({ className, ...props }, ref) => {
  const { formDescriptionId } = useFormFieldInfo()

  return (
    <p
      ref={ref}
      id={formDescriptionId}
      className={cn("text-[0.8rem] text-muted-foreground", className)}
      {...props} />
  );
})
FormDescription.displayName = "FormDescription"

const FormMessage = React.forwardRef(({ className, customFeedback, children, ...props }, ref) => {
  const info = useFormFieldInfo()
  const { errors } = useFormState({ name: info.name })

  const getErrorMessage = React.useCallback((error) => {
    if (!error) return null
    if (typeof error.message === 'string') return error.message

    if (Array.isArray(error)) {
      for (const item of error) {
        const msg = getErrorMessage(item)
        if (msg) return msg
      }
    }

    if (typeof error === 'object') {
      for (const key in error) {
        const msg = getErrorMessage(error[key])
        if (msg) return msg
      }
    }

    return null
  }, [])

  const fieldError = info.name ? info.name.split('.').reduce((acc, part) => acc?.[part], errors) : undefined;
  const message = getErrorMessage(fieldError) || customFeedback?.message || children

  const isWarning = customFeedback?.type === 'overlap' || customFeedback?.type === 'warning';

  return (
    <FormMessageContent
      ref={ref}
      id={info.formMessageId}
      className={cn(isWarning ? 'text-amber-400' : 'text-destructive', className)}
      message={message}
      {...props}
    />
  );
})
FormMessage.displayName = "FormMessage"

/**
 * Memoized content for FormMessage to prevent re-renders if the message text hasn't changed.
 */
const FormMessageContent = React.memo(React.forwardRef(({ message, className, id, ...props }, ref) => {
  if (!message) return null;

  return (
    <p
      ref={ref}
      id={id}
      className={cn("text-[0.8rem] font-medium", className)}
      {...props}>
      {message}
    </p>
  );
}), (prev, next) => prev.message === next.message && prev.className === next.className);
FormMessageContent.displayName = "FormMessageContent";


/**
 * A highly optimized, generic memoized component for form fields.
 * It prevents re-renders of the Label, Description, and Container 
 * when the parent form re-renders (due to errors or other state changes).
 * 
 * Supports both standard and "Switch" (horizontal) layouts.
 */
const SmartFormItem = React.memo(({
  name,
  label,
  description,
  InputComponent,
  inputProps = {},
  className,
  labelClassName,
  isSwitchLayout = false,
  required = false,
  hideMessage = false,
  customFeedback = null,
}) => {
  const feedbackBorderClass = React.useMemo(() => {
    if (customFeedback?.type === 'invalid' || customFeedback?.type === 'error') {
      return 'border-destructive focus:border-destructive focus-visible:border-destructive';
    }
    if (customFeedback?.type === 'overlap' || customFeedback?.type === 'warning') {
      return 'border-amber-500/70 focus:border-amber-500 focus-visible:border-amber-500';
    }
    return '';
  }, [customFeedback?.type]);

  const finalInputProps = React.useMemo(() => {
    return feedbackBorderClass 
        ? { ...inputProps, feedbackBorderClass, className: cn(inputProps.className, feedbackBorderClass) } 
        : inputProps;
  }, [inputProps, feedbackBorderClass]);

  return (
    <FormFieldUncontrolled name={name}>
      <FormItem className={cn(
        isSwitchLayout ? "flex items-center justify-between p-3 rounded-lg bg-slate-700/40 border-2 border-slate-600 space-y-0" : "space-y-1",
        className
      )}>
        {isSwitchLayout ? (
          <>
            <div className="space-y-0.5">
              {label && (
                <FormLabel className={cn(labelClassName)}>
                  {label} {required && <span className="text-red-400">*</span>}
                </FormLabel>
              )}
              {description && (
                <FormDescription className="text-[10px] text-slate-400">
                  {description}
                </FormDescription>
              )}
            </div>
            <FormControl>
              <InputComponent name={name} {...finalInputProps} />
            </FormControl>
          </>
        ) : (
          <>
            {label && (
              <FormLabel className={labelClassName}>
                {label} {required && <span className="text-red-400">*</span>}
              </FormLabel>
            )}
            <FormControl>
              <InputComponent name={name} {...finalInputProps} />
            </FormControl>
            {description && (
              <FormDescription className="text-[10px] text-slate-400">
                {description}
              </FormDescription>
            )}
          </>
        )}
        {!hideMessage && <FormMessage customFeedback={customFeedback} className="text-[10px]" />}
      </FormItem>
    </FormFieldUncontrolled>
  );
}, (prev, next) => {
  // Deep comparison for inputProps to handle object literals effectively
  const inputPropsEqual = JSON.stringify(prev.inputProps) === JSON.stringify(next.inputProps);

  return (
    prev.name === next.name &&
    prev.label === next.label &&
    prev.description === next.description &&
    prev.InputComponent === next.InputComponent &&
    prev.className === next.className &&
    prev.labelClassName === next.labelClassName &&
    prev.isSwitchLayout === next.isSwitchLayout &&
    prev.required === next.required &&
    inputPropsEqual &&
    prev.customFeedback?.message === next.customFeedback?.message &&
    prev.customFeedback?.type === next.customFeedback?.type
  );
});
SmartFormItem.displayName = "SmartFormItem";

export {
  useFormField,
  Form,
  FormItem,
  FormLabel,
  FormControl,
  FormDescription,
  FormMessage,
  FormField,
  FormFieldUncontrolled,
  SmartFormItem,
}
