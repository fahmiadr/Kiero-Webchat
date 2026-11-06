import * as React from "react"
import TextareaAutosize from "react-textarea-autosize"
import { cn } from "@/lib/utils"

const Textarea = React.forwardRef(({ className, minRows = 3, maxRows = 10, ...props }, ref) => {
    return (
        <TextareaAutosize
            minRows={minRows}
            maxRows={maxRows}
            ref={ref}
            className={cn(
                "flex w-full rounded-md border-2 border-slate-600 bg-slate-700/40 px-3 py-2 text-sm shadow-sm transition-all duration-200 resize-none",
                "placeholder:text-slate-500",
                "hover:border-slate-500 hover:bg-slate-700/60",
                "focus-visible:outline-none focus-visible:border-blue-500 focus-visible:bg-slate-700/60 focus-visible:ring-0",
                "disabled:cursor-not-allowed disabled:opacity-50",
                "[&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-slate-500/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-thumb:hover]:cursor-default [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-transparent",
                className
            )}
            {...props}
        />
    )
})
Textarea.displayName = "Textarea"

export { Textarea }
