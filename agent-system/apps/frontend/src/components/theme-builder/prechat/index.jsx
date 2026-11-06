import React, { memo } from 'react';
import HeaderBlock from './HeaderBlock';
import WelcomeBlock from './WelcomeBlock';
import PreChatFormBlock from './FormBlock';
import SubmitButtonBlock from './SubmitButtonBlock';
import { Separator } from '@/components/ui/separator';

const ThemeBuilderPreChatSettings = memo(({ themeConfig, onUpdate }) => {
    if (!themeConfig || !themeConfig.preChatForm) return null;

    const { preChatForm } = themeConfig;

    return (
        <div className="space-y-6 animate-fade-in">
            <Separator className="bg-slate-700/80" />
            <HeaderBlock
                header={preChatForm.header}
                onUpdate={onUpdate}
            />

            <Separator className="bg-slate-700/80" />
            <WelcomeBlock
                welcomeMessage={preChatForm.welcomeMessage}
                onUpdate={onUpdate}
            />

            <Separator className="bg-slate-700/80" />
            <PreChatFormBlock
                formConfig={preChatForm.form}
                onUpdate={onUpdate}
            />

            <Separator className="bg-slate-700/80" />
            <SubmitButtonBlock
                submitButton={preChatForm.submitButton}
                onUpdate={onUpdate}
            />
        </div>
    );
});

export default ThemeBuilderPreChatSettings;
