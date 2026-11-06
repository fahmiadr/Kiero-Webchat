import { useState, useEffect, useRef, memo, useCallback } from 'react';
import {
    Sheet,
    SheetContent,
    SheetDescription,
    SheetHeader,
    SheetTitle,
    SheetFooter,
} from '@/components/ui/sheet';
import {
    Form,
    FormControl,
    SmartFormItem
} from "@/components/ui/form";
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import { Separator } from '@/components/ui/separator';
import { Label } from '@/components/ui/label';
import {
    X, ShieldCheck, Edit, Copy, RefreshCw, Loader2, AppWindow
} from "lucide-react";
import { Debouncer } from "@tanstack/pacer";
import { Input, CredentialInput, ChipInput } from '@/components/ui/input';

import { useForm, useFormState, useWatch, useFormContext } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import * as z from "zod";
import { copyToClipboard } from '@/utils/clipboard';

const DebouncedFormInput = memo(({ name, as: Component = Input, ...props }) => {
    const { control, setValue } = useFormContext();
    const watchedValue = useWatch({ control, name });
    const [localValue, setLocalValue] = useState(watchedValue || "");
    const debouncerRef = useRef(null);

    // Sync with form resets or external changes
    useEffect(() => {
        if (watchedValue !== localValue) {
            setLocalValue(watchedValue);
        }
    }, [watchedValue]);

    useEffect(() => {
        debouncerRef.current = new Debouncer(
            (val) => {
                setValue(name, val, {
                    shouldDirty: true,
                    shouldValidate: true,
                    shouldTouch: true
                });
            },
            { wait: 500 }
        );

        return () => {
            debouncerRef.current?.cancel();
        };
    }, [name, setValue]);

    const handleChange = (e) => {
        const val = e.target.value;
        setLocalValue(val);
        debouncerRef.current?.maybeExecute(val);
    };

    return (
        <Component
            {...props}
            value={localValue}
            onChange={handleChange}
        />
    );
});
DebouncedFormInput.displayName = 'DebouncedFormInput';


const OriginsSelector = memo(({ name, ...props }) => {
    const { control, setValue } = useFormContext();
    const watchedValue = useWatch({ control, name }) || [];

    return (
        <ChipInput
            {...props}
            value={watchedValue}
            onChange={(val) => setValue(name, val, { shouldValidate: true, shouldDirty: true })}
            placeholder="e.g. https://example.com"
            variant="blue"
            font="mono"
            containerClassName="mt-1"
        />
    );
});
OriginsSelector.displayName = 'OriginsSelector';

const clientFormSchema = z.object({
    name: z.string().min(2, {
        message: "Must be at least 2 characters.",
    }),
    allowedOrigins: z.array(z.url("Invalid URL format")),
    webhookUrl: z.url("Invalid URL format").optional().or(z.literal('')),
    webhookToken: z.string().optional().or(z.literal('')),
    active: z.boolean().default(true),
});

const TokenInput = memo(({ name, client }) => {
    const [isEditingWebhookToken, setIsEditingWebhookToken] = useState(false);
    const [showWebhookToken, setShowWebhookToken] = useState(false);
    const { setValue } = useFormContext();

    const handleToggle = useCallback(() => {
        setShowWebhookToken(prev => !prev);
    }, []);

    const handleCancel = useCallback(() => {
        setIsEditingWebhookToken(false);
        setValue(name, "");
    }, [name, setValue]);

    if (client && client.webhookToken && !isEditingWebhookToken) {
        return (
            <div className="flex items-center justify-between p-3 rounded-md bg-emerald-500/10 border-2 border-emerald-500/20 mt-1">
                <div className="flex items-center gap-3">
                    <div className="bg-emerald-500/20 p-2 rounded-full text-emerald-500">
                        <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div className="flex flex-col">
                        <span className="text-sm font-medium text-emerald-400">Token Configured</span>
                        <span className="text-xs text-slate-400">A secure token is currently set.</span>
                    </div>
                </div>
                <Button
                    type="button"
                    size="sm"
                    className="h-8 bg-slate-700/40 hover:bg-slate-700/60 hover:text-white text-slate-200"
                    onClick={() => setIsEditingWebhookToken(true)}
                >
                    <Edit className="w-3.5 h-3.5 mr-2" />
                    Change
                </Button>
            </div>
        );
    }

    return (
        <div className="mt-1">
            <FormControl>
                <DebouncedFormInput
                    name={name}
                    as={CredentialInput}
                    type={showWebhookToken ? "text" : "password"}
                    placeholder="e.g. Bearer my-secret-token"
                    isVisible={showWebhookToken}
                    onToggleVisibility={handleToggle}
                    actionIcon={client?.webhookToken ? X : undefined}
                    actionLabel="Cancel"
                    onActionClick={handleCancel}
                    autoComplete="off"
                />
            </FormControl>
        </div>
    );
});
TokenInput.displayName = 'TokenInput';

const ApiKeyField = memo(({ client, onRevealApiKey }) => {
    const [showApiKey, setShowApiKey] = useState(false);
    const [revealedApiKey, setRevealedApiKey] = useState(null);
    const [isRevealingApiKey, setIsRevealingApiKey] = useState(false);

    const handleToggleApiKey = useCallback(async () => {
        if (showApiKey) {
            setShowApiKey(false);
            return;
        }

        if (revealedApiKey) {
            setShowApiKey(true);
            return;
        }

        if (!onRevealApiKey || !client) return;
        setIsRevealingApiKey(true);
        try {
            const data = await onRevealApiKey(client.id);
            setRevealedApiKey(data.apiKey);
            setShowApiKey(true);
        } catch {
            // Error handled upstream
        } finally {
            setIsRevealingApiKey(false);
        }
    }, [showApiKey, revealedApiKey, onRevealApiKey, client, setIsRevealingApiKey, setRevealedApiKey, setShowApiKey]);

    const handleCopyApiKey = useCallback(async () => {
        if (revealedApiKey) {
            copyToClipboard(revealedApiKey, 'API Key');
            return;
        }

        if (!onRevealApiKey || !client) return;
        setIsRevealingApiKey(true);
        try {
            const data = await onRevealApiKey(client.id);
            setRevealedApiKey(data.apiKey);
            setShowApiKey(true);
            copyToClipboard(data.apiKey, 'API Key');
        } catch {
            // Error handled upstream
        } finally {
            setIsRevealingApiKey(false);
        }
    }, [revealedApiKey, onRevealApiKey, client, setIsRevealingApiKey, setRevealedApiKey, setShowApiKey]);

    return (
        <div className="mt-1 mb-2">
            <CredentialInput
                readOnly
                value={showApiKey && revealedApiKey
                    ? revealedApiKey
                    : `wk_${client.clientId}_******`
                }
                isVisible={showApiKey}
                isLoadingReveal={isRevealingApiKey}
                onToggleVisibility={handleToggleApiKey}
                actionIcon={Copy}
                actionLabel="Copy"
                onActionClick={handleCopyApiKey}
                isLoadingAction={isRevealingApiKey && !showApiKey}
            />
        </div>
    );
});
ApiKeyField.displayName = 'ApiKeyField';

const CredentialsSection = memo(({
    client,
    onRotateKey,
    onRotateSecret,
    onRevealApiKey,
    isRotatingKey,
    isRotatingSecret
}) => {
    // Unique ID for API Key state reset on rotation
    const [apiKeyRevision, setApiKeyRevision] = useState(0);

    const handleRotateKey = async (id) => {
        await onRotateKey(id);
        setApiKeyRevision(prev => prev + 1);
    };

    if (!client || !onRotateKey || !onRotateSecret) return null;

    return (
        <div className="space-y-3 p-4 bg-transparent rounded-md border border-slate-600">
            <div className="flex items-center gap-2 text-amber-500 mb-3">
                <ShieldCheck className="w-4 h-4" />
                <span className="text-md font-bold uppercase tracking-wider">Credentials</span>
            </div>
            <div>
                <Label>Client ID</Label>
                <div className="mt-1 mb-2">
                    <CredentialInput
                        readOnly
                        value={client.clientId}
                        actionIcon={Copy}
                        actionLabel="Copy"
                        onActionClick={() => copyToClipboard(client.clientId, 'Client ID')}
                    />
                </div>
            </div>
            <div>
                {/* API Key — Render Isolated Field */}
                <Label>API Key</Label>
                <ApiKeyField
                    key={`apiKey-${client.id}-${apiKeyRevision}`}
                    client={client}
                    onRevealApiKey={onRevealApiKey}
                />
                <Button
                    type="button"
                    size="sm"
                    className="h-8 bg-slate-700/40 hover:bg-slate-700/60 hover:text-white text-slate-200 w-full"
                    onClick={() => handleRotateKey(client.id)}
                    disabled={isRotatingKey}
                >
                    <RefreshCw className={`mr-1.5 h-3 w-3 ${isRotatingKey ? 'animate-spin' : ''}`} />
                    Rotate Key
                </Button>
            </div>

            <Separator className="bg-slate-700/80" />

            {/* Webhook Secret Rotation */}
            <div className="flex items-center justify-between">
                <div>
                    <Label>Webhook Secret</Label>
                    <p className="text-xs text-slate-400">Hidden (Encrypted)</p>
                </div>
                <Button
                    type="button"
                    size="sm"
                    className="h-8 bg-slate-700/40 hover:bg-slate-700/60 hover:text-white text-slate-200"
                    onClick={() => onRotateSecret(client.id)}
                    disabled={isRotatingSecret}
                >
                    <RefreshCw className={`mr-1.5 h-3 w-3 ${isRotatingSecret ? 'animate-spin' : ''}`} />
                    Rotate Secret
                </Button>
            </div>
        </div>
    );
});
CredentialsSection.displayName = 'CredentialsSection';

const DebouncedFormSwitch = memo(({ name }) => {
    const { control, setValue } = useFormContext();
    const watchedValue = useWatch({ control, name });
    const [localValue, setLocalValue] = useState(watchedValue);
    const debouncerRef = useRef(null);

    // Sync with form resets or external changes
    useEffect(() => {
        if (watchedValue !== localValue) {
            setLocalValue(watchedValue);
        }
    }, [watchedValue]);

    useEffect(() => {
        debouncerRef.current = new Debouncer(
            (val) => {
                setValue(name, val, {
                    shouldDirty: true,
                    shouldValidate: true,
                    shouldTouch: true
                });
            },
            { wait: 500 }
        );

        return () => {
            debouncerRef.current?.cancel();
        };
    }, [name, setValue]);

    const handleCheckedChange = (val) => {
        setLocalValue(val);
        debouncerRef.current?.maybeExecute(val);
    };

    return (
        <FormControl>
            <Switch
                className="data-[state=checked]:bg-blue-600"
                checked={localValue}
                onCheckedChange={handleCheckedChange}
            />
        </FormControl>
    );
});
DebouncedFormSwitch.displayName = 'DebouncedFormSwitch';

const FormSubmitButton = memo(({ control, client, isSubmitting }) => {
    const { isDirty, isValid } = useFormState({ control });
    return (
        <Button
            type="submit"
            className="w-full bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20"
            disabled={isSubmitting || (client && !isDirty) || !isValid}
        >
            {isSubmitting ? (
                <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {client ? 'Saving...' : 'Creating...'}
                </>
            ) : (
                <>
                    {client ? 'Save Changes' : 'Create Client'}
                </>
            )}
        </Button>
    );
});
FormSubmitButton.displayName = 'FormSubmitButton';

const ClientForm = memo(({
    open,
    onOpenChange,
    client,
    onSubmit,
    isSubmitting,
    onRotateKey,
    onRotateSecret,
    onRevealApiKey,
    isRotatingKey,
    isRotatingSecret
}) => {
    const form = useForm({
        resolver: zodResolver(clientFormSchema),
        defaultValues: {
            name: "",
            allowedOrigins: [],
            webhookUrl: "",
            webhookToken: "",
            active: true,
        },
    });

    // Reset form when opening/closing or changing client
    useEffect(() => {
        if (open) {
            if (client) {
                form.reset({
                    name: client.name,
                    allowedOrigins: Array.isArray(client.allowedOrigins)
                        ? client.allowedOrigins
                        : (client.allowedOrigins ? client.allowedOrigins.split(',').map(s => s.trim()) : []),
                    webhookUrl: client.webhookUrl || '',
                    webhookToken: '', // Always empty on edit (Write-Only)
                    active: client.active
                });
            } else {
                form.reset({
                    name: "",
                    allowedOrigins: [],
                    webhookUrl: "",
                    webhookToken: "",
                    active: true,
                });
            }
        }
    }, [open, client?.id, form]);



    const handleFormSubmit = (values) => {
        onSubmit(values);
    };

    return (
        <Sheet open={open} onOpenChange={onOpenChange}>
            <SheetContent className="bg-slate-900 border-l border-slate-800 text-slate-100 sm:max-w-md overflow-y-auto w-full">
                <SheetHeader>
                    <SheetTitle className="text-white text-xl flex items-center gap-2">
                        <AppWindow className="w-5 h-5 text-indigo-400" />
                        {client ? 'Edit Client' : 'New Widget Client'}
                    </SheetTitle>
                    <SheetDescription className="text-slate-400">
                        {client ? (
                            <>
                                Manage settings, domains, and security credentials for{' '}
                                <span className="text-white font-medium">{client.name}</span>.
                            </>
                        ) : (
                            "Create a new client integration. API credentials will be generated automatically upon creation."
                        )}
                    </SheetDescription>
                </SheetHeader>

                <Form {...form}>
                    <form onSubmit={form.handleSubmit(handleFormSubmit)} className="mt-6">
                        <div className="space-y-3">
                            <SmartFormItem
                                name="name"
                                label="Client Name"
                                required
                                InputComponent={DebouncedFormInput}
                                inputProps={{ placeholder: "e.g. Acme Corp Widget", className: "mt-1" }}
                            />

                            <SmartFormItem
                                name="allowedOrigins"
                                label="Allowed Origins"
                                description="Press Enter or paste comma-separated domains"
                                InputComponent={OriginsSelector}
                            />

                            <SmartFormItem
                                name="webhookUrl"
                                label="Webhook URL"
                                description="Events like message:visitor will be sent here."
                                InputComponent={DebouncedFormInput}
                                inputProps={{ placeholder: "e.g. https://your-server.com/webhook", className: "mt-1" }}
                            />

                            <SmartFormItem
                                name="webhookToken"
                                label="Webhook Token (Authorization)"
                                description={`Token sent in Authorization header.${client && client.webhookToken ? " Enter a new value to overwrite the existing token." : ""}`}
                                InputComponent={TokenInput}
                                inputProps={{ client }}
                            />

                            <CredentialsSection
                                client={client}
                                onRotateKey={onRotateKey}
                                onRotateSecret={onRotateSecret}
                                onRevealApiKey={onRevealApiKey}
                                isRotatingKey={isRotatingKey}
                                isRotatingSecret={isRotatingSecret}
                            />

                            <SmartFormItem
                                name="active"
                                label="Active Status"
                                description="Enable or disable API access"
                                InputComponent={DebouncedFormSwitch}
                                isSwitchLayout
                            />
                        </div>
                        <SheetFooter className="mt-6">
                            <FormSubmitButton control={form.control} client={client} isSubmitting={isSubmitting} />
                        </SheetFooter>
                    </form>
                </Form>
            </SheetContent>
        </Sheet >
    );
});

export default ClientForm;
