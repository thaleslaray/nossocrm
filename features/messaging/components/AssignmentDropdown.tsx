'use client';

/**
 * @fileoverview Conversation Assignment Dropdown
 *
 * Dropdown para atribuir uma conversa a um membro da organização.
 * Usa Radix DropdownMenu com lista de membros e opção "Não atribuído".
 *
 * @module features/messaging/components/AssignmentDropdown
 */

import React from 'react';
import { UserCircle, Check } from 'lucide-react';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
  DropdownMenuSeparator,
} from '@/components/ui/dropdown-menu';
import { useOrgMembersQuery } from '@/lib/query/hooks/useOrgMembersQuery';
import { useAssignConversation } from '@/lib/query/hooks/useConversationsQuery';

interface AssignmentDropdownProps {
  conversationId: string;
  assignedUserId?: string | null;
}

export function AssignmentDropdown({
  conversationId,
  assignedUserId,
}: AssignmentDropdownProps) {
  const { data: members } = useOrgMembersQuery();
  const assignMutation = useAssignConversation();

  const assignedMember = members?.find((m) => m.id === assignedUserId);

  const handleAssign = (userId: string | null) => {
    if (userId === (assignedUserId ?? null)) return;
    assignMutation.mutate({ conversationId, userId });
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button
          type="button"
          className="p-2 text-slate-400 hover:text-slate-600 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/5 rounded-lg transition-colors flex items-center gap-1.5"
          title={assignedMember ? `Atribuído a ${assignedMember.name}` : 'Atribuir conversa'}
        >
          <UserCircle className="w-5 h-5" />
          {assignedMember && (
            <span className="text-xs font-medium text-slate-600 dark:text-slate-300 max-w-[80px] truncate hidden sm:inline">
              {assignedMember.name}
            </span>
          )}
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56">
        <DropdownMenuItem
          onClick={() => handleAssign(null)}
          className="gap-2"
        >
          <div className="w-4 h-4 flex items-center justify-center">
            {!assignedUserId && <Check className="w-3.5 h-3.5 text-primary-500" />}
          </div>
          <span className="text-slate-500">Não atribuído</span>
        </DropdownMenuItem>
        <DropdownMenuSeparator />
        {members?.map((member) => (
          <DropdownMenuItem
            key={member.id}
            onClick={() => handleAssign(member.id)}
            className="gap-2"
          >
            <div className="w-4 h-4 flex items-center justify-center">
              {assignedUserId === member.id && (
                <Check className="w-3.5 h-3.5 text-primary-500" />
              )}
            </div>
            {member.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
