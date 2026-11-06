import { memo } from 'react';
import { RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { DateTimePicker } from '@/components/ui/date-time-picker';
import {
    Select,
    SelectContent,
    SelectItem,
    SelectTrigger,
    SelectValue,
} from "@/components/ui/select";

const AuditLogFilters = memo(({
    activeTab,
    filters,
    setFilters,
    clearFilters,
    searchInputRef
}) => {
    return (
        <div className="flex items-center gap-2 sm:gap-3 flex-wrap shrink-0">
            <Select
                value={filters.level || 'all'}
                onValueChange={(v) => setFilters({ level: v === 'all' ? null : v })}
            >
                <SelectTrigger className="w-[calc(50%-4px)] sm:w-28 bg-slate-900 border-slate-700 text-slate-300 h-8 text-xs cursor-pointer">
                    <SelectValue placeholder="Level" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="all">All Levels</SelectItem>
                    <SelectItem value="INFO">Info</SelectItem>
                    <SelectItem value="WARN">Warning</SelectItem>
                    <SelectItem value="ERROR">Error</SelectItem>
                    <SelectItem value="CRITICAL">Critical</SelectItem>
                </SelectContent>
            </Select>

            <Select
                value={filters.source || 'all'}
                onValueChange={(v) => setFilters({ source: v === 'all' ? null : v })}
            >
                <SelectTrigger className="w-[calc(50%-4px)] sm:w-28 bg-slate-900 border-slate-700 text-slate-300 h-8 text-xs cursor-pointer">
                    <SelectValue placeholder="Source" />
                </SelectTrigger>
                <SelectContent className="bg-slate-900 border-slate-700">
                    <SelectItem value="all">All Sources</SelectItem>
                    <SelectItem value="system">System</SelectItem>
                    <SelectItem value="agent">Agent</SelectItem>
                    <SelectItem value="widget">Widget</SelectItem>
                    <SelectItem value="external">External</SelectItem>
                    <SelectItem value="queue">Queue</SelectItem>
                </SelectContent>
            </Select>

            {activeTab === 'history' && (
                <>
                    <DateTimePicker
                        date={filters.startDate ? new Date(filters.startDate) : null}
                        onDateChange={(date) => setFilters({ startDate: date ? date.toISOString() : null })}
                        label="From"
                        placeholder="Start date"
                    />
                    <DateTimePicker
                        date={filters.endDate ? new Date(filters.endDate) : null}
                        onDateChange={(date) => setFilters({ endDate: date ? date.toISOString() : null })}
                        label="To"
                        placeholder="End date"
                    />
                </>
            )}

            <div className="w-full sm:flex-1 sm:min-w-[200px]">
                <Input
                    ref={searchInputRef}
                    placeholder="Search event... (Press /)"
                    value={filters.event || ''}
                    onChange={(e) => setFilters({ event: e.target.value })}
                    className="h-8 text-xs"
                />
            </div>

            {(filters.level || filters.source || filters.event || filters.startDate || filters.endDate) && (
                <Button
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-slate-400 hover:text-white hover:bg-red-500/20 cursor-pointer gap-1.5 transition-colors"
                    onClick={clearFilters}
                >
                    <RotateCcw className="h-3.5 w-3.5" />
                    <span className="text-xs">Clear</span>
                </Button>
            )}
        </div>
    );
});

export default AuditLogFilters;
