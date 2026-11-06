import React, { useState, useEffect } from "react";
import {
    flexRender,
    getCoreRowModel,
    getFilteredRowModel,
    getPaginationRowModel,
    getSortedRowModel,
    useReactTable,
} from "@tanstack/react-table";
import { Debouncer } from "@tanstack/pacer";
import {
    Table,
    TableBody,
    TableCell,
    TableHead,
    TableHeader,
    TableRow,
} from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
    Popover,
    PopoverContent,
    PopoverTrigger,
} from "@/components/ui/popover";
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";
import {
    ChevronDown,
    ChevronLeft,
    ChevronRight,
    ChevronsLeft,
    ChevronsRight,
    Layers,
    SearchX
} from "lucide-react";
import { Skeleton, TextSkeleton } from "@/components/ui/skeleton";
import { AnimatePresence, motion } from "motion/react";

// Create animated components with prop filtering to avoid React warnings
const MotionTableBody = motion.create(
    React.forwardRef(({ layout, ...props }, ref) => <TableBody ref={ref} {...props} />)
);
const MotionTableRow = motion.create(
    React.forwardRef(({ layout, ...props }, ref) => <TableRow ref={ref} {...props} />)
);
const MotionTableCell = motion.create(
    React.forwardRef(({ layout, ...props }, ref) => <TableCell ref={ref} {...props} />)
);

const tableBodyVariants = {
    hidden: { opacity: 1 },
    show: {
        opacity: 1,
        transition: {
            staggerChildren: 0.08
        }
    }
};

const rowVariants = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { duration: 0.25, ease: "easeOut" }
    },
    exit: {
        opacity: 0,
        transition: { duration: 0.2, ease: "easeOut" }
    }
};

const TableSearchInput = React.memo(({ table, filterColumn, searchPlaceholder, isLoading }) => {
    const [value, setValue] = useState(table.getColumn(filterColumn)?.getFilterValue() ?? "");
    const debouncerRef = React.useRef(null);

    useEffect(() => {
        debouncerRef.current = new Debouncer(
            (val) => {
                table.getColumn(filterColumn)?.setFilterValue(val);
            },
            { wait: 300 }
        );

        return () => {
            debouncerRef.current?.cancel();
        };
    }, [table, filterColumn]);

    const onChange = (e) => {
        const newValue = e.target.value;
        setValue(newValue);
        debouncerRef.current?.maybeExecute(newValue);
    };

    return (
        <Input
            placeholder={searchPlaceholder}
            value={value}
            onChange={onChange}
            disabled={isLoading}
            className="h-8 w-full sm:w-[250px]"
        />
    );
});

const ColumnToggleItem = React.memo(({ column, isVisible }) => {
    return (
        <Label
            className="flex items-center gap-2 capitalize px-2 py-1.5 text-sm rounded-sm cursor-pointer select-none hover:bg-slate-800 focus:bg-slate-700/60 transition-colors font-semibold"
        >
            <Input
                type="checkbox"
                checked={isVisible}
                onChange={(e) => column.toggleVisibility(e.target.checked)}
                className="accent-slate-400 h-4 w-4 flex-none p-0 border-0 rounded-md cursor-pointer"
            />
            {column.columnDef.meta?.title || column.id}
        </Label>
    );
});

const TableColumnsToggle = ({ table, isLoading }) => {
    const [isColumnsOpen, setIsColumnsOpen] = React.useState(false);
    const columns = table.getAllColumns().filter((column) => column.getCanHide());

    return (
        <div className="w-full sm:w-auto flex justify-end">
            <Popover open={isColumnsOpen} onOpenChange={setIsColumnsOpen}>
                <PopoverTrigger asChild disabled={isLoading}>
                    <Button
                        variant="outline"
                        size="sm"
                        disabled={isLoading}
                        className="ml-auto h-8 w-full font-semibold bg-slate-700/40 border-slate-600 hover:bg-slate-700/60 hover:border-slate-500 hover:text-white text-slate-200 sm:w-auto"
                    >
                        Columns
                        <ChevronDown className={`ml-2 h-4 w-4 transition-transform duration-200 ${isColumnsOpen ? "rotate-180" : ""}`} />
                    </Button>
                </PopoverTrigger>
                <PopoverContent
                    align="end"
                    className="w-auto min-w-[150px] p-1 bg-slate-900 border-slate-700 text-slate-200 shadow-md z-[100]"
                >
                    {columns.map((column) => (
                        <ColumnToggleItem key={column.id} column={column} isVisible={column.getIsVisible()} />
                    ))}
                </PopoverContent>
            </Popover>
        </div>
    );
};

const TableHeaderGroup = ({ table, isLoading }) => (
    <TableHeader>
        {table.getHeaderGroups().map((headerGroup) => (
            <TableRow key={headerGroup.id}
                className={isLoading ? "pointer-events-none" : ""}>
                {headerGroup.headers.map((header) => {
                    return (
                        <TableHead
                            key={header.id}
                            style={{ width: header.getSize() }}
                            className="bg-slate-950"
                        >
                            {isLoading ? (
                                <TextSkeleton text={flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                )} className="font-bold uppercase text-[11px] tracking-wider bg-slate-700" />
                            ) : header.isPlaceholder ? null : (
                                flexRender(
                                    header.column.columnDef.header,
                                    header.getContext()
                                )
                            )}
                        </TableHead>
                    );
                })}
            </TableRow>
        ))}
    </TableHeader>
);

const MemoizedTableRow = React.memo(({ row }) => {
    return (
        <MotionTableRow
            layout="position"
            data-state={row.getIsSelected() && "selected"}
            variants={rowVariants}
            initial="hidden"
            animate="show"
            exit="exit"
        >
            {row.getVisibleCells().map((cell) => (
                <MotionTableCell
                    key={cell.id}
                    layout="position"
                    style={{ width: cell.column.getSize() }}
                >
                    {flexRender(
                        cell.column.columnDef.cell,
                        cell.getContext()
                    )}
                </MotionTableCell>
            ))}
        </MotionTableRow>
    );
}, (prevProps, nextProps) => {
    const prevData = prevProps.row.original;
    const nextData = nextProps.row.original;
    const hasDataChanged = prevData !== nextData;
    const hasSelectionChanged = prevProps.row.getIsSelected() !== nextProps.row.getIsSelected();
    return !hasDataChanged && !hasSelectionChanged;
});

const TableBodyGroup = ({ table, isLoading, data, emptyStateTitle, emptyStateDescription, onEmptyAction, emptyActionLabel }) => (
    <MotionTableBody
        variants={tableBodyVariants}
        initial="hidden"
        animate="show"
    >
        <AnimatePresence initial={false} mode="popLayout">
            {isLoading ? (
                Array.from({ length: 10 }).map((_, index) => (
                    <MotionTableRow
                        key={`skeleton-${index}`}
                        variants={rowVariants}
                        initial="hidden"
                        animate="show"
                        exit="exit"
                        className="border-slate-800 hover:bg-transparent"
                    >
                        {table.getVisibleFlatColumns().map((column) => (
                            <TableCell
                                key={column.id}
                                style={{ width: column.getSize() }}
                            >
                                <Skeleton className="h-6 w-full bg-slate-800 rounded-md" />
                            </TableCell>
                        ))}
                    </MotionTableRow>
                ))
            ) : table.getRowModel().rows?.length ? (
                table.getRowModel().rows.map((row) => (
                    <MemoizedTableRow key={row.id} row={row} />
                ))
            ) : (
                <MotionTableRow
                    variants={rowVariants}
                    initial="hidden"
                    animate="show"
                    exit="exit"
                    className="hover:bg-transparent"
                >
                    <TableCell
                        colSpan={table.getAllColumns().length}
                        className="h-[450px] text-center"
                    >
                        <div className="flex flex-col items-center justify-center space-y-4 animate-in fade-in zoom-in duration-300">
                            <div className="p-6 bg-slate-800/50 rounded-full border-2 border-slate-700/80 shadow-lg ring-4 ring-slate-900/50">
                                {data.length > 0 ? (
                                    <SearchX className="h-9 w-9 text-slate-400" />
                                ) : (
                                    <Layers className="h-9 w-9 text-slate-400" />
                                )}
                            </div>
                            <div className="space-y-2 max-w-[400px] mx-auto">
                                <h3 className="text-xl font-bold text-white tracking-tight">
                                    {data.length > 0 ? "No Matching Results" : emptyStateTitle}
                                </h3>
                                <p className="text-sm text-slate-400 leading-relaxed font-medium">
                                    {data.length > 0
                                        ? "We couldn't find any results matching your current filters."
                                        : emptyStateDescription}
                                </p>
                            </div>
                            {data.length === 0 && onEmptyAction && (
                                <Button
                                    onClick={onEmptyAction}
                                    className="mt-4 bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 transition-all duration-200"
                                >
                                    {emptyActionLabel}
                                </Button>
                            )}
                        </div>
                    </TableCell>
                </MotionTableRow>
            )}
        </AnimatePresence>
    </MotionTableBody>
);

const PAGE_SIZES = [10, 20, 30, 40, 50];

const PageSizeSelector = React.memo(({ pageSize, setPageSize, isLoading }) => {
    return (
        <div className="flex items-center space-x-2 font-medium">
            <p className="text-sm text-slate-400">Rows per page</p>
            <Select
                value={`${pageSize}`}
                onValueChange={(value) => setPageSize(Number(value))}
                disabled={isLoading}
            >
                <SelectTrigger className="h-8 w-[70px]">
                    <SelectValue placeholder={pageSize} />
                </SelectTrigger>
                <SelectContent side="top" modal={false}>
                    {PAGE_SIZES.map((size) => (
                        <SelectItem
                            key={size}
                            value={`${size}`}
                        >
                            {size}
                        </SelectItem>
                    ))}
                </SelectContent>
            </Select>
        </div>
    );
});

const TablePagination = ({ table, isLoading }) => {
    const { pageSize, pageIndex } = table.getState().pagination;

    return (
        <div className="flex flex-col md:flex-row items-center justify-between py-4 gap-4 shrink-0">
            <div className="flex-1 w-full md:w-auto">
                {isLoading ? (
                    <Skeleton className="h-4 w-32 bg-slate-800 inline-block" />
                ) : (
                    <p className="text-sm text-slate-400 font-semibold text-center md:text-left">{table.getFilteredRowModel().rows.length} row(s) total.</p>
                )}
            </div>
            <div className="flex flex-col sm:flex-row items-center gap-4 sm:space-x-6 lg:space-x-8 w-full md:w-auto justify-center md:justify-end">
                <PageSizeSelector
                    pageSize={pageSize}
                    setPageSize={table.setPageSize}
                    isLoading={isLoading}
                />
                <div className="flex w-[120px] items-center justify-center font-medium">
                    {isLoading ? (
                        <Skeleton className="h-8 w-24 bg-slate-800" />
                    ) : (
                        <>
                            <p className="text-sm text-slate-400">Page</p>
                            <Input
                                type="number"
                                min={1}
                                max={table.getPageCount() || 1}
                                value={pageIndex + 1}
                                onChange={(e) => {
                                    const val = e.target.value;
                                    const page = val ? Number(val) - 1 : 0;
                                    if (page >= 0 && page < table.getPageCount()) {
                                        table.setPageIndex(page);
                                    }
                                }}
                                className="h-8 w-12 mx-2 text-center"
                            />
                            <p className="text-sm text-slate-400">of {table.getPageCount()}</p>
                        </>
                    )}
                </div>
                <div className="flex items-center space-x-2">
                    <Button
                        variant="outline"
                        className="h-8 w-8 p-0 lg:flex text-slate-400 border-slate-600 bg-slate-700/40 hover:bg-slate-700/60 hover:border-slate-500 hover:text-white"
                        onClick={() => table.setPageIndex(0)}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <span className="sr-only">Go to first page</span>
                        <ChevronsLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        className="h-8 w-8 p-0 lg:flex text-slate-400 border-slate-600 bg-slate-700/40 hover:bg-slate-700/60 hover:border-slate-500 hover:text-white"
                        onClick={() => table.previousPage()}
                        disabled={!table.getCanPreviousPage()}
                    >
                        <span className="sr-only">Go to previous page</span>
                        <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        className="h-8 w-8 p-0 lg:flex text-slate-400 border-slate-600 bg-slate-700/40 hover:bg-slate-700/60 hover:border-slate-500 hover:text-white"
                        onClick={() => table.nextPage()}
                        disabled={!table.getCanNextPage()}
                    >
                        <span className="sr-only">Go to next page</span>
                        <ChevronRight className="h-4 w-4" />
                    </Button>
                    <Button
                        variant="outline"
                        className="h-8 w-8 p-0 lg:flex text-slate-400 border-slate-600 bg-slate-700/40 hover:bg-slate-700/60 hover:border-slate-500 hover:text-white"
                        onClick={() => table.setPageIndex(table.getPageCount() - 1)}
                        disabled={!table.getCanNextPage()}
                    >
                        <span className="sr-only">Go to last page</span>
                        <ChevronsRight className="h-4 w-4" />
                    </Button>
                </div>
            </div>
        </div>
    );
};

export function DataTable({
    columns,
    data,
    isLoading = false,
    filterColumn = "name",
    searchPlaceholder = "Filter...",
    emptyStateTitle = "No Data Found",
    emptyStateDescription = "There are no records to display at the moment.",
    onEmptyAction = null,
    emptyActionLabel = "Create New"
}) {
    const [sorting, setSorting] = useState([]);
    const [columnFilters, setColumnFilters] = useState([]);
    const [columnVisibility, setColumnVisibility] = useState({});
    const [rowSelection, setRowSelection] = useState({});

    const table = useReactTable({
        data,
        columns,
        onSortingChange: setSorting,
        onColumnFiltersChange: setColumnFilters,
        getCoreRowModel: getCoreRowModel(),
        getPaginationRowModel: getPaginationRowModel(),
        getSortedRowModel: getSortedRowModel(),
        getFilteredRowModel: getFilteredRowModel(),
        onColumnVisibilityChange: setColumnVisibility,
        onRowSelectionChange: setRowSelection,
        autoResetPageIndex: false,
        autoResetSorting: false,
        autoResetFilters: false,
        state: {
            sorting,
            columnFilters,
            columnVisibility,
            rowSelection,
        },
    });

    return (
        <div className="w-full h-full flex flex-col space-y-4">
            {/* Filters and Visibility Toggle */}
            <div className="flex flex-col sm:flex-row items-center justify-between gap-3 shrink-0">
                <div className="flex flex-1 items-center space-x-2 w-full sm:w-auto p-1">
                    <TableSearchInput
                        table={table}
                        filterColumn={filterColumn}
                        searchPlaceholder={searchPlaceholder}
                        isLoading={isLoading}
                    />
                </div>
                <TableColumnsToggle
                    table={table}
                    isLoading={isLoading}
                />
            </div>

            {/* Table */}
            <Table>
                <TableHeaderGroup table={table} isLoading={isLoading} />
                <TableBodyGroup
                    table={table}
                    isLoading={isLoading}
                    data={data}
                    emptyStateTitle={emptyStateTitle}
                    emptyStateDescription={emptyStateDescription}
                    onEmptyAction={onEmptyAction}
                    emptyActionLabel={emptyActionLabel}
                />
            </Table>

            {/* Pagination */}
            <TablePagination table={table} isLoading={isLoading} />
        </div>
    );
}
