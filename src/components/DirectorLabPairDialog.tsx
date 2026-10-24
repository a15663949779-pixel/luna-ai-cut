import { useEffect, useRef, useState } from 'react'
import QRCode from 'qrcode'

import { Button, Dialog, LoadingIndicator, toast } from '../ui'
import './DirectorLabPairDialog.css'

interface Props {
  open: boolean
  onOpenChange: (open: boolean) => void
  onPaired: (endpoint: string) => Promise<boolean>
}

export function DirectorLabPairDialog({ open, onOpenChange, onPaired }: Props) {
  const [qrDataUrl, setQrDataUrl] = useState<string | null>(null)
  const [pairing, setPairing] = useState(false)
  const [error, setError] = useState('')
  const onOpenChangeRef = useRef(onOpenChange)
  const onPairedRef = useRef(onPaired)

  useEffect(() => {
    onOpenChangeRef.current = onOpenChange
    onPairedRef.current = onPaired
  }, [onOpenChange, onPaired])

  useEffect(() => {
    if (!open) return
    let cancelled = false
    let sessionId: string | null = null
    setQrDataUrl(null)
    setPairing(false)
    setError('')

    const beginPairing = async (): Promise<void> => {
      const session = await window.luna.lunaKaHttpClient.createQrPairing()
      sessionId = session.session_id
      if (cancelled) {
        await window.luna.lunaKaHttpClient.cancelQrPairing(sessionId)
        return
      }
      const image = await QRCode.toDataURL(JSON.stringify(session), {
        width: 288,
        margin: 3,
        errorCorrectionLevel: 'M',
      })
      if (cancelled) {
        await window.luna.lunaKaHttpClient.cancelQrPairing(sessionId)
        return
      }
      setQrDataUrl(image)

      const result = await window.luna.lunaKaHttpClient.waitQrPairing(sessionId)
      if (cancelled) return
      setPairing(true)
      const connected = await onPairedRef.current(result.endpoint)
      if (!connected) throw new Error('配对完成，但手机暂时无法连接')
      toast.success('配对成功')
      onOpenChangeRef.current(false)
    }

    void beginPairing().catch((reason: unknown) => {
      if (cancelled) return
      setError(reason instanceof Error ? reason.message : '配对失败')
    })

    return () => {
      cancelled = true
      if (sessionId) void window.luna.lunaKaHttpClient.cancelQrPairing(sessionId)
    }
  }, [open])

  return <Dialog
    open={open}
    onOpenChange={onOpenChange}
    title="配对手机"
    tone="dark"
    className="director-lab-pair-dialog"
    bodyClassName="director-lab-pair-dialog-body"
    closeOnMaskClick={!pairing}
    showCloseButton={!pairing}
    footer={<Button variant="secondary" disabled={pairing} onClick={() => onOpenChange(false)}>
      {pairing ? '正在连接' : '取消'}
    </Button>}
  >
    <div className="director-lab-pair-content">
      <div className="director-lab-pair-code">
        {qrDataUrl
          ? <img src={qrDataUrl} alt="手机扫码配对二维码" width={240} height={240} />
          : <LoadingIndicator />}
      </div>
      <p className="director-lab-pair-hint">使用手机“局域网访问授权”扫描此二维码</p>
      {pairing && <p className="director-lab-pair-hint">正在与手机建立连接</p>}
      {error && <p className="director-lab-pair-error" role="alert">{error}</p>}
    </div>
  </Dialog>
}
