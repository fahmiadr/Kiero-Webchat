import { memo } from 'react';
import { Button } from '@/components/ui/button';
import { Plus } from 'lucide-react';

const ClientHeader = memo(({ onAddClient }) => {
    return (
        <div className="flex flex-col sm:flex-row justify-between sm:items-center gap-2 sm:gap-0 shrink-0">
            <div>
                <h1 className="text-xl sm:text-2xl font-bold bg-gradient-to-r from-blue-400 to-cyan-400 bg-clip-text text-transparent tracking-tight">
                    Widget Clients
                </h1>
                <p className="text-sm text-slate-200 ">
                    Manage secure access, CORS policies, and webhook integrations.
                </p>
            </div>

            <div className="flex items-center gap-3 w-full md:w-auto">
                <Button
                    className="bg-blue-600 hover:bg-blue-700 text-white shadow-lg shadow-blue-900/20 w-full md:w-auto transition-all duration-200"
                    onClick={onAddClient}
                >
                    <Plus className="mr-2 h-4 w-4" /> Add Client
                </Button>
            </div>
        </div>
    );
});

export default ClientHeader;
