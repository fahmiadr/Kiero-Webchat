import React, { memo } from 'react';
import SettingHeader from '../shared/SettingHeader';
import TextInputField from '../shared/TextInputField';
import ColorPickerField from '../shared/ColorPickerField';
import IconOptionGroup from '../shared/IconOptionGroup';

const WelcomeBlock = memo(({ welcomeMessage, onUpdate }) => {
    if (!welcomeMessage) return null;

    const { iconSettings = {}, titleSettings = {}, subtitleSettings = {} } = welcomeMessage;

    const updateWelcome = (field, value) => {
        onUpdate('preChatForm', 'welcomeMessage', field, value);
    };

    return (
        <div className="space-y-4 animate-fade-in">
            <SettingHeader
                type="block"
                label="Welcome Message"
                component="preChatForm"
                block="welcomeMessage"
            />

            <div className="space-y-6 pt-2">
                {/* Icon Settings */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="field"
                        label="Welcome Icon"
                        component="preChatForm"
                        block="welcomeMessage"
                        fieldKey={['iconSettings.type', 'iconSettings.icon', 'iconSettings.imageUrl']}
                    />
                    <IconOptionGroup
                        value={iconSettings.type === 'custom' ? iconSettings.imageUrl : iconSettings.icon}
                        customImage={iconSettings.imageUrl}
                        availableIcons={iconSettings.availableIcons || []}
                        onChange={(val) => {
                            if (val.startsWith('http') || val.startsWith('data:') || val.startsWith('/api/')) {
                                updateWelcome('iconSettings.type', 'custom');
                                updateWelcome('iconSettings.imageUrl', val);
                                updateWelcome('iconSettings.icon', '');
                            } else {
                                updateWelcome('iconSettings.type', 'icon');
                                updateWelcome('iconSettings.icon', val);
                            }
                        }}
                    />
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Icon Color"
                                component="preChatForm"
                                block="welcomeMessage"
                                fieldKey="iconSettings.color"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={iconSettings.color}
                            onChange={(val) => updateWelcome('iconSettings.color', val)}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Background Color"
                                component="preChatForm"
                                block="welcomeMessage"
                                fieldKey="iconSettings.backgroundColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={iconSettings.backgroundColor}
                            onChange={(val) => updateWelcome('iconSettings.backgroundColor', val)}
                        />
                    </div>
                </div>

                {/* Title Settings */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="block"
                        isSubBlock
                        label="Title Text"
                        component="preChatForm"
                        block="welcomeMessage"
                        fieldKey="titleSettings"
                    />
                    <div className="space-y-2">
                        <SettingHeader
                            type="field"
                            label="Title"
                            component="preChatForm"
                            block="welcomeMessage"
                            fieldKey={['titleSettings.text', 'titleSettings.fontWeight', 'titleSettings.fontSize', 'titleSettings.fontSizeUnit', 'titleSettings.italic']}
                        />
                        <TextInputField
                            value={titleSettings.text}
                            settings={titleSettings}
                            onChange={(val) => updateWelcome('titleSettings.text', val)}
                            onSettingsChange={(settings) => updateWelcome('titleSettings', settings)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader
                                    type="field"
                                    label="Color"
                                    component="preChatForm"
                                    block="welcomeMessage"
                                    fieldKey="titleSettings.color"
                                />
                            </div>
                            <ColorPickerField
                                className="h-8 w-32 shrink-0"
                                value={titleSettings.color}
                                onChange={(val) => updateWelcome('titleSettings.color', val)}
                            />
                        </div>
                    </div>
                </div>

                {/* Subtitle Settings */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="block"
                        isSubBlock
                        label="Description Text"
                        component="preChatForm"
                        block="welcomeMessage"
                        fieldKey="subtitleSettings"
                    />
                    <div className="space-y-2">
                        <SettingHeader
                            type="field"
                            label="Description"
                            component="preChatForm"
                            block="welcomeMessage"
                            fieldKey={['subtitleSettings.text', 'subtitleSettings.fontWeight', 'subtitleSettings.fontSize', 'subtitleSettings.fontSizeUnit', 'subtitleSettings.italic']}
                        />
                        <TextInputField
                            multiline
                            value={subtitleSettings.text}
                            settings={subtitleSettings}
                            onChange={(val) => updateWelcome('subtitleSettings.text', val)}
                            onSettingsChange={(settings) => updateWelcome('subtitleSettings', settings)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader
                                    type="field"
                                    label="Color"
                                    component="preChatForm"
                                    block="welcomeMessage"
                                    fieldKey="subtitleSettings.color"
                                />
                            </div>
                            <ColorPickerField
                                className="h-8 w-32 shrink-0"
                                value={subtitleSettings.color}
                                onChange={(val) => updateWelcome('subtitleSettings.color', val)}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

WelcomeBlock.displayName = 'WelcomeBlock';

export default WelcomeBlock;
