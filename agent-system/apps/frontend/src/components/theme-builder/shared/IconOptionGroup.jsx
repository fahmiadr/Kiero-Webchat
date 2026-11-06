import React, { memo, useRef } from 'react';
import {
    MessageSquare,
    MessageCircle,
    HelpCircle,
    Smile,
    Plus,
    MessageSquareMore,
    MessageSquareText,
    MessagesSquare,
    MessageCircleMore,
    Headphones,
    Zap,
    Sparkles,
    Send,
    Minus,
    X,
    ChevronDown,
    ArrowDown,
    Shrink,
    ArrowRight,
    ChevronRight,
    Play,
    Check,
    Rocket,
    UserPlus
} from 'lucide-react';
import OptionGroup from './OptionGroup';
import { Input } from '@/components/ui/input';

/**
 * A specialized option group for selecting launcher icons.
 * Includes a set of default icons and a "Custom" upload option.
 * 
 * @param {string} value - Current selected icon ID or data URL
 * @param {Array} availableIcons - Array of { id, label } from the theme config
 * @param {Function} onChange - Callback when an icon is selected or uploaded
 */
const IconOptionGroup = memo(({ value, customImage, availableIcons = [], onChange }) => {
    const fileInputRef = useRef(null);

    // Map string IDs to actual Lucide React components for rendering preview
    const lucideIconMap = {
        'message-square': MessageSquare,
        'message-square-more': MessageSquareMore,
        'message-square-text': MessageSquareText,
        'messages-square': MessagesSquare,
        'message-circle': MessageCircle,
        'message-circle-more': MessageCircleMore,
        'headphones': Headphones,
        'help-circle': HelpCircle,
        'smile': Smile,
        'zap': Zap,
        'sparkles': Sparkles,
        'send': Send,
        'minus': Minus,
        'x': X,
        'chevron-down': ChevronDown,
        'arrow-down': ArrowDown,
        'shrink': Shrink,
        'arrow-right': ArrowRight,
        'chevron-right': ChevronRight,
        'play': Play,
        'check': Check,
        'rocket': Rocket,
        'user-plus': UserPlus,
    };

    const handleFileChange = (e) => {
        const file = e.target.files?.[0];
        if (file) {
            const reader = new FileReader();
            reader.onload = (event) => {
                const dataUrl = event.target.result;
                onChange(dataUrl);
            };
            reader.readAsDataURL(file);
        }
    };

    const isCustom = !availableIcons.find(icon => icon.id === value);

    const options = [
        ...availableIcons.map(iconConfig => {
            const IconComp = lucideIconMap[iconConfig.id] || MessageCircle;
            return {
                id: iconConfig.id,
                label: iconConfig.label,
                renderPreview: (active) => (
                    <div className="flex items-center justify-center w-full h-full relative">
                        <IconComp className={`w-6 h-6 transition-colors duration-200 ${active ? 'text-blue-500' : 'text-slate-400'}`} />
                    </div>
                )
            };
        }),
        {
            id: 'custom',
            label: 'Custom',
            renderPreview: (active) => {
                const isActive = isCustom || active;
                const displayImage = isCustom ? value : customImage;
                return (
                    <div className="flex items-center justify-center w-full h-full relative group/custom cursor-pointer">
                        {displayImage ? (
                            <img
                                src={displayImage}
                                alt="Custom"
                                className="w-8 h-8 object-contain transition-opacity duration-200"
                                onError={(e) => {
                                    e.target.style.display = 'none';
                                    e.target.nextSibling.style.display = 'block';
                                }}
                            />
                        ) : (
                            <Plus className={`w-6 h-6 transition-colors duration-200 ${isActive ? 'text-blue-500' : 'text-slate-400 group-hover/custom:text-slate-200'}`} />
                        )}
                        <div className="absolute inset-0 z-10" onClick={(e) => {
                            e.stopPropagation();
                            if (customImage && !isCustom) {
                                // Just switch back to existing custom image
                                onChange(customImage);
                            } else {
                                // Upload new
                                fileInputRef.current?.click();
                            }
                        }} />
                    </div>
                );
            }
        }
    ];

    return (
        <div className="space-y-4">
            <OptionGroup
                value={isCustom ? 'custom' : value}
                options={options}
                onChange={(id) => {
                    if (id !== 'custom') {
                        onChange(id);
                    } else {
                        if (customImage && !isCustom) {
                            onChange(customImage);
                        } else {
                            fileInputRef.current?.click();
                        }
                    }
                }}
                gridClassName="grid-cols-4 gap-2"
                buttonClassName="aspect-square"
                showLabel={false}
            />
            <Input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleFileChange}
            />
        </div>
    );
});

IconOptionGroup.displayName = 'IconOptionGroup';

export default IconOptionGroup;
