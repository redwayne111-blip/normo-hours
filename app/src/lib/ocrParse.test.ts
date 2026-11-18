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
    expect(r.plate).toBe('А123ВС777')
  })
  it('находит AW, часы, сумму', () => {
    expect(r.aw100).toBe(13600)
    expect(r.hours100).toBe(1133)
    expect(r.earningsKop).toBe(738900)
  })
  it('выбирает только строки работ', () => {
    expect(r.jobs.map((j) => j.title)).toEqual(['Замена обеих передних амортизационных стоек', 'Регулировка углов установки колёс', 'Шиномонтаж до 19R'])
  })
  it('ненайденное остаётся пустым', () => {
    const e = parseOrderText('просто шум')
    expect(e.number).toBeUndefined()
    expect(e.aw100).toBeUndefined()
    expect(e.plate).toBeUndefined()
  })
})

describe('сервисный заказ дилера (таблица с AW)', () => {
  const text = `Сертифиц. центр BMW M
Официальный дилер BMW
Заказ Номер : 87654321
Заказ Но. : 87654321
Марка BSP Контракт Номер
Модель VIN
Е456КХ777
BMW
X7 WBA21EN0709W27606 64 324
SERV009 РЕГУЛИРОВКА УГЛОВ УСТАНОВКИ КОЛЕС AW 1,00 23 303,03 22,00 0,00 6 981,82
SERV002 МОЙКА/УБОРКА ПОДКАПОТНОГО ПРОСТРАНСТВА AW 1,00 10 351,41 22,00 0,00 3 500,00
SERV021 Разработка рулевых тяг AW 1,00 62 621,13 22,00 0,00 38 534,68
33306760349 Гайка с буртиком самоконтрящаяся (мин. парт. 10шт) шт 2,00 195,89 22,00 0,00 391,78
Всего RUB 127 566,02`
  const r = parseOrderText(text)
  it('номер, авто, госномер', () => {
    expect(r.number).toBe('87654321')
    expect(r.brand).toBe('BMW')
    expect(r.model).toBe('X7')
    expect(r.plate).toBe('Е456КХ777')
  })
  it('сумма AW по строкам работ, без цены клиента', () => {
    expect(r.aw100).toBe(9500)
    expect(r.earningsKop).toBeUndefined()
    expect(r.jobs).toEqual([
      { title: 'Регулировка углов установки колес', aw100: 2300 },
      { title: 'Мойка/уборка подкапотного пространства', aw100: 1000 },
      { title: 'Разработка рулевых тяг', aw100: 6200 },
    ])
  })
})

describe('шум распознавания в строках таблицы', () => {
  it('убирает обрывки колонок и коды строк', () => {
    const r = parseOrderText(`ia , SERVOO02 МОМКА/УВОРКА ПОДКАПОТНОГО ПРОСТРАНСТВА
wa. | SERV021 Разработка рулевых тяг`)
    expect(r.jobs.map((j) => j.title)).toEqual(['Момка/уворка подкапотного пространства', 'Разработка рулевых тяг'])
  })
})
