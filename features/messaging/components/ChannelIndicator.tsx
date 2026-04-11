'use client';

import React, { memo } from 'react';
import {
  MessageSquare,
  Instagram,
  Mail,
  Phone,
  Send,
  Mic,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import type { ChannelType } from '@/lib/messaging/types';

interface ChannelIndicatorProps {
  type: ChannelType;
  size?: 'sm' | 'md' | 'lg';
  showLabel?: boolean;
  className?: string;
}

export const CHANNEL_CONFIG: Record<
  ChannelType,
  {
    icon: React.FC<{ className?: string }>;
    color: string;
    label: string;
  }
> = {
  whatsapp: {
    icon: MessageSquare,
    color: 'bg-green-500',
    label: 'WhatsApp',
  },
  instagram: {
    icon: Instagram,
    color: 'bg-gradient-to-br from-purple-500 to-pink-500',
    label: 'Instagram',
  },
  email: {
    icon: Mail,
    color: 'bg-blue-500',
    label: 'Email',
  },
  sms: {
    icon: Phone,
    color: 'bg-yellow-500',
    label: 'SMS',
  },
  telegram: {
    icon: Send,
    color: 'bg-sky-500',
    label: 'Telegram',
  },
  voice: {
    icon: Mic,
    color: 'bg-slate-500',
    label: 'Voz',
  },
};

const SIZE_CONFIG = {
  sm: {
    container: 'w-4 h-4',
    icon: 'w-2.5 h-2.5',
    text: 'text-xs',
  },
  md: {
    container: 'w-6 h-6',
    icon: 'w-3.5 h-3.5',
    text: 'text-sm',
  },
  lg: {
    container: 'w-8 h-8',
    icon: 'w-4 h-4',
    text: 'text-base',
  },
};

export const ChannelIndicator = memo(function ChannelIndicator({
  type,
  size = 'md',
  showLabel = false,
  className,
}: ChannelIndicatorProps) {
  const config = CHANNEL_CONFIG[type] || CHANNEL_CONFIG.whatsapp;
  const sizeConfig = SIZE_CONFIG[size];
  const Icon = config.icon;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div
        className={cn(
          'rounded-full flex items-center justify-center',
          config.color,
          sizeConfig.container
        )}
      >
        <Icon className={cn('text-white', sizeConfig.icon)} />
      </div>
      {showLabel && (
        <span
          className={cn(
            'font-medium text-slate-700 dark:text-slate-300',
            sizeConfig.text
          )}
        >
          {config.label}
        </span>
      )}
    </div>
  );
});

export default ChannelIndicator;
