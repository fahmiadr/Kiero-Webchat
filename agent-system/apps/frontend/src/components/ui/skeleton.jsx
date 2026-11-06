import { cn } from "@/lib/utils"

function Skeleton({
    className,
    ...props
}) {
    return (
        (<div
            className={cn("animate-pulse rounded-md bg-muted", className)}
            {...props} />)
    );
}

/**
 * TextSkeleton component
 * Renders invisible text to force the skeleton to match the exact dimensions (width/height)
 * of the text it replaces, respecting font settings (size, weight, tracking).
 */
function TextSkeleton({
    text,
    className,
    ...props
}) {
    return (
        <Skeleton
            className={cn("inline-block rounded-[inherit]", className)}
            {...props}
        >
            <span className="opacity-0">{text}</span>
        </Skeleton>
    );
}

export { Skeleton, TextSkeleton }
