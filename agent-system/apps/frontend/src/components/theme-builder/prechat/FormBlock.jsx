import React, { memo } from 'react';
import ColorPickerField from '../shared/ColorPickerField';
import SettingHeader from '../shared/SettingHeader';

const PreChatFormBlock = memo(({ formConfig, onUpdate }) => {
    if (!formConfig) return null;

    const { activeState = {} } = formConfig;

    return (
        <div className="space-y-4">
            <SettingHeader
                type="block"
                label="Form"
                component="preChatForm"
                block="form"
            />

            <div className="space-y-6 pt-2">
                {/* Global Form Settings (Top-level) */}
                <div className="flex flex-col gap-y-2">
                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Label Color"
                                component="preChatForm"
                                block="form"
                                fieldKey="labelColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={formConfig.labelColor}
                            onChange={(val) => onUpdate('preChatForm', 'form', 'labelColor', val)}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Form Color"
                                component="preChatForm"
                                block="form"
                                fieldKey="formColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={formConfig.formColor}
                            onChange={(val) => onUpdate('preChatForm', 'form', 'formColor', val)}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Background Color"
                                component="preChatForm"
                                block="form"
                                fieldKey="bgColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={formConfig.bgColor}
                            onChange={(val) => onUpdate('preChatForm', 'form', 'bgColor', val)}
                        />
                    </div>

                    <div className="flex items-center justify-between gap-4">
                        <div className="flex-1 min-w-0">
                            <SettingHeader
                                type="field"
                                label="Border Color"
                                component="preChatForm"
                                block="form"
                                fieldKey="borderColor"
                            />
                        </div>
                        <ColorPickerField
                            className="h-8 w-32 shrink-0"
                            value={formConfig.borderColor}
                            onChange={(val) => onUpdate('preChatForm', 'form', 'borderColor', val)}
                        />
                    </div>
                </div>

                {/* Active States (Sub-block) */}
                <div className="rounded-md border border-slate-600 p-4 space-y-4">
                    <SettingHeader
                        type="block"
                        isSubBlock
                        label="Active States"
                        component="preChatForm"
                        block="form"
                        fieldKey="activeState"
                    />
                    <div className="flex flex-col gap-y-2">
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader
                                    type="field"
                                    label="Background Color"
                                    component="preChatForm"
                                    block="form"
                                    fieldKey="activeState.backgroundColor"
                                />
                            </div>
                            <ColorPickerField
                                className="h-8 w-32 shrink-0"
                                value={activeState.backgroundColor}
                                onChange={(val) => onUpdate('preChatForm', 'form', 'activeState.backgroundColor', val)}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader
                                    type="field"
                                    label="Border Color"
                                    component="preChatForm"
                                    block="form"
                                    fieldKey="activeState.borderColor"
                                />
                            </div>
                            <ColorPickerField
                                className="h-8 w-32 shrink-0"
                                value={activeState.borderColor}
                                onChange={(val) => onUpdate('preChatForm', 'form', 'activeState.borderColor', val)}
                            />
                        </div>
                        <div className="flex items-center justify-between gap-4">
                            <div className="flex-1 min-w-0">
                                <SettingHeader
                                    type="field"
                                    label="Ring Color"
                                    component="preChatForm"
                                    block="form"
                                    fieldKey="activeState.ringColor"
                                />
                            </div>
                            <ColorPickerField
                                className="h-8 w-32 shrink-0"
                                value={activeState.ringColor}
                                onChange={(val) => onUpdate('preChatForm', 'form', 'activeState.ringColor', val)}
                            />
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
});

PreChatFormBlock.displayName = 'PreChatFormBlock';

export default PreChatFormBlock;
