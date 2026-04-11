"use client"

/**
 * ConfirmDialog — substituto de ConfirmModal baseado em shadcn AlertDialog.
 *
 * Mantém a mesma API do ConfirmModal legado para facilitar a migração:
 *   isOpen, onClose, onConfirm, title, message, confirmText, cancelText, variant
 *
 * O AlertDialog do Radix UI é semanticamente correto para diálogos de confirmação:
 *   - usa role="alertdialog" automaticamente
 *   - o Cancel tem autoFocus por padrão (opção mais segura)
 *   - Escape chama Cancel (não fecha direto para evitar cancelamento acidental)
 */

import * as React from "react"
import { AlertTriangle } from "lucide-react"
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog"
import { cn } from "@/lib/utils"

export interface ConfirmDialogProps {
  isOpen: boolean
  onClose: () => void
  onConfirm: () => void
  title: string
  message: React.ReactNode
  confirmText?: string
  cancelText?: string
  variant?: "danger" | "primary"
}

export function ConfirmDialog({
  isOpen,
  onClose,
  onConfirm,
  title,
  message,
  confirmText = "Confirmar",
  cancelText = "Cancelar",
  variant = "danger",
}: ConfirmDialogProps) {
  return (
    <AlertDialog open={isOpen} onOpenChange={(open) => !open && onClose()}>
      <AlertDialogContent className="max-w-sm">
        <AlertDialogHeader className="items-center text-center sm:text-center">
          <div
            className={cn(
              "w-12 h-12 rounded-full flex items-center justify-center mb-2",
              variant === "danger"
                ? "bg-red-100 text-red-600 dark:bg-red-900/20 dark:text-red-400"
                : "bg-primary/10 text-primary"
            )}
            aria-hidden="true"
          >
            <AlertTriangle size={24} />
          </div>
          <AlertDialogTitle className="font-display">{title}</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div>{message}</div>
          </AlertDialogDescription>
        </AlertDialogHeader>

        <AlertDialogFooter className="sm:justify-center gap-3">
          <AlertDialogCancel onClick={onClose}>{cancelText}</AlertDialogCancel>
          <AlertDialogAction
            onClick={() => {
              onConfirm()
              onClose()
            }}
            className={cn(
              variant === "danger"
                ? "bg-red-600 hover:bg-red-500 focus:ring-red-500 text-white"
                : undefined
            )}
          >
            {confirmText}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
