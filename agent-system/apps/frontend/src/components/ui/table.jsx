import * as React from "react"

import { cn } from "@/lib/utils"

const Table = React.forwardRef(({ className, wrapperClassName, ...props }, ref) => (
    <div
        style={{ scrollbarGutter: 'stable' }}
        className={cn(
            "relative w-full overflow-auto [&::-webkit-scrollbar]:w-2.5 [&::-webkit-scrollbar-thumb]:bg-slate-500/80 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar]:h-2.5 [&::-webkit-scrollbar-thumb:hover]:bg-slate-500 [&::-webkit-scrollbar-thumb:hover]:cursor-default [&::-webkit-scrollbar-track]:bg-transparent [&::-webkit-scrollbar-thumb]:bg-clip-content [&::-webkit-scrollbar-thumb]:border-[2px] [&::-webkit-scrollbar-thumb]:border-transparent",
            "rounded-md border-2 border-slate-800 bg-slate-900",
            "flex-1 min-h-0",
            wrapperClassName
        )}
    >
        <table
            ref={ref}
            className={cn("w-full caption-bottom text-sm table-fixed relative", className)}
            {...props}
        />
    </div>
))
Table.displayName = "Table"

const TableHeader = React.forwardRef(({ className, ...props }, ref) => (
    <thead ref={ref} className={cn("sticky top-0 z-10 bg-slate-950 h-10 hover:bg-slate-950/60 [&_tr]:border-b", className)} {...props} />
))
TableHeader.displayName = "TableHeader"

const TableBody = React.forwardRef(({ className, ...props }, ref) => (
    <tbody
        ref={ref}
        className={cn("[&_tr:last-child]:border-0", className)}
        {...props}
    />
))
TableBody.displayName = "TableBody"

const TableFooter = React.forwardRef(({ className, ...props }, ref) => (
    <tfoot
        ref={ref}
        className={cn(
            "border-t bg-muted/50 font-medium [&>tr]:last:border-b-0",
            className
        )}
        {...props}
    />
))
TableFooter.displayName = "TableFooter"

const TableRow = React.forwardRef(({ className, ...props }, ref) => (
    <tr
        ref={ref}
        className={cn(
            "border-b border-slate-700/80 transition-colors hover:bg-slate-800/40 data-[state=selected]:bg-slate-800/60 duration-200",
            className
        )}
        {...props}
    />
))
TableRow.displayName = "TableRow"

const TableHead = React.forwardRef(({ className, ...props }, ref) => (
    <th
        ref={ref}
        className={cn(
            "h-10 px-4 text-left align-middle font-bold text-[11px] shadow-sm text-slate-200 hover:text-white uppercase tracking-wider [&:has([role=checkbox])]:pr-0",
            className
        )}
        {...props}
    />
))
TableHead.displayName = "TableHead"

const TableCell = React.forwardRef(({ className, ...props }, ref) => (
    <td
        ref={ref}
        className={cn("px-4 py-3 align-middle [&:has([role=checkbox])]:pr-0", className)}
        {...props}
    />
))
TableCell.displayName = "TableCell"

const TableCaption = React.forwardRef(({ className, ...props }, ref) => (
    <caption
        ref={ref}
        className={cn("mt-4 text-sm text-muted-foreground", className)}
        {...props}
    />
))
TableCaption.displayName = "TableCaption"

export {
    Table,
    TableHeader,
    TableBody,
    TableFooter,
    TableHead,
    TableRow,
    TableCell,
    TableCaption,
}
