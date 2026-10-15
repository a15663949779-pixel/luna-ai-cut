/**
 * 全局弹窗层级栈。
 *
 * 层级按当前打开顺序分配，后打开的弹窗始终位于栈顶。弹窗关闭后重新
 * 计算剩余层级，避免层级值随使用次数不断增长。
 */

const active: string[] = []
const listeners = new Set<() => void>()
let nextId = 0

function notify(): void {
  for (const listener of listeners) listener()
}

/** 注册弹窗并返回唯一标识。 */
export function acquireIndex(): string {
  const id = `modal_${Date.now()}_${nextId++}`
  active.push(id)
  notify()
  return id
}

/** 注销弹窗。 */
export function releaseIndex(id: string): void {
  const index = active.indexOf(id)
  if (index < 0) return
  active.splice(index, 1)
  notify()
}

/** 获取弹窗当前在栈中的序号。 */
export function indexOf(id: string | null): number | null {
  if (!id) return null
  const index = active.indexOf(id)
  return index < 0 ? null : index
}

/** 订阅层级栈变化。 */
export function subscribe(listener: () => void): () => void {
  listeners.add(listener)
  return () => listeners.delete(listener)
}

/** 计算遮罩层 z-index：基础值 40 + 栈序号 * 10。 */
export function overlayZ(zIndex: number): number {
  return 40 + zIndex * 10
}

/** 计算内容层 z-index：遮罩层 + 10。 */
export function contentZ(zIndex: number): number {
  return overlayZ(zIndex) + 10
}
