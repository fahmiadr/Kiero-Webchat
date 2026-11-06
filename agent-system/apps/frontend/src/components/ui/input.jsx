import * as React from "react"
import { cva } from "class-variance-authority";
import { Eye, EyeOff, Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils"
import { Button } from "@/components/ui/button"
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from "@/components/ui/tooltip"

const inputVariants = cva(
  "flex h-9 w-full rounded-md border-2 border-slate-600 bg-slate-700/40 px-3 py-1 text-xs shadow-sm transition-all duration-200 text-slate-200 cursor-text placeholder:text-slate-500 placeholder:select-none hover:border-slate-500 hover:bg-slate-700/60 focus-visible:outline-none focus-visible:border-blue-500 focus-visible:bg-slate-700/60 focus-visible:ring-0 aria-invalid:border-destructive aria-invalid:hover:border-destructive aria-invalid:focus-visible:border-destructive disabled:cursor-not-allowed disabled:opacity-50 [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
  {
    variants: {
      font: {
        default: "font-sans",
        mono: "font-mono",
      },
      layout: {
        default: "",
        credential: "pr-10",
      }
    },
    defaultVariants: {
      font: "default",
      layout: "default",
    },
  }
)

const Input = React.forwardRef(({ className, type, font, layout, suffix, ...props }, ref) => {
  const [isFocused, setIsFocused] = React.useState(false);
  const localValue = props.value ?? props.defaultValue ?? "";

  const handleFocus = (e) => {
    setIsFocused(true);
    props.onFocus?.(e);
  };

  const handleBlur = (e) => {
    setIsFocused(false);

    // Universal "Smart" Numeric Sanitization
    if (type === "number") {
      const currentVal = (e.target.value ?? "").toString().trim();
      if (currentVal !== "") {
        let num = Number(currentVal);

        // Handle symbols like ++5, --5, or just symbols
        if (isNaN(num)) {
          const match = currentVal.match(/-?\d+\.?\d*/);
          num = match ? Number(match[0]) : NaN;
        }

        const min = props.min !== undefined ? Number(props.min) : -Infinity;
        const max = props.max !== undefined ? Number(props.max) : Infinity;

        // If still NaN or just symbols, fallback to min or 0
        if (isNaN(num)) {
          num = min !== -Infinity ? min : 0;
        }

        // Clamp to bounds
        if (num < min) num = min;
        else if (num > max) num = max;

        // Sync back to the input and trigger change if needed
        const finalStr = String(num);
        if (finalStr !== currentVal) {
          e.target.value = finalStr;
          props.onChange?.(e);
        }
      }
    }

    props.onBlur?.(e);
  };

  // If no suffix, return standard input
  if (!suffix) {
    return (
      <input
        type={type}
        className={cn(inputVariants({ font, layout, className }))}
        onFocus={handleFocus}
        onBlur={handleBlur}
        ref={ref}
        {...props}
      />
    );
  }

  // Suffix-enabled input
  return (
    <div
      className={cn(
        "group relative flex items-center h-9 w-full rounded-md border-2 shadow-sm transition-all duration-200 overflow-hidden",
        isFocused
          ? "border-blue-500 bg-slate-700/60 outline-none ring-0 focus-within:ring-0"
          : "border-slate-600 bg-slate-700/40 hover:border-slate-500 hover:bg-slate-700/60",
        props["aria-invalid"] ? "border-destructive hover:border-destructive focus-within:border-destructive" : "",
        layout === "credential" ? "pr-10" : "",
        className
      )}
    >
      <input
        {...props}
        type={type}
        ref={ref}
        onFocus={handleFocus}
        onBlur={handleBlur}
        className={cn(
          "absolute inset-0 w-full h-full bg-transparent px-3 py-1 text-xs text-slate-200 outline-none border-none focus:ring-0 cursor-text placeholder:text-slate-500 placeholder:select-none",
          font === "mono" ? "font-mono" : "font-sans",
          "[appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none",
          props.className
        )}
      />

      <div className="flex-1 flex items-center h-full px-3 pointer-events-none overflow-hidden">
        <div className="flex items-center min-w-0 max-w-full">
          <span className={cn(
            "invisible whitespace-pre text-xs shrink",
            font === "mono" ? "font-mono" : "font-sans"
          )}>
            {localValue || ""}
          </span>
          {!isFocused && suffix && localValue && (
            <span className="ml-2 shrink-0 text-[10px] font-bold text-slate-500 uppercase transition-colors group-hover:text-slate-400">
              {suffix}
            </span>
          )}
        </div>
      </div>
    </div>
  );
})
Input.displayName = "Input"

// Memoized Reveal Button to prevent re-renders on input value changes
const RevealButton = React.memo(({ isVisible, isLoading, onClick }) => (
  <Tooltip delayDuration={0}>
    <TooltipTrigger asChild>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="absolute right-0 top-0 h-full w-10 text-slate-400 hover:text-slate-200 hover:bg-transparent"
        onClick={onClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : isVisible ? (
          <EyeOff className="h-4 w-4" />
        ) : (
          <Eye className="h-4 w-4" />
        )}
      </Button>
    </TooltipTrigger>
    <TooltipContent className="z-50 text-xs px-2 py-1 h-auto min-h-0 bg-slate-900 border-slate-700 text-slate-200">
      {isVisible ? 'Hide' : 'Show'}
    </TooltipContent>
  </Tooltip>
));
RevealButton.displayName = "RevealButton";

// Memoized Action Button (Copy/Cancel/X)
const ActionButton = React.memo(({ icon: Icon, label, onClick, isLoading, variant = "outline", className }) => (
  <Tooltip delayDuration={0}>
    <TooltipTrigger asChild>
      <Button
        type="button"
        size="icon"
        variant={variant}
        className={cn(
          "h-9 w-9 bg-transparent border-none hover:bg-slate-700/60 text-slate-400 hover:text-slate-200 shrink-0",
          className
        )}
        onClick={onClick}
        disabled={isLoading}
      >
        {isLoading ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Icon className="h-4 w-4" />
        )}
      </Button>
    </TooltipTrigger>
    <TooltipContent className="z-50 text-xs px-2 py-1 h-auto min-h-0 bg-slate-900 border-slate-700 text-slate-200">
      {label}
    </TooltipContent>
  </Tooltip>
));
ActionButton.displayName = "ActionButton";

const CredentialInput = React.memo(React.forwardRef(({
  isVisible,
  isLoadingReveal,
  onToggleVisibility,
  actionIcon,
  actionLabel,
  onActionClick,
  isLoadingAction,
  actionVariant,
  actionClassName,
  font = "mono",
  ...props
}, ref) => {
  return (
    <div className="flex items-center gap-2">
      <div className="relative flex-1 group/input">
        <Input
          ref={ref}
          layout="credential"
          font={font}
          {...props}
        />
        {onToggleVisibility && (
          <RevealButton
            isVisible={isVisible}
            isLoading={isLoadingReveal}
            onClick={onToggleVisibility}
          />
        )}
      </div>
      {actionIcon && (
        <ActionButton
          icon={actionIcon}
          label={actionLabel}
          onClick={onActionClick}
          isLoading={isLoadingAction}
          variant={actionVariant}
          className={actionClassName}
        />
      )}
    </div>
  );
}));
CredentialInput.displayName = "CredentialInput"

const InputContainer = React.forwardRef(({ className, children, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(
        "group relative min-h-9 max-h-48 overflow-y-auto px-3 py-2 rounded-md border-2 border-slate-600 bg-slate-700/40 shadow-sm transition-all duration-200 cursor-text",
        "hover:not-focus-within:border-slate-500 hover:not-focus-within:bg-slate-700/60",
        "focus-within:border-blue-500 focus-within:bg-slate-700/60 focus-within:ring-0",
        props["aria-invalid"] ? "border-destructive hover:not-focus-within:border-destructive focus-within:border-destructive" : "",
        "[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-slate-500/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-thumb:hover]:cursor-default [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-transparent",
        className
      )}
      {...props}
    >
      {children}
    </div>
  );
});
InputContainer.displayName = "InputContainer";

const inputChipVariants = cva(
  "flex flex-nowrap items-center gap-1.5 pl-2.5 pr-1 py-1 text-xs font-medium rounded-full animate-in fade-in zoom-in duration-200 w-fit max-w-full overflow-hidden shrink-0 border",
  {
    variants: {
      variant: {
        blue: "text-blue-200 bg-blue-900/30 border-blue-800",
        emerald: "text-emerald-200 bg-emerald-900/30 border-emerald-800",
      },
    },
    defaultVariants: {
      variant: "blue",
    },
  }
)

const InputChip = React.forwardRef(({ className, variant, label, onRemove, ...props }, ref) => {
  return (
    <div
      ref={ref}
      className={cn(inputChipVariants({ variant, className }))}
      {...props}
    >
      <span className="min-w-0 truncate leading-none">{label}</span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        onClick={onRemove}
        className={cn(
          "w-4 h-4 shrink-0 rounded-full p-0 flex items-center justify-center transition-colors",
          variant === "emerald"
            ? "hover:bg-emerald-800/50 text-emerald-300 hover:text-emerald-100"
            : "hover:bg-blue-800/50 text-blue-300 hover:text-blue-100"
        )}
      >
        <X className="w-3 h-3" />
      </Button>
    </div>
  );
});
InputChip.displayName = "InputChip";

const InputChipField = React.forwardRef(({
  value,
  onChange,
  onAdd,
  onRemoveLast,
  placeholder,
  font = "default",
  lowercase = false,
  className,
  ...props
}, ref) => {
  const [localValue, setLocalValue] = React.useState("");

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      const val = lowercase ? localValue.trim().toLowerCase() : localValue.trim();
      if (val && !value.includes(val)) {
        onAdd(val);
        setLocalValue("");
      }
    } else if (e.key === 'Backspace' && !localValue && value.length > 0) {
      onRemoveLast();
    }
    props.onKeyDown?.(e);
  };

  const handleBlur = (e) => {
    const val = lowercase ? localValue.trim().toLowerCase() : localValue.trim();
    if (val && !value.includes(val)) {
      onAdd(val);
      setLocalValue("");
    }
    props.onBlur?.(e);
  };

  return (
    <input
      {...props}
      ref={ref}
      type="text"
      value={localValue}
      onChange={(e) => setLocalValue(e.target.value)}
      onKeyDown={handleKeyDown}
      onBlur={handleBlur}
      placeholder={value.length === 0 ? placeholder : ""}
      className={cn(
        "flex-1 bg-transparent border-none text-xs text-slate-200 cursor-text placeholder:select-none placeholder:text-slate-500 focus:outline-none",
        font === "mono" ? "font-mono" : "font-sans",
        className
      )}
    />
  );
});
InputChipField.displayName = "InputChipField";

const ChipInput = React.forwardRef(({
  value = [],
  onChange,
  variant = "blue",
  font,
  lowercase,
  placeholder,
  className,
  containerClassName,
  "aria-invalid": ariaInvalid,
  ...props
}, ref) => {
  const inputRef = React.useRef(null);
  const containerRef = React.useRef(null);

  // Combine external and internal refs
  React.useImperativeHandle(ref, () => inputRef.current);

  const handleAdd = (val) => {
    onChange([...value, val]);
  };

  const handleRemove = (index) => {
    onChange(value.filter((_, i) => i !== index));
  };

  const handleRemoveLast = () => {
    onChange(value.slice(0, -1));
  };

  // Scroll to bottom when adding new chips
  React.useEffect(() => {
    if (containerRef.current) {
      containerRef.current.scrollTop = containerRef.current.scrollHeight;
    }
  }, [value.length]);

  return (
    <InputContainer
      ref={containerRef}
      className={cn("flex flex-wrap items-center content-start gap-2", containerClassName)}
      aria-invalid={ariaInvalid}
    >
      {value.map((item, index) => (
        <InputChip
          key={`${item}-${index}`}
          variant={variant}
          label={item}
          onRemove={() => handleRemove(index)}
        />
      ))}
      <InputChipField
        ref={inputRef}
        value={value}
        onAdd={handleAdd}
        onRemoveLast={handleRemoveLast}
        placeholder={placeholder}
        font={font}
        lowercase={lowercase}
        className={className}
        {...props}
      />
    </InputContainer>
  );
});
ChipInput.displayName = "ChipInput";

export { Input, CredentialInput, inputVariants, InputContainer, InputChip, InputChipField, ChipInput, ActionButton }
