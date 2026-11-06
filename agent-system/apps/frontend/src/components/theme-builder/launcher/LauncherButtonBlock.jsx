import React, { memo } from 'react';
import ColorPickerField from '../shared/ColorPickerField';
import OptionGroup from '../shared/OptionGroup';
import IconOptionGroup from '../shared/IconOptionGroup';
import SettingHeader from '../shared/SettingHeader';

const LauncherButtonBlock = memo(({ launcherButton, onUpdate }) => {
    if (!launcherButton) return null;

    const positionOptions = [
        {
            id: 'bottom-left',
            label: 'Left',
            renderPreview: (active) => (
                <div className="relative h-full w-full p-3">
                    <div className={`h-3 w-3 rounded-full absolute bottom-3 left-3 ${active ? 'bg-blue-500' : 'bg-slate-500'}`} />
                </div>
            )
        },
        {
            id: 'bottom-right',
            label: 'Right',
            renderPreview: (active) => (
                <div className="relative h-full w-full p-3">
                    <div className={`h-3 w-3 rounded-full absolute bottom-3 right-3 ${active ? 'bg-blue-500' : 'bg-slate-500'}`} />
                </div>
            )
        }
    ];

    return (
        <div className="space-y-4">
            <SettingHeader
                type="block"
                label="Launcher Button"
                component="launcher"
                block="launcherButton"
            />

            <div className="space-y-6 pt-2">
                <div>
                    <SettingHeader
                        type="field"
                        label="Position"
                        component="launcher"
                        block="launcherButton"
                        fieldKey="position"
                    />
                    <OptionGroup
                        value={launcherButton.position}
                        options={positionOptions}
                        onChange={(val) => onUpdate('launcher', 'launcherButton', 'position', val)}
                    />
                </div>

                <div className="flex flex-col gap-y-2">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Background Color"
                                component="launcher"
                                block="launcherButton"
                                fieldKey="backgroundColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={launcherButton.backgroundColor}
                            onChange={(val) => onUpdate('launcher', 'launcherButton', 'backgroundColor', val)}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Hover Color"
                                component="launcher"
                                block="launcherButton"
                                fieldKey="hoverColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={launcherButton.hoverColor}
                            onChange={(val) => onUpdate('launcher', 'launcherButton', 'hoverColor', val)}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Ping Color"
                                component="launcher"
                                block="launcherButton"
                                fieldKey="pingColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={launcherButton.pingColor}
                            onChange={(val) => onUpdate('launcher', 'launcherButton', 'pingColor', val)}
                        />
                    </div>
                </div>

                {/* Icon Settings Container */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="block"
                        isSubBlock
                        label="Icon Settings"
                        component="launcher"
                        block="launcherButton"
                        fieldKey="iconSettings"
                    />

                    <div>
                        <SettingHeader
                            type="field"
                            label="Icon"
                            component="launcher"
                            block="launcherButton"
                            fieldKey={['iconSettings.type', 'iconSettings.icon', 'iconSettings.imageUrl']}
                        />
                        <IconOptionGroup
                            value={launcherButton.iconSettings?.type === 'custom' ? launcherButton.iconSettings?.imageUrl : launcherButton.iconSettings?.icon}
                            customImage={launcherButton.iconSettings?.imageUrl}
                            availableIcons={launcherButton.iconSettings?.availableIcons || []}
                            onChange={(val) => {
                                if (val.startsWith('http') || val.startsWith('data:') || val.startsWith('/api/')) {
                                    onUpdate('launcher', 'launcherButton', 'iconSettings.type', 'custom');
                                    onUpdate('launcher', 'launcherButton', 'iconSettings.imageUrl', val);
                                    onUpdate('launcher', 'launcherButton', 'iconSettings.icon', '');
                                } else {
                                    onUpdate('launcher', 'launcherButton', 'iconSettings.type', 'icon');
                                    onUpdate('launcher', 'launcherButton', 'iconSettings.icon', val);
                                }
                            }}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Color"
                                component="launcher"
                                block="launcherButton"
                                fieldKey="iconSettings.color"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={launcherButton.iconSettings?.color}
                            onChange={(val) => onUpdate('launcher', 'launcherButton', 'iconSettings.color', val)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});

export default LauncherButtonBlock;
