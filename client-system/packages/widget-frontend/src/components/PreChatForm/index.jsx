import { useChatSocket } from '@hooks/useChatSocket';
import { useChatStore } from '@stores/chatStore';
import { Debouncer } from '@tanstack/pacer';
import { useForm } from '@tanstack/react-form';
import DOMPurify from 'dompurify';
import {
  ArrowRight,
  Check,
  ChevronRight,
  Headphones,
  HelpCircle,
  Loader2,
  Mail,
  MessageCircle,
  MessageCircleMore,
  MessageSquare,
  MessageSquareMore,
  MessageSquareText,
  MessagesSquare,
  Play,
  Rocket,
  Send,
  Smile,
  Sparkles,
  User,
  UserPlus,
  Zap,
} from 'lucide-react';
import { memo, useCallback, useEffect, useRef } from 'react';
import { z } from 'zod';
import { Button } from '@/components/ui/button';
import { Card } from '@/components/ui/card';
import { FormControl, FormItem, FormLabel, FormMessage } from '@/components/ui/form';
import { Input } from '@/components/ui/input';
import { usePreChatFormValidation } from '@/stores/preChatFormValidationStore';
import { useThemeStore } from '@/stores/themeStore';
import { extractBaseShadowColor } from '@/utils/colorUtils';
import WidgetSimpleHeader from '../WidgetSimpleHeader';

// Map icon IDs to Lucide components
const headerIconMap = {
  'message-square': MessageSquare,
  'message-square-more': MessageSquareMore,
  'message-square-text': MessageSquareText,
  'messages-square': MessagesSquare,
  'message-circle': MessageCircle,
  'message-circle-more': MessageCircleMore,
  headphones: Headphones,
  'help-circle': HelpCircle,
  smile: Smile,
  zap: Zap,
  sparkles: Sparkles,
  send: Send,
  'arrow-right': ArrowRight,
  'chevron-right': ChevronRight,
  play: Play,
  check: Check,
  rocket: Rocket,
  'user-plus': UserPlus,
};

// --- Validation Schemas ---
const nameSchema = z
  .string()
  .min(2, 'Nama harus minimal 2 karakter')
  .max(50, 'Nama maksimal 50 karakter')
  .regex(/^[a-zA-Z\s]*$/, 'Nama hanya boleh berisi huruf dan spasi');

const emailSchema = z.email('Mohon masukkan alamat email yang valid').min(1, 'Email wajib diisi');

// --- Debounce Delay Constant ---
const VALIDATION_DEBOUNCE_MS = 700;

// --- Custom Hook to wire inputs to store ---
const useStoreValidator = (fieldName, schema, delay = VALIDATION_DEBOUNCE_MS) => {
  const valueRef = useRef('');
  const hasInteractedRef = useRef(false);

  const debouncerRef = useRef(
    new Debouncer(
      (val) => {
        const res = schema.safeParse(val);
        usePreChatFormValidation.getState().setFieldState(fieldName, {
          error: res.success ? null : res.error.issues[0].message,
          isPending: false,
        });
      },
      { wait: delay },
    ),
  );

  const handleChange = useCallback(
    (val) => {
      valueRef.current = val;
      const isEmpty = val.trim().length === 0;

      if (!hasInteractedRef.current && val.length > 0) {
        hasInteractedRef.current = true;
      }

      // Dispatch to store to toggle pending state & disable button instantly
      usePreChatFormValidation.getState().setFieldState(fieldName, {
        isPending: true,
        isEmpty,
      });

      debouncerRef.current.maybeExecute(val);
    },
    [fieldName],
  );

  const validate = useCallback(() => {
    const val = valueRef.current;
    if (!hasInteractedRef.current && val.length === 0) {
      const res = schema.safeParse(val);
      const err = res.success ? null : res.error.issues[0].message;
      usePreChatFormValidation
        .getState()
        .setFieldState(fieldName, { error: err, isPending: false, isEmpty: true });
      return err;
    }
    const res = schema.safeParse(val);
    const err = res.success ? null : res.error.issues[0].message;
    usePreChatFormValidation.getState().setFieldState(fieldName, { error: err, isPending: false });
    return err;
  }, [fieldName, schema]);

  return { handleChange, validate };
};

// --- Mini Components for Isolated Renders ---
// These components read from the Zustand store individually.
// This completely stops the main `PreChatForm` from ever re-rendering during typing/validation!

const ErrorMessage = ({ name }) => {
  const error = usePreChatFormValidation((s) => s[name].error);
  return (
    <FormMessage className="fade-in slide-in-from-top-1 animate-in duration-200">
      {error}
    </FormMessage>
  );
};

const ValidatedInput = ({ fieldName, field, validator, theme }) => {
  const error = usePreChatFormValidation((s) => s[fieldName].error);
  const { borderColor, bgColor, formColor, activeState } = theme;

  return (
    <Input
      id={field.name}
      type={fieldName === 'email' ? 'email' : 'text'}
      value={field.state.value}
      onChange={(e) => {
        field.handleChange(e.target.value);
        validator.handleChange(e.target.value);
      }}
      placeholder={fieldName === 'email' ? 'john@example.com' : 'John Doe'}
      className={`border py-5 pl-11 transition-all duration-200 placeholder:text-[var(--input-placeholder)] focus:border-[var(--input-focus-border)] focus:bg-[var(--input-focus-bg)] focus:ring-2 focus:ring-[var(--input-focus-ring)] ${
        error
          ? 'border-red-500 bg-red-50 focus:border-red-500 focus:ring-red-100'
          : 'border-[var(--input-border)] bg-[var(--input-bg)]'
      }`}
      style={
        error
          ? {}
          : {
              '--input-border': borderColor,
              '--input-bg': bgColor,
              '--input-focus-border': activeState.borderColor,
              '--input-focus-bg': activeState.backgroundColor,
              '--input-focus-ring': activeState.ringColor,
              '--input-placeholder': formColor,
            }
      }
    />
  );
};

const SubmitButton = ({ isMobile, theme }) => {
  const isSubmitting = usePreChatFormValidation((s) => s.isSubmitting);
  const { backgroundColor, hoverColor, activeColor, iconSettings, textSettings } = theme;

  // Minimal selector: Only triggers a component re-render when the boolean disabled state flips
  const isSubmitDisabled = usePreChatFormValidation((s) => {
    const isFormIncomplete = s.name.isEmpty || s.email.isEmpty;
    const hasErrors = Boolean(s.name.error) || Boolean(s.email.error);
    const isValidationPending = s.name.isPending || s.email.isPending;
    return s.isSubmitting || isFormIncomplete || hasErrors || isValidationPending;
  });

  const baseShadowColor = extractBaseShadowColor(backgroundColor, true);

  // Resolve icon
  const IconComponent = headerIconMap[iconSettings?.icon] || ArrowRight;
  const resolvedIcon =
    iconSettings?.type === 'custom' && iconSettings?.imageUrl ? (
      <img src={iconSettings.imageUrl} alt="Icon" className="h-5 w-5 rounded-full object-cover" />
    ) : (
      <IconComponent className="h-5 w-5" style={{ color: iconSettings?.color }} />
    );

  const normalShadow = `0 10px 25px -5px #${baseShadowColor}40, 0 8px 10px -6px #${baseShadowColor}40`;
  const hoverShadow = `0 20px 25px -5px #${baseShadowColor}4d, 0 10px 10px -5px #${baseShadowColor}4d`;

  return (
    <Button
      type="submit"
      disabled={isSubmitDisabled}
      className={`mt-auto flex w-full items-center justify-center gap-2 rounded-xl py-6 transition-all duration-200 active:scale-[0.98] ${
        isMobile ? 'mb-[max(0px,env(safe-area-inset-bottom))]' : ''
      } ${textSettings?.fontWeight || 'font-medium'} ${textSettings?.italic ? 'italic' : ''}`}
      style={{
        background: backgroundColor,
        color: textSettings?.color || '#FFFFFF',
        fontSize: textSettings?.fontSize
          ? `${textSettings.fontSize}${textSettings.fontSizeUnit || 'px'}`
          : '14px',
        boxShadow: normalShadow,
      }}
      onMouseEnter={(e) => {
        if (!isSubmitDisabled) {
          e.currentTarget.style.background = hoverColor;
          e.currentTarget.style.boxShadow = hoverShadow;
        }
      }}
      onMouseLeave={(e) => {
        if (!isSubmitDisabled) {
          e.currentTarget.style.background = backgroundColor;
          e.currentTarget.style.boxShadow = normalShadow;
        }
      }}
    >
      {textSettings?.text}
      {isSubmitting ? <Loader2 className="h-5 w-5 animate-spin" /> : resolvedIcon}
    </Button>
  );
};

// --- Extracted Static Header (Memoized to prevent ANY re-renders) ---
const PreChatHeader = memo(({ theme }) => {
  const { titleSettings = {}, subtitleSettings = {}, iconSettings } = theme;
  const { type, icon, imageUrl, color, backgroundColor } = iconSettings || {};

  // Resolve icon
  const IconComponent = headerIconMap[icon] || MessageCircle;
  const resolvedIcon =
    type === 'custom' && imageUrl ? (
      <img src={imageUrl} alt="Icon" className="h-8 w-8 rounded-full object-cover" />
    ) : (
      <IconComponent className="h-8 w-8" />
    );

  return (
    <div className="px-6 pt-8 pb-2 text-center">
      <div
        className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-2xl"
        style={{ backgroundColor, color }}
      >
        {resolvedIcon}
      </div>
      <h2
        className={`mb-2 font-Inter ${titleSettings.fontWeight || 'font-bold'} ${titleSettings.italic ? 'italic' : ''}`}
        style={{
          color: titleSettings.color,
          fontSize: titleSettings.fontSize
            ? `${titleSettings.fontSize}${titleSettings.fontSizeUnit || 'px'}`
            : undefined,
        }}
      >
        {titleSettings.text}
      </h2>
      <p
        className={`font-Inter ${subtitleSettings.fontWeight || 'font-normal'} ${subtitleSettings.italic ? 'italic' : ''}`}
        style={{
          color: subtitleSettings.color,
          fontSize: subtitleSettings.fontSize
            ? `${subtitleSettings.fontSize}${subtitleSettings.fontSizeUnit || 'px'}`
            : undefined,
        }}
      >
        {subtitleSettings.text}
      </p>
    </div>
  );
});
PreChatHeader.displayName = 'PreChatHeader';

// --- Thematic Header Selectors ---
const ThemeHeaderTitle = () => (
  <>{useThemeStore((s) => s.theme.preChatForm.header.titleSettings?.text)}</>
);
const ThemeHeaderSubtitle = () => (
  <>{useThemeStore((s) => s.theme.preChatForm.header.subtitleSettings?.text)}</>
);

const ThemedWidgetHeader = ({ onClose, isMobile }) => {
  const headerTheme = useThemeStore((s) => s.theme.preChatForm.header);
  const { type, icon, imageUrl } = headerTheme.iconSettings || {};

  // Resolve icon
  const IconComponent = headerIconMap[icon] || MessageCircle;
  const resolvedIcon =
    type === 'custom' && imageUrl ? (
      <img src={imageUrl} alt="Icon" className="h-4 w-4 rounded-full object-cover" />
    ) : (
      <IconComponent className="h-4 w-4" />
    );

  return (
    <WidgetSimpleHeader
      title={<ThemeHeaderTitle />}
      subtitle={<ThemeHeaderSubtitle />}
      icon={resolvedIcon}
      onClose={onClose}
      isMobile={isMobile}
      theme={headerTheme}
    />
  );
};

/**
 * PreChatForm - Initial form to collect visitor info
 */
const PreChatForm = ({ backendUrl, clientId, isMobile }) => {
  const setVisitorInfo = useChatStore((s) => s.setVisitorInfo);
  const closeWidget = useChatStore((s) => s.closeWidget);
  const { startChat } = useChatSocket(backendUrl, clientId);

  // 1. Wire up the standalone store connections
  const nameValidator = useStoreValidator('name', nameSchema);
  const emailValidator = useStoreValidator('email', emailSchema);

  // 2. Initialize store on mount (clean up any previous state)
  useEffect(() => {
    // Reset the store when the component mounts to handle re-opens
    usePreChatFormValidation.setState({
      name: { error: null, isPending: false, isEmpty: true },
      email: { error: null, isPending: false, isEmpty: true },
      isSubmitting: false,
    });
  }, []);

  // --- TanStack Form ---
  const form = useForm({
    defaultValues: { name: '', email: '' },
    onSubmit: async ({ value }) => {
      // Synchronous validation fallback before submit
      const nameErr = nameValidator.validate();
      const emailErr = emailValidator.validate();

      if (nameErr || emailErr) return;

      usePreChatFormValidation.getState().setSubmitting(true);
      try {
        const sanitizedInfo = {
          name: DOMPurify.sanitize(value.name).trim(),
          email: DOMPurify.sanitize(value.email).trim().toLowerCase(),
        };
        setVisitorInfo(sanitizedInfo);
        startChat(sanitizedInfo);
      } catch {
        usePreChatFormValidation.getState().setSubmitting(false);
      }
    },
  });

  const { preChatForm } = useThemeStore((s) => s.theme);
  const { form: formTheme } = preChatForm;

  return (
    <Card
      className={`flex h-full flex-col overflow-hidden border border-gray-200 bg-white shadow-2xl ${isMobile ? '' : 'rounded-xl'}`}
    >
      <ThemedWidgetHeader onClose={closeWidget} isMobile={isMobile} />

      <div className="flex flex-1 flex-col overflow-y-auto">
        <PreChatHeader theme={preChatForm.welcomeMessage} />

        <form
          onSubmit={(e) => {
            e.preventDefault();
            e.stopPropagation();
            form.handleSubmit();
          }}
          className="flex flex-1 flex-col gap-4 p-6"
        >
          {/* Name Field Group */}
          <FormItem>
            <FormLabel htmlFor="name" style={{ color: formTheme.labelColor }}>
              Nama Lengkap
            </FormLabel>
            <div className="relative">
              <User
                className="absolute top-1/2 left-3.5 z-10 h-5 w-5 -translate-y-1/2"
                style={{ color: formTheme.formColor }}
              />
              <FormControl>
                {/* Only the Input render-prop changes on keystroke */}
                <form.Field name="name">
                  {(field) => (
                    <ValidatedInput
                      fieldName="name"
                      field={field}
                      validator={nameValidator}
                      theme={formTheme}
                    />
                  )}
                </form.Field>
              </FormControl>
            </div>
            {/* FormMessage only re-renders when the generic Zustand store changes error value */}
            <ErrorMessage name="name" />
          </FormItem>

          {/* Email Field Group */}
          <FormItem>
            <FormLabel htmlFor="email" style={{ color: formTheme.labelColor }}>
              Alamat Email
            </FormLabel>
            <div className="relative">
              <Mail
                className="absolute top-1/2 left-3.5 z-10 h-5 w-5 -translate-y-1/2"
                style={{ color: formTheme.formColor }}
              />
              <FormControl>
                <form.Field name="email">
                  {(field) => (
                    <ValidatedInput
                      fieldName="email"
                      field={field}
                      validator={emailValidator}
                      theme={formTheme}
                    />
                  )}
                </form.Field>
              </FormControl>
            </div>
            <ErrorMessage name="email" />
          </FormItem>

          {/* Submit button only re-renders when disabling condition actually flips */}
          <SubmitButton isMobile={isMobile} theme={preChatForm.submitButton} />
        </form>
      </div>
    </Card>
  );
};

export default PreChatForm;
