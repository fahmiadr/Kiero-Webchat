import { useState } from "react"
import { useToast } from "@/hooks/use-toast"
import {
    Toast,
    ToastClose,
    ToastDescription,
    ToastProvider,
    ToastTitle,
    ToastViewport,
} from "@/components/ui/toast"

const MAX_DESC_LENGTH = 100;

function ToastItem({ id, title, description, action, ...props }) {
    const [isExpanded, setIsExpanded] = useState(false);
    const shouldTruncate = description && typeof description === 'string' && description.length > MAX_DESC_LENGTH;

    return (
        <Toast key={id} {...props}>
            <div className="grid gap-1">
                {title && <ToastTitle>{title}</ToastTitle>}
                {description && (
                    <div className="text-xs opacity-90">
                        {shouldTruncate && !isExpanded ? (
                            <>
                                {description.substring(0, MAX_DESC_LENGTH)}...
                                <button
                                    onClick={(e) => {
                                        e.preventDefault();
                                        setIsExpanded(true);
                                    }}
                                    className="ml-2 font-medium underline hover:text-foreground text-xs"
                                >
                                    Details
                                </button>
                            </>
                        ) : (
                            <ToastDescription className="text-xs">{description}</ToastDescription>
                        )}
                    </div>
                )}
            </div>
            {action}
            <ToastClose />
        </Toast>
    );
}

export function Toaster() {
    const { toasts } = useToast()

    return (
        <ToastProvider duration={5000}>
            {toasts.map(function (toast) {
                return <ToastItem key={toast.id} {...toast} />
            })}
            <ToastViewport />
        </ToastProvider>
    )
}
