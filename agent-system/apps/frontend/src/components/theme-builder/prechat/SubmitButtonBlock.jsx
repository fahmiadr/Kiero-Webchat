import React, { memo } from 'react';
import ColorPickerField from '../shared/ColorPickerField';
import TextInputField from '../shared/TextInputField';
import SettingHeader from '../shared/SettingHeader';
import IconOptionGroup from '../shared/IconOptionGroup';

const SubmitButtonBlock = memo(({ submitButton, onUpdate }) => {
    if (!submitButton) return null;

    const iconSettings = submitButton.iconSettings || {};
    const textSettings = submitButton.textSettings || {};

    /** Helper to update a nested settings group */
    const updateGroup = (groupKey, field, value) => {
        onUpdate('preChatForm', 'submitButton', `${groupKey}.${field}`, value);
    };

    return (
        <div className="space-y-4">
            <SettingHeader
                type="block"
                label="Submit Button"
                component="preChatForm"
                block="submitButton"
            />

            <div className="space-y-6 pt-2">
                {/* Background & Hover Colors */}
                <div className="flex flex-col gap-y-2">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Background Color"
                                component="preChatForm"
                                block="submitButton"
                                fieldKey="backgroundColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={submitButton.backgroundColor}
                            onChange={(val) => onUpdate('preChatForm', 'submitButton', 'backgroundColor', val)}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Hover Color"
                                component="preChatForm"
                                block="submitButton"
                                fieldKey="hoverColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={submitButton.hoverColor}
                            onChange={(val) => onUpdate('preChatForm', 'submitButton', 'hoverColor', val)}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Active Color"
                                component="preChatForm"
                                block="submitButton"
                                fieldKey="activeColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={submitButton.activeColor}
                            onChange={(val) => onUpdate('preChatForm', 'submitButton', 'activeColor', val)}
                        />
                    </div>
                </div>

                {/* Icon Settings Container */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="block"
                        isSubBlock
                        label="Icon Settings"
                        component="preChatForm"
                        block="submitButton"
                        fieldKey="iconSettings"
                    />
                    <div>
                        <SettingHeader
                            type="field"
                            label="Icon"
                            component="preChatForm"
                            block="submitButton"
                            fieldKey={['iconSettings.type', 'iconSettings.icon', 'iconSettings.imageUrl']}
                        />
                        <IconOptionGroup
                            value={iconSettings.type === 'custom' ? iconSettings.imageUrl : iconSettings.icon}
                            customImage={iconSettings.imageUrl}
                            availableIcons={iconSettings.availableIcons || []}
                            onChange={(val) => {
                                if (val.startsWith('http') || val.startsWith('data:') || val.startsWith('/api/')) {
                                    onUpdate('preChatForm', 'submitButton', 'iconSettings.type', 'custom');
                                    onUpdate('preChatForm', 'submitButton', 'iconSettings.imageUrl', val);
                                    onUpdate('preChatForm', 'submitButton', 'iconSettings.icon', '');
                                } else {
                                    onUpdate('preChatForm', 'submitButton', 'iconSettings.type', 'icon');
                                    onUpdate('preChatForm', 'submitButton', 'iconSettings.icon', val);
                                }
                            }}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Icon Color"
                                component="preChatForm"
                                block="submitButton"
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

                {/* Text Settings Container */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="block"
                        isSubBlock
                        label="Text Settings"
                        component="preChatForm"
                        block="submitButton"
                        fieldKey="textSettings"
                    />
                    <div className="space-y-2">
                        <SettingHeader
                            type="field"
                            label="Text"
                            component="preChatForm"
                            block="submitButton"
                            fieldKey={['textSettings.text', 'textSettings.fontWeight', 'textSettings.fontSize', 'textSettings.fontSizeUnit', 'textSettings.italic']}
                        />
                        <TextInputField
                            value={textSettings.text}
                            onChange={(val) => updateGroup('textSettings', 'text', val)}
                            settings={textSettings}
                            onSettingsChange={(newSettings) => onUpdate('preChatForm', 'submitButton', 'textSettings', newSettings)}
                        />
                    </div>
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Text Color"
                                component="preChatForm"
                                block="submitButton"
                                fieldKey="textSettings.color"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={textSettings.color}
                            onChange={(val) => updateGroup('textSettings', 'color', val)}
                        />
                    </div>
                </div>
            </div>
        </div>
    );
});

SubmitButtonBlock.displayName = 'SubmitButtonBlock';

export default SubmitButtonBlock;
