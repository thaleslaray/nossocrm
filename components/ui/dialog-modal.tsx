"use client"

/**
 * DialogModal — wrapper sobre shadcn Dialog com a mesma API do Modal legado.
 *
 * Use este componente para novos usos em vez de `components/ui/Modal.tsx`.
 * A API é intencionalmente compatível com Modal para facilitar futuras migrações.
 *
 * Props:
 *   isOpen       — controla visibilidade (substitui open/onOpenChange do Dialog)
 *   onClose      — callback ao fechar (Escape, overlay click, botão X)
 *   title        — texto exibido no DialogTitle (obrigatório para acessibilidade)
 *   children     — conteúdo do corpo do modal
 *   footer       — conteúdo opcional do rodapé (renderizado fora do scroll body)
 *   size         — largura máxima: 'sm' | 'md' | 'lg' | 'xl' (default: 'md')
 *   className    — classes extras para o DialogContent
 *   bodyClassName — classes extras para o wrapper do children
 *   hideCloseButton — oculta o botão X padrão do shadcn Dialog (default: false)
 */

import * as React from "react"
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog"
import { cn } from "@/lib/utils"

const sizeClasses = {
  sm: "max-w-sm",
  md: "max-w-md",
  lg: "max-w-lg",
  xl: "max-w-xl",
} as const

export interface DialogModalProps {
  isOpen: boolean
  onClose: () => void
  title: string
  children: React.ReactNode
  footer?: React.ReactNode
  size?: keyof typeof sizeClasses
  className?: string
  bodyClassName?: string
  hideCloseButton?: boolean
}

export function DialogModal({
  isOpen,
  onClose,
  title,
  children,
  footer,
  size = "md",
  className,
  bodyClassName,
  hideCloseButton = false,
}: DialogModalProps) {
  return (
    <Dialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <DialogContent
        className={cn(
          sizeClasses[size],
          "flex flex-col max-h-[calc(90dvh-2rem)] overflow-hidden p-0",
          // Hide the default shadcn close button when requested
          hideCloseButton && "[&>button:last-of-type]:hidden",
          className
        )}
      >
        <DialogHeader className="px-4 py-3 sm:px-5 sm:py-4 border-b border-border shrink-0">
          <DialogTitle className="text-base sm:text-lg font-bold font-display">
            {title}
          </DialogTitle>
        </DialogHeader>

        <div className={cn("flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-5", bodyClassName)}>
          {children}
        </div>

        {footer && (
          <DialogFooter className="px-4 py-3 sm:px-5 sm:py-4 border-t border-border shrink-0 bg-background">
            {footer}
          </DialogFooter>
        )}
      </DialogContent>
    </Dialog>
  )
}
