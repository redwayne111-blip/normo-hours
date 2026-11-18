import { useEffect, useState } from 'react'
import { useStore } from '@/store'

export function Photo({ id, className, onClick }: { id: string | null; className?: string; onClick?: () => void }) {
  const { repo } = useStore()
  const [url, setUrl] = useState<string | null>(null)
  useEffect(() => {
    let u: string | null = null
    let alive = true
    if (id) repo.getPhoto(id).then((b) => { if (alive && b) { u = URL.createObjectURL(b); setUrl(u) } }).catch(() => {})
    return () => { alive = false; if (u) URL.revokeObjectURL(u) }
  }, [id, repo])
  if (!id || !url) return null
  return <img src={url} alt="Заказ-наряд" className={className} onClick={onClick} />
}
