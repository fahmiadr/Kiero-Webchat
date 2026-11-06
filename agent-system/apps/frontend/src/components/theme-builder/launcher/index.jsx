import React, { memo } from 'react';
import LauncherButtonBlock from './LauncherButtonBlock';
import { Separator } from '@/components/ui/separator';

const ThemeBuilderLauncherSettings = memo(({ themeConfig, onUpdate }) => {
    if (!themeConfig || !themeConfig.launcher) return null;

    const { launcherButton } = themeConfig.launcher;

    return (
        <div className="space-y-6 animate-fade-in">
            <Separator className="bg-slate-700/80" />
            <LauncherButtonBlock
                launcherButton={launcherButton}
                onUpdate={onUpdate}
            />
        </div>
    );
});

export default ThemeBuilderLauncherSettings;
