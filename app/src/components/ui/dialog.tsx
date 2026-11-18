import * as D from '@radix-ui/react-dialog'
import * as A from '@radix-ui/react-alert-dialog'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'
import { Button } from './index'
import { cn } from '@/lib/utils'

export function Dialog({ open, onOpenChange, title, children, wide }: { open: boolean; onOpenChange: (o: boolean) => void; title: string; children: ReactNode; wide?: boolean }) {
  return (
    <D.Root open={open} onOpenChange={onOpenChange}>
      <D.Portal>
        <D.Overlay className="fixed inset-0 z-40 bg-black/60 backdrop-blur-sm anim-fade" />
        <D.Content
          aria-describedby={undefined}
          className={cn(
            'fixed z-50 bg-card border border-line shadow-2xl outline-none flex flex-col',
            'inset-x-0 bottom-0 max-h-[92dvh] rounded-t-3xl anim-up',
            'md:inset-auto md:left-1/2 md:top-1/2 md:-translate-x-1/2 md:-translate-y-1/2 md:rounded-3xl md:w-full md:anim-pop',
            wide ? 'md:max-w-2xl' : 'md:max-w-lg',
          )}>
          <div className="flex items-center justify-between px-5 pt-5 pb-3 shrink-0">
            <D.Title className="text-lg font-bold">{title}</D.Title>
            <D.Close asChild><Button variant="ghost" size="sm" aria-label="Закрыть" className="size-9 px-0"><X size={20} /></Button></D.Close>
          </div>
          <div className="overflow-y-auto px-5 pb-6 safe-b">{children}</div>
        </D.Content>
      </D.Portal>
    </D.Root>
  )
}

export function Confirm({ open, onOpenChange, title, text, confirmLabel = 'Удалить', onConfirm }: {
  open: boolean; onOpenChange: (o: boolean) => void; title: string; text: string; confirmLabel?: string; onConfirm: () => void
}) {
  return (
    <A.Root open={open} onOpenChange={onOpenChange}>
      <A.Portal>
        <A.Overlay className="fixed inset-0 z-[60] bg-black/60 backdrop-blur-sm anim-fade" />
        <A.Content className="fixed z-[70] left-1/2 top-1/2 -translate-x-1/2 -translate-y-1/2 w-[calc(100%-2rem)] max-w-sm rounded-3xl bg-card border border-line p-6 shadow-2xl anim-pop outline-none">
          <A.Title className="text-lg font-bold">{title}</A.Title>
          <A.Description className="text-sm text-muted mt-2">{text}</A.Description>
          <div className="flex gap-3 mt-6">
            <A.Cancel asChild><Button className="flex-1">Отмена</Button></A.Cancel>
            <A.Action asChild><Button variant="danger" className="flex-1" onClick={onConfirm}>{confirmLabel}</Button></A.Action>
          </div>
        </A.Content>
      </A.Portal>
    </A.Root>
  )
}
