import { forwardRef, useCallback, useEffect, useState } from 'react'
import { Dialog as RadixDialog } from 'radix-ui'
import { X } from 'lucide-react'
import type { ReactNode } from 'react'

import { contentZ, overlayZ } from './zIndexManager'
import { useModalZIndex } from './useModalZIndex'

/* ═══════════════════════════════════════════════
   全局 Dialog 栈 — Cmd+W / Ctrl+W 只关闭最上层 Dialog
   每个 Dialog 打开时注册关闭回调，关闭时注销。
   确保嵌套/平铺多个 Dialog 时只关最上面那个。
   ═══════════════════════════════════════════════ */
const closeStack: Array<() => void> = []

if (typeof document !== 'undefined') {
  document.addEventListener('keydown', (e) => {
    if (!(e.metaKey || e.ctrlKey) || e.code !== 'KeyW') return
    e.preventDefault()
    closeStack[closeStack.length - 1]?.()
  })
}

/* ==================== Sub-components (internal, not exported) ==================== */

const DialogOverlay = forwardRef<HTMLDivElement, RadixDialog.DialogOverlayProps & { style?: React.CSSProperties }>(
  function DialogOverlay({ style, ...props }, ref) {
    return <RadixDialog.Overlay ref={ref} className="ui-dialog-overlay" style={style} {...props} />
  },
)

function DialogHeader({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ui-dialog-header ${className ?? ''}`}>{children}</div>
}

function DialogFooter({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={`ui-dialog-footer ${className ?? ''}`}>{children}</div>
}

/* ==================== Unified Dialog ==================== */

export interface DialogProps {
  open?: boolean
  onOpenChange?: (open: boolean) => void
  defaultOpen?: boolean
  /** 触发按钮（未受控模式） */
  trigger?: ReactNode
  /** 弹窗标题 */
  title?: ReactNode
  headerActions?: ReactNode
  /** 弹窗描述 */
  description?: ReactNode
  /** 主体内容 */
  children?: ReactNode
  bodyClassName?: string
  /** 底部操作栏 */
  footer?: ReactNode
  /** DialogContent 自定义类名 */
  className?: string
  /**
   * 视觉变体：
   * - `'dialog'`（默认）：居中弹窗，带标题/描述/底部操作栏/关闭按钮
   * - `'fullscreen'`：全屏弹窗，由内容自行管理布局（用于 PreviewModal）
   */
  variant?: 'dialog' | 'fullscreen'
  /** 主体色调；工作台弹窗统一使用 dark。 */
  tone?: 'default' | 'dark'
  /**
   * 点击遮罩层（蒙层）是否关闭弹窗
   * @default true
   */
  closeOnMaskClick?: boolean
  /** 是否使用模态交互；关闭后可继续操作弹窗外的画面。 */
  modal?: boolean
  /** 是否显示页面遮罩。 */
  showOverlay?: boolean
  /** 是否显示右上角关闭按钮。 */
  showCloseButton?: boolean
}

export function Dialog({
  open,
  onOpenChange,
  defaultOpen,
  trigger,
  title,
  headerActions,
  description,
  children,
  bodyClassName,
  footer,
  className,
  variant = 'dialog',
  tone = 'default',
  closeOnMaskClick = true,
  modal = true,
  showOverlay = true,
  showCloseButton = true,
}: DialogProps) {
  const [internalOpen, setInternalOpen] = useState(defaultOpen ?? false)
  const isOpen = open ?? internalOpen
  const changeOpen = useCallback((nextOpen: boolean) => {
    if (open === undefined) setInternalOpen(nextOpen)
    onOpenChange?.(nextOpen)
  }, [open, onOpenChange])
  const zIndex = useModalZIndex(isOpen)

  // Cmd+W / Ctrl+W 关闭最上层 Dialog
  // 通过全局 closeStack 注册/注销关闭回调，确保嵌套场景只关顶层
  useEffect(() => {
    if (!isOpen) return
    const close = () => changeOpen(false)
    closeStack.push(close)
    return () => {
      const idx = closeStack.indexOf(close)
      if (idx >= 0) closeStack.splice(idx, 1)
    }
  }, [isOpen, changeOpen])

  const oZ = overlayZ(zIndex)
  const cZ = contentZ(zIndex)
  const isFullscreen = variant === 'fullscreen'

  return (
    <RadixDialog.Root open={isOpen} onOpenChange={changeOpen} modal={modal}>
      {trigger && <RadixDialog.Trigger asChild>{trigger}</RadixDialog.Trigger>}
      <RadixDialog.Portal>
        {showOverlay && <DialogOverlay style={{ zIndex: oZ }} />}
        <RadixDialog.Content
          className={`ui-dialog-content ${isFullscreen ? 'ui-dialog-fullscreen' : ''} ${tone === 'dark' ? 'ui-dialog-dark' : ''} ${className ?? ''}`}
          style={{ zIndex: cZ }}
          onInteractOutside={(event) => {
            const target = event.target
            if (target instanceof Element && target.closest('.ui-select-content')) {
              event.preventDefault()
              return
            }
            if (!closeOnMaskClick) event.preventDefault()
          }}
        >
          {!isFullscreen && (title || description || headerActions) && (
            <DialogHeader>
              {headerActions ? <div className="ui-dialog-header-row">
                {title && <RadixDialog.Title className="ui-dialog-title">{title}</RadixDialog.Title>}
                {headerActions}
              </div> : title && <RadixDialog.Title className="ui-dialog-title">{title}</RadixDialog.Title>}
              {description && <RadixDialog.Description className="ui-dialog-description">{description}</RadixDialog.Description>}
            </DialogHeader>
          )}
          {isFullscreen ? children : children != null && (
            <div className={`ui-dialog-body ${bodyClassName ?? ''}`}>{children}</div>
          )}
          {!isFullscreen && footer && <DialogFooter>{footer}</DialogFooter>}
          {!isFullscreen && showCloseButton && (
            <RadixDialog.Close asChild>
              <button className="ui-dialog-close" aria-label="关闭">
                <X size={18} />
              </button>
            </RadixDialog.Close>
          )}
        </RadixDialog.Content>
      </RadixDialog.Portal>
    </RadixDialog.Root>
  )
}
