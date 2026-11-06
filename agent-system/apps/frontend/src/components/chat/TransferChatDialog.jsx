import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Loader2, ArrowRightLeft, Users } from 'lucide-react';
import { useAgents } from '@/hooks/useChat';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { getAvatarColor, getInitials } from '@/utils/avatar';

const TransferChatDialog = ({ open, onOpenChange, onTransfer }) => {
    // Use agents hook
    const { data: agents = [], isLoading: loading } = useAgents();
    const [selectedAgent, setSelectedAgent] = useState('');
    const [transferring, setTransferring] = useState(false);

    const handleTransfer = async () => {
        if (!selectedAgent && selectedAgent !== 'QUEUE') return;

        setTransferring(true);
        try {
            const targetAgent = selectedAgent === 'QUEUE'
                ? null
                : agents.find(a => String(a.id) === selectedAgent);

            if (targetAgent || selectedAgent === 'QUEUE') {
                await onTransfer(targetAgent);
                onOpenChange(false);
                setSelectedAgent(''); // Reset selection
            }
        } catch (error) {
            console.error('Transfer failed', error);
        } finally {
            setTransferring(false);
        }
    };

    const isQueue = selectedAgent === 'QUEUE';

    return (
        <Dialog open={open} onOpenChange={onOpenChange}>
            <DialogContent className="sm:max-w-md bg-slate-900 border-slate-800 text-slate-100 gap-0 p-0 overflow-hidden shadow-2xl">
                <DialogHeader className="px-6 pt-6 pb-4 bg-slate-900/50">
                    <div className="flex items-center gap-4">
                        <div className="p-3 rounded-full bg-blue-500/10 border border-blue-500/20">
                            <ArrowRightLeft className="w-5 h-5 text-blue-500" />
                        </div>
                        <div className="space-y-1">
                            <DialogTitle className="text-lg font-medium text-slate-100">Transfer Chat</DialogTitle>
                            <DialogDescription className="text-slate-400 text-sm">
                                Move this conversation to another agent or return it to the queue.
                            </DialogDescription>
                        </div>
                    </div>
                </DialogHeader>

                <div className="px-6 py-4 space-y-4">
                    <div className="space-y-2">
                        <Label htmlFor="agent-select" className="text-xs font-medium text-slate-400 uppercase tracking-wide">Select Destination</Label>
                        <Select value={selectedAgent} onValueChange={setSelectedAgent} disabled={loading || transferring}>
                            <SelectTrigger id="agent-select" className="bg-slate-800 border-slate-700 text-slate-200 h-11 focus:ring-blue-600/50">
                                <SelectValue placeholder="Choose an agent or queue..." />
                            </SelectTrigger>
                            <SelectContent className="bg-slate-800 border-slate-700 text-slate-200 shadow-xl max-h-[300px]">
                                <SelectItem value="QUEUE" className="text-amber-400 focus:text-amber-400 focus:bg-amber-950/30 py-3 cursor-pointer">
                                    <div className="flex items-center gap-3">
                                        <div className="w-8 h-8 rounded-full bg-amber-500/10 flex items-center justify-center border border-amber-500/20">
                                            <Users className="w-4 h-4" />
                                        </div>
                                        <div className="flex flex-col text-left">
                                            <span className="font-medium">Return to Queue</span>
                                            <span className="text-xs opacity-70">Unassign current agent</span>
                                        </div>
                                    </div>
                                </SelectItem>

                                {agents && agents.length > 0 && <div className="h-px bg-slate-700 mx-2 my-1" />}

                                {agents.map(agent => (
                                    <SelectItem key={agent.id} value={String(agent.id)} className="focus:bg-slate-700 py-2 cursor-pointer">
                                        <div className="flex items-center gap-3">
                                            <Avatar className="h-8 w-8 border border-slate-700">
                                                <AvatarFallback className={`${getAvatarColor(agent.name)} text-white text-[10px]`}>
                                                    {getInitials(agent.name)}
                                                </AvatarFallback>
                                            </Avatar>
                                            <div className="flex flex-col text-left">
                                                <span className="font-medium text-sm">{agent.name}</span>
                                                <span className="text-xs text-slate-500 capitalize">{agent.role}</span>
                                            </div>
                                            <div className={`ml-auto w-2 h-2 rounded-full ${agent.isOnline ? 'bg-emerald-500' : 'bg-slate-600'}`} />
                                        </div>
                                    </SelectItem>
                                ))}
                            </SelectContent>
                        </Select>
                    </div>

                    {isQueue && (
                        <div className="rounded-md bg-amber-500/10 border border-amber-500/20 p-3 text-sm text-amber-200 flex gap-2">
                            <div className="mt-0.5">⚠️</div>
                            <p>The chat will be unassigned and visible to all agents in the queue.</p>
                        </div>
                    )}
                </div>

                <DialogFooter className="px-6 py-4 bg-slate-900 border-t border-slate-800 sm:justify-between">
                    <Button variant="ghost" onClick={() => onOpenChange(false)} disabled={transferring} className="text-slate-400 hover:text-slate-200">
                        Cancel
                    </Button>
                    <div className="flex gap-2">
                        <Button
                            onClick={handleTransfer}
                            disabled={!selectedAgent || transferring}
                            className={isQueue
                                ? "bg-amber-600 hover:bg-amber-700 text-white border-none"
                                : "bg-blue-600 hover:bg-blue-700 text-white border-none"
                            }
                        >
                            {transferring && <Loader2 className="w-4 h-4 animate-spin mr-2" />}
                            {isQueue ? 'Confirm Return' : 'Transfer Now'}
                        </Button>
                    </div>
                </DialogFooter>
            </DialogContent>
        </Dialog>
    );
};

export default TransferChatDialog;
