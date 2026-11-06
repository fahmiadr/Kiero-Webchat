import { useMemo, memo } from 'react';
import { DataTable } from '@/components/ui/data-table';
import ClientTableColumns from './ClientTableColumns';

const EMPTY_DATA = [];

const ClientTable = memo(({ clients, isLoading, isError, error, onRetry, onEdit, onEditBotConfig, onRotateKey, onRotateSecret, onDelete, onNavigateToTheme, onAddClient, emptyStateTitle, emptyStateDescription, emptyActionLabel }) => {
    // Memoize columns to prevent unnecessary re-renders
    const columns = useMemo(() => ClientTableColumns({
        onEdit,
        onEditBotConfig,
        onRotateKey,
        onRotateSecret,
        onDelete,
        onNavigateToTheme
    }), [onEdit, onEditBotConfig, onRotateKey, onRotateSecret, onDelete, onNavigateToTheme]);

    return (
        <DataTable
            columns={columns}
            data={clients || EMPTY_DATA}
            isLoading={isLoading}
            isError={isError}
            error={error}
            onRetry={onRetry}
            filterColumn="name"
            searchPlaceholder="Search clients..."
            emptyStateTitle={emptyStateTitle}
            emptyStateDescription={emptyStateDescription}
            onEmptyAction={onAddClient}
            emptyActionLabel={emptyActionLabel}
        />
    );
});

export default ClientTable;
