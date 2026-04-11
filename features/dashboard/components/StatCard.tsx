import React from 'react';
import { TrendingUp, TrendingDown } from 'lucide-react';
import { cn } from '@/lib/utils/cn';

export type StatCardVariant = 'primary' | 'success' | 'warning' | 'danger' | 'info' | 'purple' | 'neutral';

// Semantic color config — uses CSS variable tokens (via Tailwind bridge in tailwind.config.js)
// Eliminates the need for a colorToHex lookup map
const variantConfig: Record<StatCardVariant, {
    glowClass: string;
    iconBg: string;
    iconColor: string;
}> = {
    primary: { glowClass: 'bg-primary-500', iconBg: 'bg-primary-500/10', iconColor: 'text-primary-500' },
    success:  { glowClass: 'bg-emerald-500', iconBg: 'bg-success-bg', iconColor: 'text-success-text' },
    warning:  { glowClass: 'bg-orange-500',  iconBg: 'bg-warning-bg',  iconColor: 'text-warning-text' },
    danger:   { glowClass: 'bg-red-500',     iconBg: 'bg-error-bg',    iconColor: 'text-error-text' },
    info:     { glowClass: 'bg-blue-500',    iconBg: 'bg-info-bg',     iconColor: 'text-info-text' },
    purple:   { glowClass: 'bg-purple-500',  iconBg: 'bg-purple-500/10', iconColor: 'text-purple-500' },
    neutral:  { glowClass: 'bg-slate-500',   iconBg: 'bg-slate-100 dark:bg-white/10', iconColor: 'text-slate-500' },
};

interface StatCardProps {
    title: string;
    value: string;
    subtext: string;
    subtextPositive?: boolean;
    icon: React.ElementType;
    /** Semantic variant — replaces the old `color` string prop */
    variant?: StatCardVariant;
    /**
     * @deprecated Use `variant` instead.
     * Kept for backward compatibility during migration.
     */
    color?: string;
    onClick?: () => void;
    comparisonLabel?: string;
}

// Fallback: map legacy color class → variant (for gradual migration)
const colorToVariant: Record<string, StatCardVariant> = {
    'bg-blue-500': 'info',
    'bg-cyan-500': 'info',
    'bg-indigo-500': 'info',
    'bg-purple-500': 'purple',
    'bg-pink-500': 'purple',
    'bg-emerald-500': 'success',
    'bg-green-500': 'success',
    'bg-teal-500': 'success',
    'bg-orange-500': 'warning',
    'bg-amber-500': 'warning',
    'bg-yellow-500': 'warning',
    'bg-red-500': 'danger',
};

export const StatCard: React.FC<StatCardProps> = ({
    title,
    value,
    subtext,
    subtextPositive = true,
    icon: Icon,
    variant,
    color,
    onClick,
    comparisonLabel = 'vs período anterior',
}) => {
    // Resolve variant: explicit > legacy color mapping > default
    const resolvedVariant: StatCardVariant =
        variant ?? (color ? (colorToVariant[color] ?? 'primary') : 'primary');

    const config = variantConfig[resolvedVariant];
    const TrendIcon = subtextPositive ? TrendingUp : TrendingDown;

    return (
        <div
            onClick={onClick}
            className={cn(
                'glass p-6 rounded-xl border border-slate-200 dark:border-white/5 shadow-sm relative overflow-hidden group',
                onClick && 'cursor-pointer hover:border-primary-500/50 transition-colors'
            )}
        >
            {/* Background glow */}
            <div
                className={cn(
                    'absolute top-0 right-0 p-20 rounded-full blur-3xl opacity-10 -mr-10 -mt-10 transition-opacity group-hover:opacity-20',
                    config.glowClass
                )}
                aria-hidden="true"
            />

            <div className="flex justify-between items-start relative z-10">
                <div>
                    <p className="text-sm font-medium text-slate-500 dark:text-slate-400 mb-1 font-display">
                        {title}
                    </p>
                    <p className="text-3xl font-bold text-slate-900 dark:text-white font-display tracking-tight">
                        {value}
                    </p>
                </div>

                {/* Icon container — uses semantic CSS var classes instead of inline styles */}
                <div className={cn('p-3 rounded-xl ring-1 ring-inset ring-white/10', config.iconBg)}>
                    <Icon
                        size={20}
                        className={config.iconColor}
                        strokeWidth={2}
                        aria-hidden="true"
                    />
                </div>
            </div>

            <p className="text-xs text-slate-500 mt-3 flex items-center gap-1 relative z-10">
                <span className={cn(
                    'px-1.5 py-0.5 rounded text-xs font-bold flex items-center gap-1',
                    subtextPositive
                        ? 'bg-success-bg text-success-text'
                        : 'bg-error-bg text-error-text'
                )}>
                    <TrendIcon size={10} strokeWidth={2} aria-hidden="true" />
                    {subtext}
                </span>
                <span className="ml-1 dark:text-slate-500">{comparisonLabel}</span>
            </p>
        </div>
    );
};
