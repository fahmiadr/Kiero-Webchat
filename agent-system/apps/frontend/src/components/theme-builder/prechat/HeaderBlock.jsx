import React, { memo } from 'react';
import ColorPickerField from '../shared/ColorPickerField';
import TextInputField from '../shared/TextInputField';
import SettingHeader from '../shared/SettingHeader';
import IconOptionGroup from '../shared/IconOptionGroup';

const HeaderBlock = memo(({ header, onUpdate }) => {
    if (!header) return null;

    const iconSettings = header.iconSettings || {};
    const titleSettings = header.titleSettings || {};
    const subtitleSettings = header.subtitleSettings || {};
    const buttonSettings = header.buttonSettings || {};

    /** Helper to update a nested settings group */
    const updateGroup = (groupKey, field, value) => {
        onUpdate('preChatForm', 'header', `${groupKey}.${field}`, value);
    };

    return (
        <div className="space-y-4">
            <SettingHeader
                type="block"
                label="Header"
                component="preChatForm"
                block="header"
            />

            <div className="space-y-6 pt-2">
                {/* Background Color is Global/Top-level to Header */}
                <div className="flex items-center justify-between gap-4">
                    <div className="flex-1 min-w-0">
                        <SettingHeader
                            type="field"
                            label="Background Color"
                            component="preChatForm"
                            block="header"
                            fieldKey="backgroundColor"
                        />
                    </div>
                    <ColorPickerField
                        className="h-8 w-32 shrink-0"
                        value={header.backgroundColor}
                        onChange={(val) => onUpdate('preChatForm', 'header', 'backgroundColor', val)}
                    />
                </div>

                {/* Icon Settings Container */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="block"
                        isSubBlock
                        label="Icon Settings"
                        component="preChatForm"
                        block="header"
                        fieldKey="iconSettings"
                    />
                    <div>
                        <SettingHeader
                            type="field"
                            label="Icon"
                            component="preChatForm"
                            block="header"
                            fieldKey={['iconSettings.type', 'iconSettings.icon', 'iconSettings.imageUrl']}
                        />
                        <IconOptionGroup
                            value={iconSettings.type === 'custom' ? iconSettings.imageUrl : iconSettings.icon}
                            customImage={iconSettings.imageUrl}
                            availableIcons={iconSettings.availableIcons || []}
                            onChange={(val) => {
                                if (val.startsWith('http') || val.startsWith('data:') || val.startsWith('/api/')) {
                                    onUpdate('preChatForm', 'header', 'iconSettings.type', 'custom');
                                    onUpdate('preChatForm', 'header', 'iconSettings.imageUrl', val);
                                    onUpdate('preChatForm', 'header', 'iconSettings.icon', '');
                                } else {
                                    onUpdate('preChatForm', 'header', 'iconSettings.type', 'icon');
                                    onUpdate('preChatForm', 'header', 'iconSettings.icon', val);
                                }
                            }}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Color"
                                component="preChatForm"
                                block="header"
                                fieldKey="iconSettings.color"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={iconSettings.color}
                            onChange={(val) => updateGroup('iconSettings', 'color', val)}
                        />
                    </div>
                </div>

                {/* Title Settings Container */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="block"
                        isSubBlock
                        label="Title Settings"
                        component="preChatForm"
                        block="header"
                        fieldKey="titleSettings"
                    />
                    <div className="space-y-2">
                        <SettingHeader
                            type="field"
                            label="Title"
                            component="preChatForm"
                            block="header"
                            fieldKey={['titleSettings.text', 'titleSettings.fontWeight', 'titleSettings.fontSize', 'titleSettings.fontSizeUnit', 'titleSettings.italic']}
                        />
                        <TextInputField
                            value={titleSettings.text}
                            onChange={(val) => updateGroup('titleSettings', 'text', val)}
                            settings={titleSettings}
                            onSettingsChange={(newSettings) => onUpdate('preChatForm', 'header', 'titleSettings', newSettings)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader
                                    type="field"
                                    label="Color"
                                    component="preChatForm"
                                    block="header"
                                    fieldKey="titleSettings.color"
                                />
                            </div>
                            <ColorPickerField
                                className="h-8 w-32 shrink-0"
                                value={titleSettings.color}
                                onChange={(val) => updateGroup('titleSettings', 'color', val)}
                            />
                        </div>
                    </div>
                </div>

                {/* Subtitle Settings Container */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="block"
                        isSubBlock
                        label="Subtitle Settings"
                        component="preChatForm"
                        block="header"
                        fieldKey="subtitleSettings"
                    />
                    <div className="space-y-2">
                        <SettingHeader
                            type="field"
                            label="Subtitle"
                            component="preChatForm"
                            block="header"
                            fieldKey={['subtitleSettings.text', 'subtitleSettings.fontWeight', 'subtitleSettings.fontSize', 'subtitleSettings.fontSizeUnit', 'subtitleSettings.italic']}
                        />
                        <TextInputField
                            value={subtitleSettings.text}
                            onChange={(val) => updateGroup('subtitleSettings', 'text', val)}
                            settings={subtitleSettings}
                            onSettingsChange={(newSettings) => onUpdate('preChatForm', 'header', 'subtitleSettings', newSettings)}
                        />
                    </div>
                    <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader
                                    type="field"
                                    label="Color"
                                    component="preChatForm"
                                    block="header"
                                    fieldKey="subtitleSettings.color"
                                />
                            </div>
                            <ColorPickerField
                                className="h-8 w-32 shrink-0"
                                value={subtitleSettings.color}
                                onChange={(val) => updateGroup('subtitleSettings', 'color', val)}
                            />
                        </div>
                    </div>
                </div>

                {/* Button Settings Container */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="block"
                        isSubBlock
                        label="Button Settings"
                        component="preChatForm"
                        block="header"
                        fieldKey="buttonSettings"
                    />

                    <div>
                        <SettingHeader
                            type="field"
                            label="Button Icon"
                            component="preChatForm"
                            block="header"
                            fieldKey={['buttonSettings.type', 'buttonSettings.icon', 'buttonSettings.imageUrl']}
                        />
                        <IconOptionGroup
                            value={buttonSettings.type === 'custom' ? buttonSettings.imageUrl : buttonSettings.icon}
                            customImage={buttonSettings.imageUrl}
                            availableIcons={buttonSettings.availableIcons || []}
                            onChange={(val) => {
                                if (val.startsWith('http') || val.startsWith('data:') || val.startsWith('/api/')) {
                                    onUpdate('preChatForm', 'header', 'buttonSettings.type', 'custom');
                                    onUpdate('preChatForm', 'header', 'buttonSettings.imageUrl', val);
                                    onUpdate('preChatForm', 'header', 'buttonSettings.icon', '');
                                } else {
                                    onUpdate('preChatForm', 'header', 'buttonSettings.type', 'icon');
                                    onUpdate('preChatForm', 'header', 'buttonSettings.icon', val);
                                }
                            }}
                        />
                    </div>

                    <div className="grid gap-2">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader type="field" label="Icon Color" component="preChatForm" block="header" fieldKey="buttonSettings.color" />
                            </div>
                            <ColorPickerField className="h-8 w-32 shrink-0" value={buttonSettings.color} onChange={(val) => updateGroup('buttonSettings', 'color', val)} />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader type="field" label="Background Color" component="preChatForm" block="header" fieldKey="buttonSettings.backgroundColor" />
                            </div>
                            <ColorPickerField className="h-8 w-32 shrink-0" value={buttonSettings.backgroundColor} onChange={(val) => updateGroup('buttonSettings', 'backgroundColor', val)} />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader type="field" label="Hover Color" component="preChatForm" block="header" fieldKey="buttonSettings.hoverColor" />
                            </div>
                            <ColorPickerField className="h-8 w-32 shrink-0" value={buttonSettings.hoverColor} onChange={(val) => updateGroup('buttonSettings', 'hoverColor', val)} />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader type="field" label="Active Color" component="preChatForm" block="header" fieldKey="buttonSettings.activeColor" />
                            </div>
                            <ColorPickerField className="h-8 w-32 shrink-0" value={buttonSettings.activeColor} onChange={(val) => updateGroup('buttonSettings', 'activeColor', val)} />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

export default HeaderBlock;
