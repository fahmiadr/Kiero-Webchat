import { Outlet, useNavigate, Link, useLocation } from 'react-router-dom';
import useAuthStore from '@/stores/useAuthStore';
import { Button } from '@/components/ui/button';
import {
    LayoutDashboard,
    MessageSquare,
    Settings,
    LogOut,
    Bell,
    Calendar,
    WifiOff,
    AppWindow,
    ClipboardList,
} from 'lucide-react';
import { Avatar, AvatarFallback } from '@/components/ui/avatar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { getAvatarColor, getInitials } from '@/utils/avatar';
import { useOnlineStatus } from '@/hooks/useOnlineStatus';

import BroadcastChatManager from '@/components/chat/BroadcastChatManager';

const DashboardLayout = () => {
    const { user, logout, isLoading } = useAuthStore();
    const navigate = useNavigate();
    const location = useLocation();
    const isOnline = useOnlineStatus();

    const isAdmin = !isLoading && user?.role === 'admin';

    const handleLogout = () => {
        logout();
        navigate('/login');
    };

    const NavItem = ({ to, icon: Icon, label }) => {
        const isActive = location.pathname === to || (to === '/' && location.pathname === '/chat');
        // Adjust active logic: if path is '/' (ChatInterface now), highlight Live Chat?
        // User mapped '/' to ChatInterface. So Live Chat icon should highlight on '/'.
        // Dashboard icon should highlight on '/dashboard' (which might be coming soon).

        // Let's assume:
        // Live Chat -> '/'
        // Dashboard -> '/dashboard' 

        const isCurrent = location.pathname === to;

        return (
            <Tooltip delayDuration={0}>
                <TooltipTrigger asChild>
                    <Link
                        to={to}
                        className={`flex items-center justify-center h-10 w-10 rounded-lg transition-all duration-200 group ${isCurrent
                            ? 'bg-blue-600 text-white shadow-lg shadow-blue-900/50'
                            : 'text-slate-400 hover:text-slate-100 hover:bg-slate-800'
                            }`}
                    >
                        <Icon className={`h-5 w-5 ${isCurrent ? '' : 'group-hover:scale-110 transition-transform'}`} />
                        <span className="sr-only">{label}</span>
                    </Link>
                </TooltipTrigger>
                <TooltipContent side="right" className="bg-slate-900 border-slate-700 text-slate-100">
                    <p>{label}</p>
                </TooltipContent>
            </Tooltip>
        );
    };

    return (
        <div className="flex h-screen bg-slate-950 text-slate-100 font-sans selection:bg-blue-500/30 overflow-hidden">
            {/* Global Sidebar (Icon Only) */}
            <aside className="hidden md:flex flex-col items-center w-15 py-6 border-r-2 border-slate-800 bg-slate-900 z-20">
                {/* Logo/Brand */}
                <div className="mb-8">
                    <div className="h-10 w-10 bg-blue-600 rounded-lg flex items-center justify-center shadow-lg shadow-blue-900/20">
                        <span className="font-bold text-white text-xl">K</span>
                    </div>
                </div>

                {/* Navigation */}
                <nav className="flex-1 flex flex-col items-center gap-2 w-full">
                    {/* If Chat is Home, maybe swap order or keep Dashboard as first item pointing to /dashboard */}
                    <NavItem to="/dashboard" icon={LayoutDashboard} label="Dashboard" />
                    <NavItem to="/" icon={MessageSquare} label="Live Chat" />
                    <NavItem to="/calendar" icon={Calendar} label="Calendar" />

                    {/* Admin Only Navigation */}
                    {isAdmin && (
                        <>
                            <NavItem to="/widget-clients" icon={AppWindow} label="Widget Clients" />
                            <NavItem to="/audit-logs" icon={ClipboardList} label="Audit Logs" />
                        </>
                    )}

                    <NavItem to="/notifications" icon={Bell} label="Notifications" />
                    <NavItem to="/settings" icon={Settings} label="Settings" />
                </nav>

                {/* Bottom Actions */}
                <div className="flex flex-col items-center gap-4 mt-auto">
                    {/* Offline Indicator */}
                    {!isOnline && (
                        <Tooltip delayDuration={0}>
                            <TooltipTrigger asChild>
                                <div className="flex items-center justify-center h-10 w-10 rounded-lg bg-red-950/50 text-red-400 animate-pulse">
                                    <WifiOff className="h-5 w-5" />
                                </div>
                            </TooltipTrigger>
                            <TooltipContent side="right" className="bg-red-950 border-red-800 text-red-200">
                                <p>Anda sedang offline</p>
                            </TooltipContent>
                        </Tooltip>
                    )}

                    {/* Avatar Button */}
                    <div className="relative group">
                        <Avatar className="h-10 w-10 rounded-full cursor-pointer hover:ring-2 hover:ring-slate-600 transition-all overflow-hidden">
                            <AvatarFallback className={`flex items-center justify-center w-full h-full ${getAvatarColor(user?.name)} text-white font-semibold`}>
                                {getInitials(user?.name || 'Agent')}
                            </AvatarFallback>
                        </Avatar>
                        {/* Status indicator on avatar */}
                        <span className={`absolute -top-0.5 -right-0.5 h-3 w-3 border-2 border-slate-900 rounded-full ${isOnline ? 'bg-emerald-500' : 'bg-red-500'}`} />
                        <div className="absolute left-full ml-4 bottom-0 w-48 bg-slate-900 border border-slate-800 rounded-xl p-2 shadow-xl opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all duration-200 z-50">
                            <div className="px-3 py-2 border-b border-slate-800 mb-2">
                                <p className="font-medium text-sm truncate">{user?.name || 'Agent'}</p>
                                <p className="text-xs text-slate-500 truncate">{user?.email || 'agent@kiero.id'}</p>
                            </div>
                            <Button
                                variant="ghost"
                                className="w-full justify-start text-red-400 hover:text-red-300 hover:bg-red-950/30 h-8 text-xs"
                                onClick={handleLogout}
                            >
                                <LogOut className="mr-2 h-3 w-3" />
                                Sign Out
                            </Button>
                        </div>
                    </div>
                </div>
            </aside>

            {/* Main Content Area */}
            <main className="flex-1 overflow-hidden relative">
                <Outlet />
            </main>

            {/* Global Broadcast Chat FAB */}
            <BroadcastChatManager />
        </div>
    );
};

export default DashboardLayout;
