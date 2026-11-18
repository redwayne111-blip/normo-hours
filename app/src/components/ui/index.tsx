import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-xl font-semibold transition active:scale-[.98] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-white shadow-lg shadow-accent/20 hover:brightness-110',
        secondary: 'bg-card border border-line hover:brightness-125',
        ghost: 'hover:bg-sec/70 text-muted hover:text-fg',
        danger: 'bg-danger/15 text-danger hover:bg-danger/25',
      },
      size: { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4', lg: 'h-14 px-5 text-base' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...p }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...p} />
))

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-2xl bg-card border border-line shadow-sm shadow-black/10', className)} {...p} />
)

const fieldBase = 'w-full rounded-xl bg-sec border border-line px-3 text-fg placeholder:text-muted/60 outline-none transition focus:border-accent focus:ring-2 focus:ring-accent/25'
export const Input = forwardRef<HTMLInputElement, InputHTMLAttributes<HTMLInputElement>>(({ className, ...p }, ref) => (
  <input ref={ref} className={cn(fieldBase, 'h-11', className)} {...p} />
))
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaHTMLAttributes<HTMLTextAreaElement>>(({ className, ...p }, ref) => (
  <textarea ref={ref} className={cn(fieldBase, 'py-2.5 min-h-24', className)} {...p} />
))
export const Select = forwardRef<HTMLSelectElement, SelectHTMLAttributes<HTMLSelectElement>>(({ className, ...p }, ref) => (
  <select ref={ref} className={cn(fieldBase, 'h-11', className)} {...p} />
))

export function Field({ label, error, hint, children, className }: { label: string; error?: string; hint?: string; children: ReactNode; className?: string }) {
  return (
    <label className={cn('block', className)}>
      <span className="block text-xs font-medium text-muted mb-1.5">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger mt-1">{error}</span> : hint ? <span className="block text-xs text-muted mt-1">{hint}</span> : null}
    </label>
  )
}

export function Badge({ className, ...p }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-sm font-bold', className)} {...p} />
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div className={cn('flex gap-1 rounded-2xl bg-sec p-1.5', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('flex-1 h-10 rounded-xl text-sm font-semibold transition', value === o.value ? 'bg-card text-fg shadow border border-line' : 'text-muted hover:text-fg')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6 text-muted anim-fade">
      <div className="size-14 rounded-2xl bg-card border border-line grid place-items-center mb-4 text-accent">{icon}</div>
      <div className="text-fg font-semibold">{title}</div>
      {text && <div className="text-sm mt-1 max-w-xs">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
