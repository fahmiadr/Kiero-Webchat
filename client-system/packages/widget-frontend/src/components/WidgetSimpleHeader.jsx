import { ArrowDown, ChevronDown, Minus, Shrink, X } from 'lucide-react';
import { memo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { buildFontStyle } from '@/utils/fontUtils';

/**
 * WidgetSimpleHeader - Standardized header for non-chat views (PreChat, Error, Rating)
 * Features:
 * - Consistent gradient and layout with ChatWindow/Header
 * - Minimize/Close button support
 * - Mobile responsive padding
 */

// Map icon IDs to Lucide components for header buttons
const headerButtonIconMap = {
  minus: Minus,
  x: X,
  'chevron-down': ChevronDown,
  'arrow-down': ArrowDown,
  shrink: Shrink,
};
const WidgetSimpleHeader = memo(
  ({ title, subtitle, icon, onClose, isMobile, variant = 'default', theme = {} }) => {
    const [isBtnHovered, setIsBtnHovered] = useState(false);
    const [isBtnActive, setIsBtnActive] = useState(false);

    const iconCfg = variant === 'default' ? theme.iconSettings || {} : { color: '#FFFFFF' };
    const titleCfg =
      variant === 'default'
        ? theme.titleSettings || {}
        : {
            color: '#FFFFFF',
            fontWeight: 'font-semibold',
            fontSize: 14,
            fontSizeUnit: 'px',
            italic: false,
          };
    const subtitleCfg =
      variant === 'default'
        ? theme.subtitleSettings || {}
        : {
            color: '#FFFFFFCC',
            fontWeight: 'font-medium',
            fontSize: 11,
            fontSizeUnit: 'px',
            italic: false,
          };
    const btnCfg =
      variant === 'default'
        ? theme.buttonSettings || {}
        : {
            icon: 'minus',
            type: 'icon',
            imageUrl: '',
            color: '#FFFFFF',
            backgroundColor: '#FFFFFF1A',
            hoverColor: '#FFFFFF33',
            activeColor: '#FFFFFF4D',
          };

    const headerBg =
      variant === 'default'
        ? theme.backgroundColor
        : 'linear-gradient(to right, #EF4444, #DC2626, #E11D48)';

    // Resolve button icon
    const ButtonIconComponent = headerButtonIconMap[btnCfg.icon] || Minus;
    const resolvedButtonIcon =
      btnCfg.type === 'custom' && btnCfg.imageUrl ? (
        <img src={btnCfg.imageUrl} alt="Close" className="h-5 w-5 rounded-full object-cover" />
      ) : (
        <ButtonIconComponent className="h-5 w-5" />
      );

    return (
      <div
        style={{ background: headerBg }}
        className={`flex shrink-0 items-center justify-between px-4 py-3 shadow-md ${isMobile ? 'pt-[max(12px,env(safe-area-inset-top))]' : 'rounded-t-xl'}`}
      >
        <div className="flex items-center gap-3">
          {/* Optional Icon */}
          {icon && (
            <div
              style={{ color: iconCfg.color }}
              className="flex h-8 w-8 items-center justify-center rounded-full border border-white/20 bg-white/10 shadow-sm backdrop-blur-md"
            >
              {icon}
            </div>
          )}

          {/* Title & Subtitle */}
          <div className="flex flex-col">
            {title && (
              <h3
                className="leading-tight tracking-wide"
                style={{
                  color: titleCfg.color,
                  ...buildFontStyle(titleCfg),
                }}
              >
                {title}
              </h3>
            )}
            {subtitle && (
              <span
                style={{
                  color: subtitleCfg.color,
                  ...buildFontStyle(subtitleCfg),
                }}
              >
                {subtitle}
              </span>
            )}
          </div>
        </div>

        {/* Minimize Button */}
        <Tooltip delayDuration={0}>
          <TooltipTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              type="button"
              onClick={onClose}
              onMouseEnter={() => setIsBtnHovered(true)}
              onMouseLeave={() => {
                setIsBtnHovered(false);
                setIsBtnActive(false);
              }}
              onMouseDown={() => setIsBtnActive(true)}
              onMouseUp={() => setIsBtnActive(false)}
              style={{
                color: btnCfg.color,
                backgroundColor: isBtnActive
                  ? btnCfg.activeColor
                  : isBtnHovered
                    ? btnCfg.hoverColor
                    : btnCfg.backgroundColor,
              }}
              className="h-8 w-8 rounded-full backdrop-blur-sm transition-all duration-200"
              aria-label="Minimize"
            >
              {resolvedButtonIcon}
            </Button>
          </TooltipTrigger>
          <TooltipContent>Minimalkan</TooltipContent>
        </Tooltip>
      </div>
    );
  },
);

export default WidgetSimpleHeader;
