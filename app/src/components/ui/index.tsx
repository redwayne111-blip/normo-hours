import { forwardRef, type ButtonHTMLAttributes, type HTMLAttributes, type InputHTMLAttributes, type ReactNode, type SelectHTMLAttributes, type TextareaHTMLAttributes } from 'react'
import { cva, type VariantProps } from 'class-variance-authority'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'inline-flex items-center justify-center gap-2 rounded-2xl font-semibold transition duration-150 active:scale-[.97] disabled:opacity-50 disabled:pointer-events-none focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent',
  {
    variants: {
      variant: {
        primary: 'btn-primary hover:brightness-105',
        secondary: 'surface hover:border-line-strong',
        ghost: 'hover:bg-fg/5 text-muted hover:text-fg',
        danger: 'bg-danger/10 text-danger border border-danger/25 hover:bg-danger/20',
      },
      size: { sm: 'h-9 px-3 text-sm', md: 'h-11 px-4', lg: 'h-14 px-5 text-[17px]' },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> {}
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, type = 'button', ...p }, ref) => (
  <button ref={ref} type={type} className={cn(buttonVariants({ variant, size }), className)} {...p} />
))

export const Card = ({ className, ...p }: HTMLAttributes<HTMLDivElement>) => (
  <div className={cn('rounded-3xl surface', className)} {...p} />
)

const fieldBase = 'w-full rounded-2xl bg-sec/80 border border-line px-3.5 text-fg placeholder:text-muted/60 outline-none transition focus:border-accent/70 focus:bg-sec focus:ring-4 focus:ring-accent/15'
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
      <span className="block text-xs font-semibold text-muted mb-1.5 tracking-wide">{label}</span>
      {children}
      {error ? <span className="block text-xs text-danger mt-1">{error}</span> : hint ? <span className="block text-xs text-muted mt-1">{hint}</span> : null}
    </label>
  )
}

export function Badge({ className, ...p }: HTMLAttributes<HTMLSpanElement>) {
  return <span className={cn('inline-flex items-center rounded-full px-3 py-1 text-sm font-extrabold', className)} {...p} />
}

export function Segmented<T extends string>({ value, onChange, options, className }: { value: T; onChange: (v: T) => void; options: { value: T; label: string }[]; className?: string }) {
  return (
    <div className={cn('flex gap-1 rounded-2xl bg-sec/90 border border-line p-1', className)} role="tablist">
      {options.map((o) => (
        <button key={o.value} role="tab" aria-selected={value === o.value} onClick={() => onChange(o.value)}
          className={cn('flex-1 h-10 rounded-xl text-sm font-semibold transition duration-200', value === o.value ? 'bg-elev text-fg shadow-md shadow-black/20 border border-line-strong' : 'text-muted hover:text-fg border border-transparent')}>
          {o.label}
        </button>
      ))}
    </div>
  )
}

export function Empty({ icon, title, text, action }: { icon: ReactNode; title: string; text?: string; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-center text-center py-12 px-6 text-muted anim-fade">
      <div className="size-16 rounded-3xl surface grid place-items-center mb-4 text-accent [&_svg]:size-7">{icon}</div>
      <div className="text-fg font-bold text-lg">{title}</div>
      {text && <div className="text-sm mt-1 max-w-xs">{text}</div>}
      {action && <div className="mt-4">{action}</div>}
    </div>
  )
}
