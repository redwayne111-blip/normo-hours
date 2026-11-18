import { describe, expect, it } from 'vitest'
import { parseOrderText } from './ocrParse'

describe('разбор текста заказ-наряда', () => {
  const text = `Заказ-наряд № 12345678
BMW 3 серии, A123BC777
Замена обеих передних амортизационных стоек
Регулировка углов установки колёс
Шиномонтаж до 19R
Итого 136 AW
11,33 ч
7 389 ₽`
  const r = parseOrderText(text)
  it('находит номер, авто и госномер', () => {
    expect(r.number).toBe('12345678')
    expect(r.brand).toBe('BMW')
    expect(r.model).toBe('3 серии')
    expect(r.plate).toBe('A123BC777')
  })
  it('находит AW, часы, сумму', () => {
    expect(r.aw100).toBe(13600)
    expect(r.hours100).toBe(1133)
    expect(r.earningsKop).toBe(738900)
  })
  it('выбирает только строки работ', () => {
    expect(r.jobs).toEqual(['Замена обеих передних амортизационных стоек', 'Регулировка углов установки колёс', 'Шиномонтаж до 19R'])
  })
  it('ненайденное остаётся пустым', () => {
    const e = parseOrderText('просто шум')
    expect(e.number).toBeUndefined()
    expect(e.aw100).toBeUndefined()
    expect(e.plate).toBeUndefined()
  })
})
